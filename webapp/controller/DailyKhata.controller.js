sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
  ],
  function (Controller, JSONModel, MessageBox, MessageToast, Fragment) {
    "use strict";

    // Machine expenses are not a plain debit row: they are stored in the
    // Machine Expenses data, so the entry form asks for office and machine.
    var CREDIT_CATEGORIES = [
      { key: "client_payment", label: "Payment by Client" },
      { key: "thaktha_bhara", label: "Payment Thaktha Bhara" },
      { key: "other", label: "Others" },
    ];

    var DEBIT_CATEGORIES = [
      { key: "churi", label: "Churi" },
      { key: "buff_paper", label: "Buff Paper" },
      { key: "mobil", label: "Mobil" },
      { key: "machine_expense", label: "Machine Expenses" },
      { key: "bhussi", label: "Bhussi" },
      { key: "v_belt", label: "V-Belt" },
      { key: "other", label: "Others" },
    ];

    var LABELS = {};
    CREDIT_CATEGORIES.concat(DEBIT_CATEGORIES).forEach(function (c) {
      LABELS[c.key] = c.label;
    });

    function toIsoDate(oDate) {
      return oDate.getFullYear() + "-" +
        ("0" + (oDate.getMonth() + 1)).slice(-2) + "-" +
        ("0" + oDate.getDate()).slice(-2);
    }

    return Controller.extend("Hisab.Hisab.controller.DailyKhata", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("DailyKhata")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        if (!this.byId("idKhataDate").getValue()) {
          this.byId("idKhataDate").setValue(toIsoDate(new Date()));
        }
        this._loadClients();
        this._loadMachines();
        this._loadDay();
      },

      onpressBack: function () {
        this.oRouter.navTo("Main");
      },

      onOpeningBalances: function () {
        this.oRouter.navTo("OpeningBalance");
      },

      onDateChange: function () {
        this._loadDay();
      },

      onPreviousDay: function () {
        this._shiftDay(-1);
      },

      onNextDay: function () {
        this._shiftDay(1);
      },

      _shiftDay: function (iDays) {
        var oPicker = this.byId("idKhataDate");
        var oDate = oPicker.getDateValue() || new Date();
        oDate.setDate(oDate.getDate() + iDays);
        oPicker.setValue(toIsoDate(oDate));
        this._loadDay();
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

      // Offices and machines drive the machine-expense picker, and the machine
      // list is filtered by the chosen office.
      _loadMachines: function () {
        var that = this;
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getMachines", data: JSON.stringify({}) },
          dataType: "json",
          success: function (machines) {
            machines = machines || [];
            var seen = {};
            var offices = [];
            machines.forEach(function (m) {
              if (!seen[m.cc]) {
                seen[m.cc] = true;
                offices.push({ cc: m.cc });
              }
            });
            var oModel = new JSONModel({
              all: machines,
              offices: offices,
              filtered: machines,
            });
            oModel.setSizeLimit(1000);
            that.getView().setModel(oModel, "MachineModel");
          },
        });
      },

      _loadDay: function () {
        var that = this;
        var sDate = this.byId("idKhataDate").getValue();
        if (!sDate) {
          return;
        }

        sap.ui.core.BusyIndicator.show(0);
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getDailyKhata", data: JSON.stringify({ date: sDate }) },
          dataType: "json",
          success: function (res) {
            sap.ui.core.BusyIndicator.hide();
            if (!res || res.status !== "success") {
              MessageBox.error((res && res.error) || "Could not load the day");
              return;
            }
            that._setDayModel(res);
          },
          error: function (request) {
            sap.ui.core.BusyIndicator.hide();
            MessageBox.error("Could not load the day: " + request.responseText);
          },
        });
      },

      _setDayModel: function (res) {
        var mLessByPayment = {};
        (res.writeoffs || []).forEach(function (w) {
          if (w.parentId) {
            mLessByPayment[w.parentId] = w.amount;
          }
        });

        var decorate = function (entry) {
          entry.categoryLabel = LABELS[entry.category] || entry.category;
          if (entry.category === "client_payment") {
            entry.details = entry.client + (entry.note ? " - " + entry.note : "");
            // Shown on the payment row so the pair reads as one settlement.
            if (mLessByPayment[entry.id]) {
              entry.details += "  (less " +
                mLessByPayment[entry.id].toLocaleString("en-IN") + ")";
            }
          } else if (entry.category === "client_writeoff") {
            entry.details = entry.client + (entry.note ? " - " + entry.note : "");
          } else if (entry.category === "machine_expense") {
            entry.details = entry.cc + " / " + entry.machineName +
              (entry.note ? " - " + entry.note : "");
          } else {
            entry.details = entry.note || "";
          }
          return entry;
        };

        res.credits = (res.credits || []).map(decorate);
        res.debits = (res.debits || []).map(decorate);
        res.writeoffs = (res.writeoffs || []).map(decorate);
        res.hasWriteoffs = res.writeoffs.length > 0;
        res.carriedText = res.carried.toLocaleString("en-IN");
        res.totalCreditText = res.totalCredit.toLocaleString("en-IN");
        res.totalDebitText = res.totalDebit.toLocaleString("en-IN");
        res.totalWriteoffText = (res.totalWriteoff || 0).toLocaleString("en-IN");
        res.closingText = res.closing.toLocaleString("en-IN");
        res.closingState = res.closing >= 0 ? "Success" : "Error";

        var oModel = new JSONModel(res);
        oModel.setSizeLimit(500);
        this.getView().setModel(oModel, "khataModel");
        this.byId("idNoOpeningStrip").setVisible(!res.openingConfigured);
      },

      // ==================== ENTRY DIALOG ====================

      onAddCredit: function () {
        this._openEntryDialog("credit", null);
      },

      onAddDebit: function () {
        this._openEntryDialog("debit", null);
      },

      onEditEntry: function (oEvent) {
        var oCtx = oEvent.getSource().getBindingContext("khataModel");
        var oEntry = oCtx.getObject();
        var sDirection = oCtx.getPath().indexOf("/credits") === 0 ? "credit" : "debit";
        this._openEntryDialog(sDirection, oEntry);
      },

      // The write-off that was entered with a given payment, if any. Matched on
      // parentId rather than client and date, so a client paying twice in one
      // day keeps two separate, correct pairs.
      _writeoffFor: function (iPaymentId) {
        var oModel = this.getView().getModel("khataModel");
        if (!oModel || !iPaymentId) {
          return "";
        }
        var aMatch = (oModel.getProperty("/writeoffs") || []).filter(function (w) {
          return w.parentId === iPaymentId;
        });
        return aMatch.length ? aMatch[0].amount : "";
      },

      _openEntryDialog: function (sDirection, oEntry) {
        var that = this;
        var bEdit = !!oEntry;
        var aCategories = sDirection === "credit" ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
        var sCategory = bEdit ? oEntry.category : aCategories[0].key;

        var oData = {
          title: (bEdit ? "Edit " : "Add ") + (sDirection === "credit" ? "Credit" : "Debit"),
          direction: sDirection,
          categories: aCategories,
          category: sCategory,
          id: bEdit ? oEntry.id : 0,
          source: bEdit ? oEntry.source : "khata",
          serviceDt: bEdit && oEntry.serviceDt ? oEntry.serviceDt : "",
          client: bEdit && oEntry.client ? oEntry.client : "",
          cc: bEdit ? oEntry.cc : "",
          machineName: bEdit ? oEntry.machineName : "",
          note: bEdit ? oEntry.note : "",
          amount: bEdit ? oEntry.amount : "",
          // Whatever was let off with this payment, so editing shows it back.
          writeoff: bEdit ? this._writeoffFor(oEntry.id) : "",
        };
        Object.assign(oData, this._categoryFlags(sCategory));

        var oModel = new JSONModel(oData);
        oModel.setSizeLimit(100);
        this.getView().setModel(oModel, "entryModel");
        this._filterMachines(oData.cc);

        if (this._pEntryDialog) {
          this._pEntryDialog.then(function (oDialog) { oDialog.open(); });
          return;
        }
        this._pEntryDialog = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.KhataEntry",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      // Which extra fields the chosen category needs, and how to word the note.
      _categoryFlags: function (sCategory) {
        if (sCategory === "client_payment") {
          return {
            showClient: true,
            showMachine: false,
            // Money a client is let off rides along with what they paid, so it
            // is only ever offered here.
            showWriteoff: true,
            amountLabel: "Received",
            clientPlaceholder: "Select the client who paid",
            noteLabel: "Remark",
            notePlaceholder: "e.g. cash, cheque no.",
          };
        }
        if (sCategory === "machine_expense") {
          return {
            showClient: false,
            showMachine: true,
            showWriteoff: false,
            amountLabel: "Amount",
            clientPlaceholder: "",
            noteLabel: "Spent On",
            notePlaceholder: "e.g. Belt change",
          };
        }
        return {
          showClient: false,
          showMachine: false,
          showWriteoff: false,
          amountLabel: "Amount",
          clientPlaceholder: "",
          noteLabel: "Details",
          notePlaceholder: "Optional note",
        };
      },

      onEntryCategoryChange: function (oEvent) {
        var oModel = this.getView().getModel("entryModel");
        var sCategory = oEvent.getParameter("selectedItem").getKey();
        var oData = oModel.getData();
        Object.assign(oData, this._categoryFlags(sCategory));
        oData.category = sCategory;
        // Switching away from a client payment must not leave a write-off
        // behind on a category that cannot carry one.
        if (!oData.showWriteoff) {
          oData.writeoff = "";
        }
        oModel.setData(oData);
      },

      onEntryOfficeChange: function (oEvent) {
        var sOffice = oEvent.getParameter("selectedItem")
          ? oEvent.getParameter("selectedItem").getKey() : "";
        this.getView().getModel("entryModel").setProperty("/machineName", "");
        this._filterMachines(sOffice);
      },

      _filterMachines: function (sOffice) {
        var oModel = this.getView().getModel("MachineModel");
        if (!oModel) {
          return;
        }
        var aAll = oModel.getProperty("/all") || [];
        oModel.setProperty("/filtered", sOffice
          ? aAll.filter(function (m) { return m.cc === sOffice; })
          : aAll);
      },

      onCancelEntry: function () {
        if (this._pEntryDialog) {
          this._pEntryDialog.then(function (oDialog) { oDialog.close(); });
        }
      },

      onSaveEntry: function () {
        var that = this;
        var oData = this.getView().getModel("entryModel").getData();
        var fAmount = parseFloat(oData.amount) || 0;
        var bWriteoff = !!oData.showWriteoff;
        var fWriteoff = bWriteoff ? (parseFloat(oData.writeoff) || 0) : 0;

        if (fAmount < 0 || fWriteoff < 0) {
          MessageBox.error("Amounts cannot be negative");
          return;
        }
        // The whole bill may be forgiven, so on a client payment it is the pair
        // that has to add up to something rather than the amount alone.
        if (bWriteoff) {
          if (fAmount + fWriteoff <= 0) {
            MessageBox.error("Enter an amount received, a write-off, or both");
            return;
          }
        } else if (fAmount <= 0) {
          MessageBox.error("Enter an amount greater than zero");
          return;
        }

        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "saveKhataEntry",
            data: JSON.stringify({
              id: oData.id || 0,
              serviceDt: oData.serviceDt || "",
              entry_date: this.byId("idKhataDate").getValue(),
              direction: oData.direction,
              category: oData.category,
              client: oData.client || "",
              cc: oData.cc || "",
              machineName: oData.machineName || "",
              note: oData.note || "",
              amount: fAmount,
              writeoff: fWriteoff,
            }),
          },
          dataType: "json",
          success: function (res) {
            if (res && res.status === "success") {
              MessageToast.show("Entry saved");
              that.onCancelEntry();
              that._loadDay();
            } else {
              MessageBox.error((res && res.error) || "The entry could not be saved");
            }
          },
          error: function (request) {
            MessageBox.error("The entry could not be saved: " + request.responseText);
          },
        });
      },

      onDeleteEntry: function (oEvent) {
        var that = this;
        var oEntry = oEvent.getSource().getBindingContext("khataModel").getObject();
        var sWhat = oEntry.source === "service"
          ? "Delete this machine expense? It will also be removed from Machine Expenses."
          : "Delete this entry?";

        MessageBox.confirm(sWhat, {
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) {
              return;
            }
            $.ajax({
              url: that.uri,
              type: "POST",
              data: {
                method: "deleteKhataEntry",
                data: JSON.stringify({
                  source: oEntry.source,
                  id: oEntry.id,
                  serviceDt: oEntry.serviceDt || "",
                }),
              },
              dataType: "json",
              success: function (res) {
                if (res && res.status === "success") {
                  MessageToast.show("Entry deleted");
                  that._loadDay();
                } else {
                  MessageBox.error((res && res.error) || "The entry could not be deleted");
                }
              },
              error: function (request) {
                MessageBox.error("The entry could not be deleted: " + request.responseText);
              },
            });
          },
        });
      },

      // ==================== PRINT ====================

      onPrintDay: function () {
        var oModel = this.getView().getModel("khataModel");
        if (!oModel) {
          return;
        }
        var d = oModel.getData();
        var esc = function (t) {
          return String(t == null ? "" : t)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        var money = function (n) { return (parseFloat(n) || 0).toLocaleString("en-IN"); };

        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Daily Khata</title>';
        html += '<style>';
        html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
        html += 'body { font-family: "72", Arial, Helvetica, sans-serif; color: #32363a; padding: 30px; }';
        html += 'h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }';
        html += 'h2 { text-align: center; font-size: 15px; font-weight: normal; color: #6a6d70; margin-bottom: 20px; }';
        html += '.section-title { font-size: 15px; font-weight: bold; margin: 16px 0 6px 0; }';
        html += 'table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }';
        html += 'th { background: #f2f2f2; border: 1px solid #bbb; padding: 7px 9px; text-align: left; }';
        html += 'td { border: 1px solid #bbb; padding: 5px 9px; }';
        html += 'th.num, td.num { text-align: right; }';
        html += '.total td { font-weight: bold; background: #f2f2f2; }';
        html += '.summary { margin-top: 18px; font-size: 15px; }';
        html += '.summary div { padding: 3px 0; }';
        html += '.summary .closing { font-size: 19px; font-weight: bold; border-top: 1px solid #32363a; padding-top: 6px; margin-top: 6px; }';
        html += '</style></head><body>';

        html += '<h1>Daily Khata</h1>';
        html += '<h2>' + esc(d.date) + '</h2>';

        var aSections = [
          { title: "Credit (money in)", rows: d.credits, total: d.totalCredit },
          { title: "Debit (money out)", rows: d.debits, total: d.totalDebit }
        ];
        // Printed only when there is something to print, and never folded into
        // the cash summary below.
        if ((d.writeoffs || []).length) {
          aSections.push({
            title: "Write off / Less (not cash received)",
            rows: d.writeoffs,
            total: d.totalWriteoff
          });
        }

        aSections.forEach(function (sec) {
          html += '<div class="section-title">' + sec.title + '</div>';
          html += '<table><tr><th style="width:170px">Against</th><th>Details</th><th class="num" style="width:120px">Amount</th></tr>';
          if (!sec.rows.length) {
            html += '<tr><td colspan="3" style="color:#888">No entries</td></tr>';
          }
          sec.rows.forEach(function (r) {
            html += '<tr><td>' + esc(r.categoryLabel) + '</td><td>' + esc(r.details)
              + '</td><td class="num">' + money(r.amount) + '</td></tr>';
          });
          html += '<tr class="total"><td colspan="2">Total</td><td class="num">' + money(sec.total) + '</td></tr>';
          html += '</table>';
        });

        html += '<div class="summary">';
        html += '<div>Carried Forward: ' + money(d.carried) + '</div>';
        html += '<div>+ Total Credit: ' + money(d.totalCredit) + '</div>';
        html += '<div>&minus; Total Debit: ' + money(d.totalDebit) + '</div>';
        html += '<div class="closing">Closing Balance: ' + money(d.closing) + '</div>';
        if ((d.writeoffs || []).length) {
          html += '<div style="margin-top:8px;color:#6a6d70">Written off (no cash): '
            + money(d.totalWriteoff) + '</div>';
        }
        html += '</div></body></html>';

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
