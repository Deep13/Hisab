sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, MessageBox) {
    "use strict";

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
        if (!this.byId("idBalMonth").getSelectedKey()) {
          this.byId("idBalMonth").setSelectedKey(("0" + (oNow.getMonth() + 1)).slice(-2));
          this.byId("idBalYear").setSelectedKey(oNow.getFullYear().toString());
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

      onClientChange: function (oEvent) {
        var oItem = oEvent.getParameter("selectedItem");
        if (!oItem) {
          return;
        }
        this._loadLedger(oItem.getKey());
      },

      _loadLedger: function (sClient) {
        var that = this;
        sap.ui.core.BusyIndicator.show(0);
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getClientLedger", data: JSON.stringify({ client: sClient }) },
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
        var totalBilled = 0;
        var totalPaid = 0;

        res.rows = (res.rows || []).map(function (r) {
          totalBilled += r.billed;
          totalPaid += r.paid;
          r.monthLabel = MONTH_NAMES[r.month - 1] + " " + r.year;
          r.billedText = money(r.billed);
          r.paidText = money(r.paid);
          r.balanceText = money(r.balance);
          r.balanceState = balanceState(r.balance);
          return r;
        });
        res.payments = (res.payments || []).map(function (p) {
          p.amountText = money(p.amount);
          return p;
        });

        res.openingText = money(res.opening);
        res.billedText = money(totalBilled);
        res.paidText = money(totalPaid);
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

        var bOnlyDues = this.byId("idOnlyDues").getSelected();
        var visible = bOnlyDues
          ? rows.filter(function (r) { return r.balance !== 0; })
          : rows;

        var oModel = new JSONModel({ all: rows, visible: visible });
        oModel.setSizeLimit(2000);
        this.getView().setModel(oModel, "balanceModel");

        var total = visible.reduce(function (s, r) { return s + r.balance; }, 0);
        this.byId("idBalanceTitle").setText(
          "Client Balances (" + visible.length + ")  -  Total " + money(total)
        );
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
          html += '<h2>Balance Due: ' + d.balanceText + '</h2>';
          html += '<table><tr><th>Month</th><th class="num">Billed</th><th class="num">Paid</th>'
            + '<th class="num">Balance</th></tr>';
          html += '<tr><td>Opening</td><td class="num">-</td><td class="num">-</td>'
            + '<td class="num">' + d.openingText + '</td></tr>';
          (d.rows || []).forEach(function (r) {
            html += '<tr><td>' + esc(r.monthLabel) + '</td><td class="num">' + r.billedText
              + '</td><td class="num">' + r.paidText + '</td><td class="num">' + r.balanceText + '</td></tr>';
          });
          html += '<tr class="total"><td>Total</td><td class="num">' + d.billedText
            + '</td><td class="num">' + d.paidText + '</td><td class="num">' + d.balanceText + '</td></tr>';
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
