sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Table",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/Input",
    "sap/m/Select",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/Title",
    "sap/m/ObjectStatus",
    "sap/ui/core/Item"
  ],
  function (Controller, JSONModel, MessageBox, MessageToast, Dialog, Button, Table, Column, ColumnListItem, Label, Text, Input, Select, VBox, HBox, Title, ObjectStatus, Item) {
    "use strict";

    var MONTH_NAMES = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
    ];

    var EARNINGS = [
      { key: "shaving", label: "Shaving", profitMultiplier: 2 / 3 },
      { key: "buffing", label: "Buffing", profitMultiplier: 2 / 3 },
      { key: "charbi", label: "Charbi", profitMultiplier: 1 },
      { key: "milling", label: "Milling", profitMultiplier: 1 },
      { key: "tangan", label: "Tangan", profitMultiplier: 1 }
    ];

    var EXPENSES = [
      { key: "electric_bill", label: "Electric Bill", inputKey: "electricBill" },
      { key: "munshi", label: "Munshi", inputKey: "munshi" },
      { key: "churi", label: "Churi", inputKey: "churi" },
      { key: "mobil", label: "Mobil", inputKey: "mobil" },
      { key: "buff_paper", label: "Buff Paper", inputKey: "buffPaper" },
      { key: "bhussi", label: "Bhussi", inputKey: "bhussi" },
      { key: "maintenance", label: "Maintenance", inputKey: "maintenance" },
      { key: "v_belt", label: "V-Belt", inputKey: "vBelt" },
      { key: "miscellaneous", label: "Miscellaneous", inputKey: "miscellaneous" }
    ];

    return Controller.extend("Hisab.Hisab.controller.ProfitLoss", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this._plChart = null;
        this.oRouter
          .getRoute("ProfitLoss")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        this._loadProfitLoss();
      },

      onpressBack: function () {
        this.oRouter.navTo("Main");
      },

      onTabSelect: function (oEvent) {
        if (oEvent.getParameter("key") === "chart") {
          var that = this;
          setTimeout(function () { that._renderChart(); }, 100);
        }
      },

      _loadProfitLoss: function () {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: { method: "getProfitLoss" },
          dataType: "json",
          success: function (data) {
            that._processAndSetData(data || []);
          },
          error: function () {
            that._processAndSetData([]);
          }
        });
      },

      _processAndSetData: function (data) {
        var rows = data.map(function (r) {
          return Object.assign({}, r, ProfitLossCompute(r));
        });
        var oModel = new JSONModel({ rows: rows });
        oModel.setSizeLimit(500);
        this.getView().setModel(oModel, "plModel");
      },

      onRowPress: function (oEvent) {
        var oItem = oEvent.getParameter("listItem");
        if (!oItem) { return; }
        var oCtx = oItem.getBindingContext("plModel");
        if (!oCtx) { return; }
        this._openDetailDialog(oCtx.getObject());
      },

      _openDetailDialog: function (data) {
        var that = this;
        sap.ui.core.BusyIndicator.show(0);
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getClientTransaction",
            data: JSON.stringify({
              Client: "All",
              month: data.month,
              year: data.year,
              machineType: "All",
              officeType: "All"
            })
          },
          dataType: "json",
          success: function (transactions) {
            sap.ui.core.BusyIndicator.hide();
            var officeBreakdown = that._buildOfficeBreakdown(transactions || []);
            that._showDetailDialog(data, officeBreakdown);
          },
          error: function () {
            sap.ui.core.BusyIndicator.hide();
            that._showDetailDialog(data, {});
          }
        });
      },

      _buildOfficeBreakdown: function (transactions) {
        // machineType -> earnings key
        var typeToKey = {
          "Shaving": "shaving",
          "Buffing": "buffing",
          "Milling": "milling",
          "Softening": "charbi",
          "Tangan": "tangan"
        };
        // office -> { shaving: amount, buffing: amount, ... }
        var byOffice = {};
        transactions.forEach(function (t) {
          var office = (t.cc || "").trim() || "(Unspecified)";
          var key = typeToKey[t.machineType];
          if (!key) { return; }
          if (!byOffice[office]) {
            byOffice[office] = { shaving: 0, buffing: 0, charbi: 0, milling: 0, tangan: 0 };
          }
          byOffice[office][key] += parseFloat(t.total) || 0;
        });
        return byOffice;
      },

      _showDetailDialog: function (data, officeBreakdown) {
        var that = this;
        var oDialog = new Dialog({
          title: "P&L Detail - " + data.monthLabel,
          contentWidth: "700px",
          contentHeight: "750px",
          content: this._buildDetailContent(data, officeBreakdown),
          buttons: [
            new Button({
              text: "Edit",
              icon: "sap-icon://edit",
              press: function () {
                oDialog.close();
                that._openPLForm(data);
              }
            }),
            new Button({
              text: "Print",
              icon: "sap-icon://print",
              type: "Emphasized",
              press: function () { that._printPLDetail(data, officeBreakdown); }
            }),
            new Button({
              text: "Close",
              press: function () { oDialog.close(); }
            })
          ],
          afterClose: function () { oDialog.destroy(); }
        });
        this.getView().addDependent(oDialog);
        oDialog.open();
      },

      _printPLDetail: function (data, officeBreakdown) {
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>P&L - ' + data.monthLabel + '</title>';
        html += '<style>';
        html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
        html += 'body { font-family: "72", Arial, Helvetica, sans-serif; color: #32363a; padding: 30px; }';
        html += 'h1 { text-align: center; font-size: 24px; margin-bottom: 6px; }';
        html += 'h2 { text-align: center; font-size: 16px; color: #6a6d70; font-weight: normal; margin-bottom: 24px; }';
        html += '.calc-box { background: #f5f5f5; padding: 16px; border-radius: 6px; margin-bottom: 24px; }';
        html += '.calc-box .line { font-size: 14px; padding: 2px 0; }';
        html += '.calc-box .net { font-size: 20px; font-weight: bold; padding-top: 8px; margin-top: 6px; border-top: 1px solid #bbb; }';
        html += '.section-title { font-size: 16px; font-weight: bold; margin: 18px 0 8px 0; }';
        html += 'table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }';
        html += 'th { background: #f2f2f2; border: 1px solid #bbb; padding: 8px 10px; text-align: left; font-weight: bold; }';
        html += 'th.num, td.num { text-align: right; }';
        html += 'td { border: 1px solid #bbb; padding: 6px 10px; }';
        html += '.total td { font-weight: bold; background: #f2f2f2; }';
        html += '</style></head><body>';

        html += '<h1>R&amp;D Enterprise - Profit &amp; Loss</h1>';
        html += '<h2>' + data.monthLabel + '</h2>';

        html += '<div class="calc-box">';
        html += '<div class="line">Total Income: ' + data.totalIncome.toLocaleString("en-IN") + '</div>';
        html += '<div class="line">&minus; Total Expense: ' + data.totalExpense.toLocaleString("en-IN")
          + ' &nbsp;(Expense Outer ' + data.expenseOuter.toLocaleString("en-IN")
          + ' + Earning Cost ' + data.costOfEarnings.toLocaleString("en-IN") + ')</div>';
        html += '<div class="net">= Net Profit: ' + data.netProfit.toLocaleString("en-IN") + '</div>';
        html += '</div>';

        // Earnings by Office
        html += '<div class="section-title">Earnings by Office</div>';
        var offices = Object.keys(officeBreakdown || {}).sort();
        if (offices.length === 0) {
          html += '<p style="padding:4px 0;color:#888">No office-level transaction data available.</p>';
        } else {
          offices.forEach(function (office) {
            var oData = officeBreakdown[office];
            html += '<div style="font-weight:bold;margin:12px 0 6px 0">' + office + '</div>';
            html += '<table><tr><th>Earning</th><th class="num">Amount</th><th class="num">Profit</th></tr>';
            var officeAmt = 0, officeProfit = 0;
            EARNINGS.forEach(function (e) {
              var amt = parseFloat(oData[e.key]) || 0;
              var profit = Math.floor(amt * e.profitMultiplier);
              officeAmt += amt;
              officeProfit += profit;
              html += '<tr><td>' + e.label + '</td><td class="num">' + amt.toLocaleString("en-IN")
                + '</td><td class="num">' + profit.toLocaleString("en-IN") + '</td></tr>';
            });
            html += '<tr class="total"><td>Subtotal</td><td class="num">' + officeAmt.toLocaleString("en-IN")
              + '</td><td class="num">' + officeProfit.toLocaleString("en-IN") + '</td></tr></table>';
          });
        }

        // Grand earnings
        html += '<div class="section-title">Grand Earnings Total</div>';
        html += '<table><tr><th>Earning</th><th class="num">Amount</th><th class="num">Profit</th></tr>';
        EARNINGS.forEach(function (e) {
          var amt = parseFloat(data[e.key]) || 0;
          var profit = Math.floor(amt * e.profitMultiplier);
          html += '<tr><td>' + e.label + '</td><td class="num">' + amt.toLocaleString("en-IN")
            + '</td><td class="num">' + profit.toLocaleString("en-IN") + '</td></tr>';
        });
        html += '<tr class="total"><td>Total</td><td class="num">' + data.totalEarning.toLocaleString("en-IN")
          + '</td><td class="num">' + data.grossProfit.toLocaleString("en-IN") + '</td></tr>';
        html += '</table>';

        // Expenses
        html += '<div class="section-title">Expense Outer Breakdown</div>';
        html += '<table><tr><th>Expense</th><th class="num">Amount</th></tr>';
        EXPENSES.forEach(function (e) {
          var amt = parseFloat(data[e.key]) || 0;
          html += '<tr><td>' + e.label + '</td><td class="num">' + amt.toLocaleString("en-IN") + '</td></tr>';
        });
        html += '<tr class="total"><td>Total</td><td class="num">' + data.expenseOuter.toLocaleString("en-IN") + '</td></tr>';
        html += '</table></body></html>';

        var w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
        w.focus();
        w.onload = function () { w.print(); };
      },

      _buildDetailContent: function (data, officeBreakdown) {
        var that = this;
        var vbox = new VBox().addStyleClass("sapUiMediumMargin");

        // Calculation summary at top
        vbox.addItem(new Title({ text: "Calculation", level: "H4" }).addStyleClass("sapUiSmallMarginBottom"));
        var calcBoxTop = new VBox().addStyleClass("sapUiSmallMarginBegin");
        calcBoxTop.addItem(new Text({ text: "Total Income: " + data.totalIncome.toLocaleString("en-IN") }));
        calcBoxTop.addItem(new Text({
          text: "− Total Expense: " + data.totalExpense.toLocaleString("en-IN")
            + "   (" + data.expenseOuter.toLocaleString("en-IN")
            + " + " + data.costOfEarnings.toLocaleString("en-IN") + ")"
        }).addStyleClass("sapUiTinyMarginTop"));
        calcBoxTop.addItem(new Title({
          text: "= Net Profit: " + data.netProfit.toLocaleString("en-IN"),
          level: "H3"
        }).addStyleClass("sapUiSmallMarginTop"));
        vbox.addItem(calcBoxTop);

        // Earnings by Office
        vbox.addItem(new Title({ text: "Earnings by Office", level: "H4" })
          .addStyleClass("sapUiSmallMarginBottom").addStyleClass("sapUiLargeMarginTop"));

        var offices = Object.keys(officeBreakdown || {}).sort();
        if (offices.length === 0) {
          vbox.addItem(new Text({ text: "No office-level transaction data available." })
            .addStyleClass("sapUiSmallMarginBegin"));
        } else {
          offices.forEach(function (office) {
            var oData = officeBreakdown[office];
            vbox.addItem(new Title({ text: office, level: "H5" })
              .addStyleClass("sapUiSmallMarginTop").addStyleClass("sapUiTinyMarginBottom"));
            var t = that._buildSummaryTable(["Earning", "Amount", "Profit"]);
            var officeAmt = 0, officeProfit = 0;
            EARNINGS.forEach(function (e) {
              var amt = parseFloat(oData[e.key]) || 0;
              var profit = Math.floor(amt * e.profitMultiplier);
              officeAmt += amt;
              officeProfit += profit;
              t.addItem(new ColumnListItem({
                cells: [
                  new Text({ text: e.label }),
                  new Text({ text: amt.toLocaleString("en-IN") }),
                  new Text({ text: profit.toLocaleString("en-IN") })
                ]
              }));
            });
            t.addItem(new ColumnListItem({
              cells: [
                new Label({ text: "Subtotal", design: "Bold" }),
                new Label({ text: officeAmt.toLocaleString("en-IN"), design: "Bold" }),
                new Label({ text: officeProfit.toLocaleString("en-IN"), design: "Bold" })
              ]
            }));
            vbox.addItem(t);
          });
        }

        // Grand earnings total
        vbox.addItem(new Title({ text: "Grand Earnings Total", level: "H5" })
          .addStyleClass("sapUiMediumMarginTop").addStyleClass("sapUiTinyMarginBottom"));
        var grandTable = this._buildSummaryTable(["Earning", "Amount", "Profit"]);
        EARNINGS.forEach(function (e) {
          var amt = parseFloat(data[e.key]) || 0;
          var profit = Math.floor(amt * e.profitMultiplier);
          grandTable.addItem(new ColumnListItem({
            cells: [
              new Text({ text: e.label }),
              new Text({ text: amt.toLocaleString("en-IN") }),
              new Text({ text: profit.toLocaleString("en-IN") })
            ]
          }));
        });
        grandTable.addItem(new ColumnListItem({
          cells: [
            new Label({ text: "Total", design: "Bold" }),
            new Label({ text: data.totalEarning.toLocaleString("en-IN"), design: "Bold" }),
            new Label({ text: data.grossProfit.toLocaleString("en-IN"), design: "Bold" })
          ]
        }));
        vbox.addItem(grandTable);

        // Expenses table
        vbox.addItem(new Title({ text: "Expense Outer Breakdown", level: "H4" })
          .addStyleClass("sapUiSmallMarginBottom").addStyleClass("sapUiLargeMarginTop"));
        var expenseTable = this._buildSummaryTable(["Expense", "Amount", "% of Total"]);
        EXPENSES.forEach(function (e) {
          var amt = parseFloat(data[e.key]) || 0;
          var pct = data.expenseOuter > 0 ? ((amt / data.expenseOuter) * 100).toFixed(1) + "%" : "0%";
          expenseTable.addItem(new ColumnListItem({
            cells: [
              new Text({ text: e.label }),
              new Text({ text: amt.toLocaleString("en-IN") }),
              new Text({ text: pct })
            ]
          }));
        });
        expenseTable.addItem(new ColumnListItem({
          cells: [
            new Label({ text: "Total", design: "Bold" }),
            new Label({ text: data.expenseOuter.toLocaleString("en-IN"), design: "Bold" }),
            new Label({ text: "100%", design: "Bold" })
          ]
        }));
        vbox.addItem(expenseTable);

        return vbox;
      },

      _buildSummaryTable: function (headers) {
        var table = new Table({ inset: false }).addStyleClass("sapUiSizeCompact");
        headers.forEach(function (h, idx) {
          table.addColumn(new Column({
            hAlign: idx === 0 ? "Left" : "Right",
            header: new Label({ text: h, design: "Bold" })
          }));
        });
        return table;
      },

      onCreate: function () {
        this._openPLForm(null);
      },

      // Opens the P&L entry form. When oExisting is passed, the form is in
      // edit mode: month/year are locked and expenses are pre-filled from the
      // saved record (earnings are always re-derived from live transactions).
      // Saving upserts on (month, year) via insertProfitLoss.
      _openPLForm: function (oExisting) {
        var bEdit = !!oExisting;
        var monthItems = [];
        for (var i = 0; i < 12; i++) {
          monthItems.push(new Item({
            key: ("0" + (i + 1)).slice(-2),
            text: MONTH_NAMES[i]
          }));
        }
        var yearItems = [];
        var currYear = new Date().getFullYear();
        for (var y = currYear - 3; y <= currYear + 2; y++) {
          yearItems.push(new Item({ key: y.toString(), text: y.toString() }));
        }

        var initExpenses = {
          electricBill: 0, munshi: 0, churi: 0, mobil: 0, buffPaper: 0,
          bhussi: 0, maintenance: 0, vBelt: 0, miscellaneous: 0
        };
        if (bEdit) {
          EXPENSES.forEach(function (x) {
            initExpenses[x.inputKey] = parseFloat(oExisting[x.key]) || 0;
          });
        }

        var oFormModel = new JSONModel(Object.assign({
          month: bEdit ? ("0" + parseInt(oExisting.month, 10)).slice(-2)
                       : ("0" + (new Date().getMonth() + 1)).slice(-2),
          year: bEdit ? oExisting.year.toString() : currYear.toString(),
          shaving: 0, buffing: 0, charbi: 0, milling: 0, tangan: 0,
          shavingProfit: 0, buffingProfit: 0, charbiProfit: 0, millingProfit: 0, tanganProfit: 0,
          totalEarning: 0, totalIncome: 0, expenseOuter: 0, costOfEarnings: 0, totalExpense: 0, grossProfit: 0, netProfit: 0,
          offices: []
        }, initExpenses));
        oFormModel.setSizeLimit(100);

        var that = this;

        var monthSelect = new Select({
          selectedKey: "{form>/month}",
          items: monthItems,
          enabled: !bEdit,
          change: function () { that._fetchEarningsForForm(oFormModel); }
        });
        var yearSelect = new Select({
          selectedKey: "{form>/year}",
          items: yearItems,
          enabled: !bEdit,
          change: function () { that._fetchEarningsForForm(oFormModel); }
        });

        var content = new VBox().addStyleClass("sapUiMediumMargin");

        // Month/Year row
        var headerRow = new HBox().addStyleClass("sapUiSmallMarginBottom");
        headerRow.addItem(new VBox({
          items: [new Label({ text: "Month", design: "Bold" }), monthSelect]
        }).addStyleClass("sapUiTinyMarginEnd"));
        headerRow.addItem(new VBox({
          items: [new Label({ text: "Year", design: "Bold" }), yearSelect]
        }));
        content.addItem(headerRow);

        // Earnings: one editable table per office, rebuilt dynamically
        this._earningsContainer = new VBox();
        content.addItem(this._earningsContainer);

        // Expenses table
        content.addItem(new Title({ text: "Expense Outer", level: "H4" })
          .addStyleClass("sapUiMediumMarginTop").addStyleClass("sapUiTinyMarginBottom"));
        var xTable = new Table({ inset: false }).addStyleClass("sapUiSizeCompact");
        xTable.addColumn(new Column({ header: new Label({ text: "Expense", design: "Bold" }) }));
        xTable.addColumn(new Column({ hAlign: "Right", header: new Label({ text: "Amount", design: "Bold" }) }));
        EXPENSES.forEach(function (x) {
          xTable.addItem(new ColumnListItem({
            cells: [
              new Text({ text: x.label }),
              new Input({
                value: "{form>/" + x.inputKey + "}",
                type: "Number",
                liveChange: function () { that._recalcForm(oFormModel); }
              })
            ]
          }));
        });
        xTable.addItem(new ColumnListItem({
          cells: [
            new Label({ text: "Total", design: "Bold" }),
            new Label({ text: "{form>/expenseOuter}", design: "Bold" })
          ]
        }));
        content.addItem(xTable);

        // Net Profit
        content.addItem(new Title({
          text: "Net Profit: ",
          level: "H3"
        }).addStyleClass("sapUiMediumMarginTop"));
        content.addItem(new Title({
          text: "{form>/netProfit}",
          level: "H2"
        }));

        var oDialog = new Dialog({
          title: bEdit ? "Edit Monthly P&L" : "Add Monthly P&L",
          contentWidth: "600px",
          contentHeight: "650px",
          content: content,
          beginButton: new Button({
            text: "Save",
            type: "Emphasized",
            press: function () {
              that._saveProfitLoss(oFormModel.getData(), oDialog);
            }
          }),
          endButton: new Button({
            text: "Cancel",
            press: function () { oDialog.close(); }
          }),
          afterClose: function () { oDialog.destroy(); }
        });

        oDialog.setModel(oFormModel, "form");
        this.getView().addDependent(oDialog);
        oDialog.open();

        // Auto-fetch earnings for the default month/year
        this._fetchEarningsForForm(oFormModel);
      },

      _fetchEarningsForForm: function (oFormModel) {
        var that = this;
        var data = oFormModel.getData();
        var month = data.month;
        var year = data.year;
        if (!month || !year) { return; }

        // DB machineType -> form key mapping
        var typeToKey = {
          "Shaving": "shaving",
          "Buffing": "buffing",
          "Milling": "milling",
          "Softening": "charbi",
          "Tangan": "tangan"
        };

        sap.ui.core.BusyIndicator.show(0);
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getClientTransaction",
            data: JSON.stringify({
              Client: "All",
              month: month,
              year: year,
              machineType: "All",
              officeType: "All"
            })
          },
          dataType: "json",
          success: function (transactions) {
            var officeMap = {};
            (transactions || []).forEach(function (t) {
              var key = typeToKey[t.machineType];
              if (!key) { return; }
              var amt = parseFloat(t.total) || 0;
              var office = (t.cc || "").trim() || "(Unspecified)";
              if (!officeMap[office]) {
                officeMap[office] = { shaving: 0, buffing: 0, milling: 0, charbi: 0, tangan: 0 };
              }
              officeMap[office][key] += amt;
            });

            // Build offices array; ensure at least one row exists for manual entry
            var offices = Object.keys(officeMap).sort().map(function (name) {
              var o = officeMap[name];
              return {
                name: name,
                shaving: o.shaving,
                buffing: o.buffing,
                charbi: o.charbi,
                milling: o.milling,
                tangan: o.tangan
              };
            });
            if (offices.length === 0) {
              offices.push({ name: "Manual", shaving: 0, buffing: 0, charbi: 0, milling: 0, tangan: 0 });
            }
            data.offices = offices;
            oFormModel.setData(data);

            // Compute office subtotals + aggregate, then rebuild UI
            offices.forEach(function (_, idx) { that._recalcOffice(oFormModel, idx); });
            that._rebuildEarningsTables(oFormModel);
            that._recalcForm(oFormModel);
            that._fetchKhataExpenses(oFormModel, month, year);
            sap.ui.core.BusyIndicator.hide();
          },
          error: function () {
            sap.ui.core.BusyIndicator.hide();
          }
        });
      },

      // Pulls the month's recorded spend onto the matching expense lines:
      // Daily Khata debits, machine expenses (Maintenance) and the electricity
      // bills raised under Expenses (Electric Bill). "Others" lands on
      // Miscellaneous. Munshi has no recorded source, so it stays manual, and
      // any line with no figure for the month is left untouched so a
      // hand-typed value is never wiped.
      _fetchKhataExpenses: function (oFormModel, month, year) {
        var that = this;
        var KHATA_TO_EXPENSE = {
          churi: "churi",
          buff_paper: "buffPaper",
          mobil: "mobil",
          bhussi: "bhussi",
          v_belt: "vBelt",
          machine_expense: "maintenance",
          electricity: "electricBill",
          other: "miscellaneous"
        };

        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "getKhataMonthlySummary",
            data: JSON.stringify({ month: parseInt(month, 10), year: parseInt(year, 10) })
          },
          dataType: "json",
          success: function (res) {
            if (!res || res.status !== "success") {
              return;
            }
            var debits = res.debits || {};
            var applied = 0;
            var d = oFormModel.getData();
            Object.keys(KHATA_TO_EXPENSE).forEach(function (sKhataKey) {
              var amount = parseFloat(debits[sKhataKey]) || 0;
              if (amount > 0) {
                d[KHATA_TO_EXPENSE[sKhataKey]] = amount;
                applied++;
              }
            });
            if (!applied) {
              return;
            }
            oFormModel.setData(d);
            that._recalcForm(oFormModel);
            MessageToast.show(applied + " expense lines filled from Daily Khata");
          }
        });
      },

      _recalcOffice: function (oFormModel, idx) {
        var office = oFormModel.getProperty("/offices/" + idx);
        if (!office) { return; }
        var subAmt = 0, subProfit = 0;
        EARNINGS.forEach(function (e) {
          var amt = parseFloat(office[e.key]) || 0;
          var profit = Math.floor(amt * e.profitMultiplier);
          office[e.key + "Profit"] = profit;
          subAmt += amt;
          subProfit += profit;
        });
        office.subtotalAmt = subAmt;
        office.subtotalProfit = subProfit;
        oFormModel.setProperty("/offices/" + idx, office);
      },

      _recalcForm: function (oFormModel) {
        var d = oFormModel.getData();
        var offices = d.offices || [];

        // Aggregate per-earning across offices
        var totalEarn = 0, gross = 0;
        EARNINGS.forEach(function (e) {
          var sumAmt = 0, sumProfit = 0;
          offices.forEach(function (o) {
            var amt = parseFloat(o[e.key]) || 0;
            sumAmt += amt;
            sumProfit += Math.floor(amt * e.profitMultiplier);
          });
          d[e.key] = sumAmt;
          d[e.key + "Profit"] = sumProfit;
          totalEarn += sumAmt;
          gross += sumProfit;
        });

        // Expenses (see ProfitLossCompute for how the two totals differ)
        var expenseOuter = 0;
        EXPENSES.forEach(function (x) {
          expenseOuter += parseFloat(d[x.inputKey]) || 0;
        });
        d.totalEarning = totalEarn;
        d.totalIncome = totalEarn;
        d.expenseOuter = expenseOuter;
        d.costOfEarnings = totalEarn - gross;
        d.totalExpense = expenseOuter + d.costOfEarnings;
        d.grossProfit = gross;
        d.netProfit = totalEarn - d.totalExpense;
        oFormModel.setData(d);
      },

      _rebuildEarningsTables: function (oFormModel) {
        var container = this._earningsContainer;
        if (!container) { return; }
        container.destroyItems();
        var that = this;
        var offices = oFormModel.getProperty("/offices") || [];

        offices.forEach(function (o, idx) {
          container.addItem(new Title({ text: "Earnings - " + o.name, level: "H4" })
            .addStyleClass("sapUiMediumMarginTop").addStyleClass("sapUiTinyMarginBottom"));
          container.addItem(that._buildOfficeEarningsTable(idx, oFormModel));
        });

        // Total earnings table at the end
        container.addItem(new Title({ text: "Total Earnings", level: "H4" })
          .addStyleClass("sapUiMediumMarginTop").addStyleClass("sapUiTinyMarginBottom"));
        container.addItem(that._buildTotalEarningsTable());
      },

      _buildOfficeEarningsTable: function (officeIdx, oFormModel) {
        var that = this;
        var path = "/offices/" + officeIdx;
        var t = new Table({ inset: false }).addStyleClass("sapUiSizeCompact");
        t.addColumn(new Column({ header: new Label({ text: "Earning", design: "Bold" }) }));
        t.addColumn(new Column({ hAlign: "Right", header: new Label({ text: "Amount", design: "Bold" }) }));
        t.addColumn(new Column({ hAlign: "Right", header: new Label({ text: "Profit", design: "Bold" }) }));

        EARNINGS.forEach(function (e) {
          t.addItem(new ColumnListItem({
            cells: [
              new Text({ text: e.label }),
              new Input({
                value: "{form>" + path + "/" + e.key + "}",
                type: "Number",
                liveChange: function () {
                  that._recalcOffice(oFormModel, officeIdx);
                  that._recalcForm(oFormModel);
                }
              }),
              new Text({ text: "{form>" + path + "/" + e.key + "Profit}" })
            ]
          }));
        });

        t.addItem(new ColumnListItem({
          cells: [
            new Label({ text: "Subtotal", design: "Bold" }),
            new Label({ text: "{form>" + path + "/subtotalAmt}", design: "Bold" }),
            new Label({ text: "{form>" + path + "/subtotalProfit}", design: "Bold" })
          ]
        }));
        return t;
      },

      _buildTotalEarningsTable: function () {
        var t = new Table({ inset: false }).addStyleClass("sapUiSizeCompact");
        t.addColumn(new Column({ header: new Label({ text: "Earning", design: "Bold" }) }));
        t.addColumn(new Column({ hAlign: "Right", header: new Label({ text: "Amount", design: "Bold" }) }));
        t.addColumn(new Column({ hAlign: "Right", header: new Label({ text: "Profit", design: "Bold" }) }));

        EARNINGS.forEach(function (e) {
          t.addItem(new ColumnListItem({
            cells: [
              new Text({ text: e.label }),
              new Text({ text: "{form>/" + e.key + "}" }),
              new Text({ text: "{form>/" + e.key + "Profit}" })
            ]
          }));
        });

        t.addItem(new ColumnListItem({
          cells: [
            new Label({ text: "Total", design: "Bold" }),
            new Label({ text: "{form>/totalEarning}", design: "Bold" }),
            new Label({ text: "{form>/grossProfit}", design: "Bold" })
          ]
        }));
        return t;
      },

      _saveProfitLoss: function (formData, dialog) {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "insertProfitLoss",
            data: JSON.stringify(formData)
          },
          dataType: "json",
          success: function (resp) {
            if (resp && resp.status === "success") {
              MessageToast.show("Saved successfully");
              dialog.close();
              that._loadProfitLoss();
            } else {
              MessageBox.error("Save failed");
            }
          },
          error: function () {
            MessageBox.error("Save failed");
          }
        });
      },

      _renderChart: function () {
        var oModel = this.getView().getModel("plModel");
        if (!oModel) { return; }
        var rows = oModel.getProperty("/rows") || [];

        if (this._plChart) {
          this._plChart.destroy();
          this._plChart = null;
        }

        if (rows.length === 0) {
          $("#plChartDiv").html('<p style="padding:20px;color:#888">No data available</p>');
          return;
        }

        // Sort chronologically
        var sorted = rows.slice().sort(function (a, b) {
          if (a.year !== b.year) { return parseInt(a.year, 10) - parseInt(b.year, 10); }
          return parseInt(a.month, 10) - parseInt(b.month, 10);
        });

        // Same three figures as the Calculation box: income, the full expense
        // (outer sheet + earning cost), and what is left.
        var labels = sorted.map(function (r) { return r.monthLabel; });
        var earnings = sorted.map(function (r) { return r.totalIncome; });
        var expenses = sorted.map(function (r) { return r.totalExpense; });
        var net = sorted.map(function (r) { return r.netProfit; });

        var chartHeight = Math.max(400, labels.length * 60);
        $("#plChartDiv").html("");
        $("#plChartDiv").append("<canvas id='plChartCanvas' style='height:" + chartHeight + "px'></canvas>");
        var ctx = document.getElementById("plChartCanvas").getContext("2d");

        this._plChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                label: "Total Income",
                backgroundColor: "rgba(66,165,245,0.7)",
                data: earnings
              },
              {
                label: "Total Expense",
                backgroundColor: "rgba(239,83,80,0.7)",
                data: expenses
              },
              {
                label: "Net Profit",
                backgroundColor: "rgba(102,187,106,0.8)",
                data: net
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    return ctx.dataset.label + ": " + ctx.parsed.y.toLocaleString("en-IN");
                  }
                }
              }
            },
            scales: {
              y: { beginAtZero: true }
            }
          }
        });
      }
    });

    // Total Income is everything earned. Total Expense is the outer expense
    // sheet PLUS the part of the earnings that never became profit (the
    // labour/running cost baked into the Shaving and Buffing multipliers), so
    // both sides of the calculation are stated in full amounts.
    function ProfitLossCompute(r) {
      var totalEarn = 0, gross = 0;
      EARNINGS.forEach(function (e) {
        var amt = parseFloat(r[e.key]) || 0;
        totalEarn += amt;
        gross += Math.floor(amt * e.profitMultiplier);
      });
      var expenseOuter = 0;
      EXPENSES.forEach(function (x) {
        expenseOuter += parseFloat(r[x.key]) || 0;
      });
      var costOfEarnings = totalEarn - gross;
      var totalExpense = expenseOuter + costOfEarnings;
      var net = totalEarn - totalExpense;
      var monthName = MONTH_NAMES[parseInt(r.month, 10) - 1] || r.month;
      return {
        monthLabel: monthName + " " + r.year,
        totalEarning: totalEarn,
        totalIncome: totalEarn,
        expenseOuter: expenseOuter,
        costOfEarnings: costOfEarnings,
        totalExpense: totalExpense,
        grossProfit: gross,
        netProfit: net,
        netProfitState: net >= 0 ? "Success" : "Error"
      };
    }
  }
);
