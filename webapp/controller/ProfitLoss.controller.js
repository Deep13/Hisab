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
        var oDialog = new Dialog({
          title: "P&L Detail - " + data.monthLabel,
          contentWidth: "650px",
          contentHeight: "700px",
          content: this._buildDetailContent(data),
          beginButton: new Button({
            text: "Close",
            press: function () { oDialog.close(); }
          }),
          afterClose: function () { oDialog.destroy(); }
        });
        this.getView().addDependent(oDialog);
        oDialog.open();
      },

      _buildDetailContent: function (data) {
        var vbox = new VBox().addStyleClass("sapUiMediumMargin");

        // Calculation summary at top
        vbox.addItem(new Title({ text: "Calculation", level: "H4" }).addStyleClass("sapUiSmallMarginBottom"));
        var calcBoxTop = new VBox().addStyleClass("sapUiSmallMarginBegin");
        calcBoxTop.addItem(new Text({ text: "Gross Profit: " + data.grossProfit.toLocaleString("en-IN") }));
        calcBoxTop.addItem(new Text({ text: "− Total Expense: " + data.totalExpense.toLocaleString("en-IN") })
          .addStyleClass("sapUiTinyMarginTop"));
        calcBoxTop.addItem(new Title({
          text: "= Net Profit: " + data.netProfit.toLocaleString("en-IN"),
          level: "H3"
        }).addStyleClass("sapUiSmallMarginTop"));
        vbox.addItem(calcBoxTop);

        // Earnings table
        vbox.addItem(new Title({ text: "Earnings Breakdown", level: "H4" })
          .addStyleClass("sapUiSmallMarginBottom").addStyleClass("sapUiLargeMarginTop"));
        var earningsTable = this._buildSummaryTable(["Earning", "Amount", "Profit", "% of Gross"]);
        EARNINGS.forEach(function (e) {
          var amt = parseFloat(data[e.key]) || 0;
          var profit = Math.floor(amt * e.profitMultiplier);
          var pct = data.grossProfit > 0 ? ((profit / data.grossProfit) * 100).toFixed(1) + "%" : "0%";
          earningsTable.addItem(new ColumnListItem({
            cells: [
              new Text({ text: e.label }),
              new Text({ text: amt.toLocaleString("en-IN") }),
              new Text({ text: profit.toLocaleString("en-IN") }),
              new Text({ text: pct })
            ]
          }));
        });
        earningsTable.addItem(new ColumnListItem({
          cells: [
            new Label({ text: "Total", design: "Bold" }),
            new Label({ text: data.totalEarning.toLocaleString("en-IN"), design: "Bold" }),
            new Label({ text: data.grossProfit.toLocaleString("en-IN"), design: "Bold" }),
            new Label({ text: "100%", design: "Bold" })
          ]
        }));
        vbox.addItem(earningsTable);

        // Expenses table
        vbox.addItem(new Title({ text: "Expense Outer Breakdown", level: "H4" })
          .addStyleClass("sapUiSmallMarginBottom").addStyleClass("sapUiLargeMarginTop"));
        var expenseTable = this._buildSummaryTable(["Expense", "Amount", "% of Total"]);
        EXPENSES.forEach(function (e) {
          var amt = parseFloat(data[e.key]) || 0;
          var pct = data.totalExpense > 0 ? ((amt / data.totalExpense) * 100).toFixed(1) + "%" : "0%";
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
            new Label({ text: data.totalExpense.toLocaleString("en-IN"), design: "Bold" }),
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

        var oFormModel = new JSONModel({
          month: ("0" + (new Date().getMonth() + 1)).slice(-2),
          year: currYear.toString(),
          shaving: 0, buffing: 0, charbi: 0, milling: 0, tangan: 0,
          electricBill: 0, munshi: 0, churi: 0, mobil: 0, buffPaper: 0,
          bhussi: 0, maintenance: 0, vBelt: 0, miscellaneous: 0,
          shavingProfit: 0, buffingProfit: 0, charbiProfit: 0, millingProfit: 0, tanganProfit: 0,
          totalEarning: 0, totalExpense: 0, grossProfit: 0, netProfit: 0
        });

        var that = this;

        var monthSelect = new Select({
          selectedKey: "{form>/month}",
          items: monthItems,
          change: function () { that._fetchEarningsForForm(oFormModel); }
        });
        var yearSelect = new Select({
          selectedKey: "{form>/year}",
          items: yearItems,
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

        // Earnings table
        content.addItem(new Title({ text: "Earnings", level: "H4" })
          .addStyleClass("sapUiSmallMarginTop").addStyleClass("sapUiTinyMarginBottom"));
        var eTable = new Table({ inset: false }).addStyleClass("sapUiSizeCompact");
        eTable.addColumn(new Column({ header: new Label({ text: "Earning", design: "Bold" }) }));
        eTable.addColumn(new Column({ hAlign: "Right", header: new Label({ text: "Amount", design: "Bold" }) }));
        eTable.addColumn(new Column({ hAlign: "Right", header: new Label({ text: "Profit", design: "Bold" }) }));
        EARNINGS.forEach(function (e) {
          var profitKey = e.key + "Profit";
          eTable.addItem(new ColumnListItem({
            cells: [
              new Text({ text: e.label }),
              new Input({
                value: "{form>/" + e.key + "}",
                type: "Number",
                liveChange: function () { that._recalcForm(oFormModel); }
              }),
              new Text({ text: "{form>/" + profitKey + "}" })
            ]
          }));
        });
        eTable.addItem(new ColumnListItem({
          cells: [
            new Label({ text: "Total", design: "Bold" }),
            new Label({ text: "{form>/totalEarning}", design: "Bold" }),
            new Label({ text: "{form>/grossProfit}", design: "Bold" })
          ]
        }));
        content.addItem(eTable);

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
            new Label({ text: "{form>/totalExpense}", design: "Bold" })
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
          title: "Add Monthly P&L",
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
            // Reset earnings
            EARNINGS.forEach(function (e) { data[e.key] = 0; });
            (transactions || []).forEach(function (t) {
              var key = typeToKey[t.machineType];
              if (key) {
                data[key] = (data[key] || 0) + (parseFloat(t.total) || 0);
              }
            });
            oFormModel.setData(data);
            that._recalcForm(oFormModel);
            sap.ui.core.BusyIndicator.hide();
          },
          error: function () {
            sap.ui.core.BusyIndicator.hide();
          }
        });
      },

      _recalcForm: function (oFormModel) {
        var d = oFormModel.getData();
        var totalEarn = 0, gross = 0;
        EARNINGS.forEach(function (e) {
          var amt = parseFloat(d[e.key]) || 0;
          var profit = Math.floor(amt * e.profitMultiplier);
          d[e.key + "Profit"] = profit;
          totalEarn += amt;
          gross += profit;
        });
        var totalExp = 0;
        EXPENSES.forEach(function (x) {
          totalExp += parseFloat(d[x.inputKey]) || 0;
        });
        d.totalEarning = totalEarn;
        d.totalExpense = totalExp;
        d.grossProfit = gross;
        d.netProfit = gross - totalExp;
        oFormModel.setData(d);
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

        var labels = sorted.map(function (r) { return r.monthLabel; });
        var earnings = sorted.map(function (r) { return r.totalEarning; });
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
                label: "Total Earning",
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

    function ProfitLossCompute(r) {
      var totalEarn = 0, gross = 0;
      EARNINGS.forEach(function (e) {
        var amt = parseFloat(r[e.key]) || 0;
        totalEarn += amt;
        gross += Math.floor(amt * e.profitMultiplier);
      });
      var totalExp = 0;
      EXPENSES.forEach(function (x) {
        totalExp += parseFloat(r[x.key]) || 0;
      });
      var net = gross - totalExp;
      var monthName = MONTH_NAMES[parseInt(r.month, 10) - 1] || r.month;
      return {
        monthLabel: monthName + " " + r.year,
        totalEarning: totalEarn,
        totalExpense: totalExp,
        grossProfit: gross,
        netProfit: net,
        netProfitState: net >= 0 ? "Success" : "Error"
      };
    }
  }
);
