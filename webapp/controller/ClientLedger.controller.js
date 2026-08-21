sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "sap/ui/model/Sorter",
  ],
  function (Controller, JSONModel, MessageBox, Fragment, Sorter) {
    "use strict";

    // Everything except the client name sorts as a number.
    var NUMERIC_SORT_KEYS = ["od", "billed", "paid", "balance"];

    var MONTH_NAMES = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
    ];

    function money(n) {
      return (parseFloat(n) || 0).toLocaleString("en-IN");
    }

    // A negative balance means the client has paid ahead.
    function balanceState(n) {
      if (n > 0) { return "Error"; }
      if (n < 0) { return "Success"; }
      return "None";
    }

    return Controller.extend("Hisab.Hisab.controller.ClientLedger", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("ClientLedger")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        var oNow = new Date();
        var sMonth = ("0" + (oNow.getMonth() + 1)).slice(-2);
        var sYear = oNow.getFullYear().toString();
        if (!this.byId("idBalMonth").getSelectedKey()) {
          this.byId("idBalMonth").setSelectedKey(sMonth);
          this.byId("idBalYear").setSelectedKey(sYear);
        }
        if (!this.byId("idLedgerMonth").getSelectedKey()) {
          this.byId("idLedgerMonth").setSelectedKey(sMonth);
          this.byId("idLedgerYear").setSelectedKey(sYear);
        }
        this._loadClients();
      },

      onpressBack: function () {
        this.oRouter.navTo("Main");
      },

      onTabSelect: function (oEvent) {
        if (oEvent.getParameter("key") === "all" &&
            !this.getView().getModel("balanceModel")) {
          this._loadBalances();
        }
      },

      _loadClients: function () {
        var that = this;
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getAllClients" },
          dataType: "json",
          success: function (clients) {
            var oModel = new JSONModel({ Clients_results: clients || [] });
            oModel.setSizeLimit(1000);
            that.getView().setModel(oModel, "ClientModel");
          },
        });
      },

      // ==================== ONE CLIENT ====================

      // Picking a client no longer fetches anything - the client, month and
      // year are chosen first and only this button goes to the server.
      onShowLedger: function () {
        var sClient = this.byId("idLedgerClient").getSelectedKey();
        if (!sClient) {
          MessageBox.information("Pick a client first");
          return;
        }
        this._loadLedger(
          sClient,
          parseInt(this.byId("idLedgerMonth").getSelectedKey(), 10),
          parseInt(this.byId("idLedgerYear").getSelectedKey(), 10)
        );
      },

      _loadLedger: function (sClient, iMonth, iYear) {
        var that = this;
        sap.ui.core.BusyIndicator.show(0);
        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "getClientLedger",
            data: JSON.stringify({ client: sClient, month: iMonth, year: iYear }),
          },
          dataType: "json",
          success: function (res) {
            sap.ui.core.BusyIndicator.hide();
            if (!res || res.status !== "success") {
              MessageBox.error((res && res.error) || "Could not load the ledger");
              return;
            }
            that._setLedgerModel(res);
          },
          error: function (request) {
            sap.ui.core.BusyIndicator.hide();
            MessageBox.error("Could not load the ledger: " + request.responseText);
          },
        });
      },

      _setLedgerModel: function (res) {
        res.payments = (res.payments || []).map(function (p) {
          p.amountText = money(p.amount);
          return p;
        });

        res.periodLabel = MONTH_NAMES[res.month - 1] + " " + res.year;
        res.paymentsTitle = "Payments Received (" + res.payments.length + ")";
        res.odText = money(res.od);
        res.odState = balanceState(res.od);
        res.billedText = money(res.billed);
        res.paidText = money(res.paid);
        res.balanceText = money(res.balance);
        res.balanceState = balanceState(res.balance);

        var oModel = new JSONModel(res);
        oModel.setSizeLimit(1000);
        this.getView().setModel(oModel, "ledgerModel");
      },

      // ==================== ALL CLIENTS ====================

      onBalancePeriodChange: function () {
        this._loadBalances();
      },

      _loadBalances: function () {
        var that = this;
        var sMonth = this.byId("idBalMonth").getSelectedKey();
        var sYear = this.byId("idBalYear").getSelectedKey();
        if (!sMonth || !sYear) {
          return;
        }

        sap.ui.core.BusyIndicator.show(0);
        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "getClientBalances",
            data: JSON.stringify({ month: parseInt(sMonth, 10), year: parseInt(sYear, 10) }),
          },
          dataType: "json",
          success: function (res) {
            sap.ui.core.BusyIndicator.hide();
            if (!res || res.status !== "success") {
              MessageBox.error((res && res.error) || "Could not load balances");
              return;
            }
            that._setBalanceModel(res.rows || []);
          },
          error: function (request) {
            sap.ui.core.BusyIndicator.hide();
            MessageBox.error("Could not load balances: " + request.responseText);
          },
        });
      },

      _setBalanceModel: function (rows) {
        rows = rows.map(function (r) {
          r.odText = money(r.od);
          r.billedText = money(r.billed);
          r.paidText = money(r.paid);
          r.balanceText = money(r.balance);
          r.balanceState = balanceState(r.balance);
          return r;
        });

        var oModel = new JSONModel({ all: rows, visible: rows });
        oModel.setSizeLimit(2000);
        this.getView().setModel(oModel, "balanceModel");

        this._applyBalanceFilters();
        // A new model means a new binding, so the chosen order has to be put
        // back on it or changing the month would silently reset the sort.
        this._applyBalanceSorter();
      },

      // The search box and the dues-only checkbox narrow the same list, so both
      // are applied together against the untouched `all` copy.
      onSearchBalances: function () {
        this._applyBalanceFilters();
      },

      _applyBalanceFilters: function () {
        var oModel = this.getView().getModel("balanceModel");
        if (!oModel) {
          return;
        }
        var sQuery = (this.byId("idBalanceSearch").getValue() || "").trim().toLowerCase();
        var bOnlyDues = this.byId("idOnlyDues").getSelected();

        var visible = (oModel.getProperty("/all") || []).filter(function (r) {
          if (bOnlyDues && r.balance === 0) {
            return false;
          }
          return !sQuery || r.client.toLowerCase().indexOf(sQuery) > -1;
        });
        oModel.setProperty("/visible", visible);

        var total = visible.reduce(function (s, r) { return s + r.balance; }, 0);
        this.byId("idBalanceTitle").setText(
          "Client Balances (" + visible.length + ")  -  Total " + money(total)
        );
      },

      onSortBalances: function () {
        var that = this;
        if (this._pBalanceSort) {
          this._pBalanceSort.then(function (oDialog) {
            oDialog.open();
          });
          return;
        }
        this._pBalanceSort = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.ClientBalanceSort",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      onBalanceSortConfirm: function (oEvent) {
        var oItem = oEvent.getParameter("sortItem");
        if (!oItem) {
          return;
        }
        this._sBalanceSortKey = oItem.getKey();
        this._bBalanceSortDesc = oEvent.getParameter("sortDescending");
        this._applyBalanceSorter();
      },

      _applyBalanceSorter: function () {
        if (!this._sBalanceSortKey) {
          return;
        }
        var oBinding = this.byId("idBalanceTable").getBinding("items");
        if (!oBinding) {
          return;
        }
        var oSorter = new Sorter(this._sBalanceSortKey, this._bBalanceSortDesc);
        if (NUMERIC_SORT_KEYS.indexOf(this._sBalanceSortKey) > -1) {
          oSorter.fnCompare = function (a, b) {
            return (parseFloat(a) || 0) - (parseFloat(b) || 0);
          };
        }
        oBinding.sort(oSorter);
      },

      // ==================== PRINT ====================

      onPrintLedger: function () {
        var bAll = this.byId("idLedgerTabs").getSelectedKey() === "all";
        var oModel = this.getView().getModel(bAll ? "balanceModel" : "ledgerModel");
        if (!oModel) {
          MessageBox.information("Nothing to print yet");
          return;
        }

        var esc = function (t) {
          return String(t == null ? "" : t)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Client Ledger</title>';
        html += '<style>';
        html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
        html += 'body { font-family: "72", Arial, Helvetica, sans-serif; color: #32363a; padding: 30px; }';
        html += 'h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }';
        html += 'h2 { text-align: center; font-size: 15px; font-weight: normal; color: #6a6d70; margin-bottom: 20px; }';
        html += 'table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 14px; }';
        html += 'th { background: #f2f2f2; border: 1px solid #bbb; padding: 7px 9px; text-align: left; }';
        html += 'td { border: 1px solid #bbb; padding: 5px 9px; }';
        html += 'th.num, td.num { text-align: right; }';
        html += '.total td { font-weight: bold; background: #f2f2f2; }';
        html += '</style></head><body>';

        if (bAll) {
          var rows = oModel.getProperty("/visible") || [];
          html += '<h1>Client Balances</h1>';
          html += '<h2>' + esc(this.byId("idBalMonth").getSelectedItem().getText()) + ' ' +
            esc(this.byId("idBalYear").getSelectedKey()) + '</h2>';
          html += '<table><tr><th>Client</th><th class="num">OD</th><th class="num">Billed</th>'
            + '<th class="num">Paid</th><th class="num">Balance</th></tr>';
          var t = 0;
          rows.forEach(function (r) {
            t += r.balance;
            html += '<tr><td>' + esc(r.client) + '</td><td class="num">' + r.odText
              + '</td><td class="num">' + r.billedText + '</td><td class="num">' + r.paidText
              + '</td><td class="num">' + r.balanceText + '</td></tr>';
          });
          html += '<tr class="total"><td colspan="4">Total</td><td class="num">' + money(t) + '</td></tr>';
          html += '</table>';
        } else {
          var d = oModel.getData();
          html += '<h1>' + esc(d.client) + '</h1>';
          html += '<h2>' + esc(d.periodLabel) + '</h2>';
          html += '<table><tr><th class="num">OD</th><th class="num">Billed</th>'
            + '<th class="num">Paid</th><th class="num">Balance</th></tr>';
          html += '<tr class="total"><td class="num">' + d.odText + '</td><td class="num">' + d.billedText
            + '</td><td class="num">' + d.paidText + '</td><td class="num">' + d.balanceText + '</td></tr>';
          html += '</table>';

          html += '<h2 style="text-align:left;margin:18px 0 8px">' + esc(d.paymentsTitle) + '</h2>';
          html += '<table><tr><th>Date</th><th>Remark</th><th class="num">Amount</th></tr>';
          (d.payments || []).forEach(function (p) {
            html += '<tr><td>' + esc(p.date) + '</td><td>' + esc(p.note)
              + '</td><td class="num">' + p.amountText + '</td></tr>';
          });
          html += '</table>';
        }

        html += '</body></html>';

        var w = window.open('', '_blank');
        if (!w) {
          MessageBox.error("Please allow pop-ups for this site to print");
          return;
        }
        w.document.write(html);
        w.document.close();
        w.focus();
        w.onload = function () { w.print(); };
      },
    });
  }
);
