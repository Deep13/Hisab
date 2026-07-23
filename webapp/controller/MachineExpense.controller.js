sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "Hisab/Hisab/model/formatter",
  ],
  function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    Sorter,
    MessageBox,
    MessageToast,
    Fragment,
    formatter
  ) {
    "use strict";

    // Machine types in use across the app.
    var MACHINE_TYPES = [
      "Shaving",
      "Buffing",
      "Softening",
      "Milling",
      "Tangan",
      "Thokai",
    ];

    return Controller.extend("Hisab.Hisab.controller.MachineExpense", {
      formatter: formatter,

      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();

        this.getView().setModel(
          new JSONModel({ results: [] }),
          "machines"
        );
        this.getView().setModel(new JSONModel({ results: [] }), "report");
        this.getView().setModel(
          new JSONModel({
            offices: [],
            types: [],
            allTypes: MACHINE_TYPES.map(function (sType) {
              return { type: sType };
            }),
          }),
          "filters"
        );

        this.oRouter
          .getRoute("MachineExpense")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        this._loadOffices();
        this._loadMachines();
      },

      /* ---------------------------------------------------------------- data */

      /**
       * Offices come from the transaction data (Factory 01-04, Main ...) and are
       * merged with any office already present on a machine, so legacy machines
       * stay filterable even though their office name is no longer offered when
       * creating a machine.
       */
      _loadOffices: function () {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: { method: "getOffices" },
          dataType: "json",
          success: function (aOffices) {
            that._aMasterOffices = (aOffices || []).map(function (oOffice) {
              return oOffice.cc;
            });
            that._refreshFilterValues();
          },
          error: function () {
            that._aMasterOffices = [];
            that._refreshFilterValues();
          },
        });
      },

      _loadMachines: function () {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: { method: "getMachines" },
          dataType: "json",
          success: function (aMachines) {
            that
              .getView()
              .getModel("machines")
              .setData({ results: aMachines || [] });
            that._refreshFilterValues();
            that._applyMachineFilters();
          },
          error: function () {
            that.getView().getModel("machines").setData({ results: [] });
            MessageBox.error("Could not load machines");
          },
        });
      },

      _refreshFilterValues: function () {
        var aMachines = this.getView().getModel("machines").getProperty("/results") || [];
        var aOffices = (this._aMasterOffices || []).slice();
        var aTypes = MACHINE_TYPES.slice();

        aMachines.forEach(function (oMachine) {
          if (oMachine.cc && aOffices.indexOf(oMachine.cc) === -1) {
            aOffices.push(oMachine.cc);
          }
          if (oMachine.type && aTypes.indexOf(oMachine.type) === -1) {
            aTypes.push(oMachine.type);
          }
        });
        aOffices.sort();

        var oFilters = this.getView().getModel("filters");
        oFilters.setProperty(
          "/offices",
          aOffices.map(function (sOffice) {
            return { cc: sOffice };
          })
        );
        oFilters.setProperty(
          "/types",
          aTypes.map(function (sType) {
            return { type: sType };
          })
        );
      },

      /* ------------------------------------------------------- machine list */

      onMachineSearch: function () {
        this._applyMachineFilters();
      },

      onMachineFilterChange: function () {
        this._applyMachineFilters();
      },

      onClearMachineFilters: function () {
        this.byId("idMachineSearch").setValue("");
        this.byId("idMachineOffice").setSelectedKey("");
        this.byId("idMachineType").setSelectedKey("");
        this.byId("idSpendFilter").setSelectedKey("all");
        this._applyMachineFilters();
      },

      _applyMachineFilters: function () {
        var oTable = this.byId("idMachineTable");
        var oBinding = oTable.getBinding("items");
        if (!oBinding) {
          return;
        }

        var aFilters = [];
        var sQuery = this.byId("idMachineSearch").getValue().trim();
        var sOffice = this.byId("idMachineOffice").getSelectedKey();
        var sType = this.byId("idMachineType").getSelectedKey();
        var sSpend = this.byId("idSpendFilter").getSelectedKey();

        if (sQuery) {
          aFilters.push(
            new Filter({
              filters: [
                new Filter("machineName", FilterOperator.Contains, sQuery),
                new Filter("type", FilterOperator.Contains, sQuery),
                new Filter("cc", FilterOperator.Contains, sQuery),
              ],
              and: false,
            })
          );
        }
        if (sOffice) {
          aFilters.push(new Filter("cc", FilterOperator.EQ, sOffice));
        }
        if (sType) {
          aFilters.push(new Filter("type", FilterOperator.EQ, sType));
        }
        if (sSpend === "none") {
          aFilters.push(
            new Filter({
              path: "expenseCount",
              test: function (vCount) {
                return parseInt(vCount, 10) === 0;
              },
            })
          );
        } else if (sSpend === "some") {
          aFilters.push(
            new Filter({
              path: "expenseCount",
              test: function (vCount) {
                return parseInt(vCount, 10) > 0;
              },
            })
          );
        }

        oBinding.filter(aFilters);
        this._updateMachineSummary();
      },

      _updateMachineSummary: function () {
        var oTable = this.byId("idMachineTable");
        var oBinding = oTable.getBinding("items");
        if (!oBinding) {
          return;
        }

        // Totals must reflect the filtered set, not everything loaded.
        var fTotal = 0;
        oBinding.getContexts(0, oBinding.getLength()).forEach(function (oCtx) {
          fTotal += parseFloat(oCtx.getObject().totalAmount) || 0;
        });

        this.byId("idMachineCount").setText(
          "Machines (" + oBinding.getLength() + ")"
        );
        this.byId("idMachineTotal").setText(
          "Total spend: " + formatter.amount(fTotal)
        );
      },

      onSortMachines: function () {
        var that = this;
        if (this._pMachineSort) {
          this._pMachineSort.then(function (oDialog) {
            oDialog.open();
          });
          return;
        }
        this._pMachineSort = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.MachineSort",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      onMachineSortConfirm: function (oEvent) {
        var oItem = oEvent.getParameter("sortItem");
        if (!oItem) {
          return;
        }
        var bDescending = oEvent.getParameter("sortDescending");
        var sPath = oItem.getKey();
        var bNumeric =
          sPath === "totalAmount" || sPath === "expenseCount";

        var oSorter = new Sorter(sPath, bDescending);
        if (bNumeric) {
          oSorter.fnCompare = function (a, b) {
            return (parseFloat(a) || 0) - (parseFloat(b) || 0);
          };
        }
        this.byId("idMachineTable").getBinding("items").sort(oSorter);
      },

      onMachinePress: function (oEvent) {
        var oMachine = oEvent
          .getSource()
          .getBindingContext("machines")
          .getObject();
        this.oRouter.navTo("MachineExpenseDetail", {
          machineDetail: encodeURIComponent(
            JSON.stringify({
              cc: oMachine.cc,
              machineName: oMachine.machineName,
              type: oMachine.type,
            })
          ),
        });
      },

      /* ------------------------------------------------------- add a machine */

      onAddMachine: function () {
        var that = this;
        if (this._pAddDialog) {
          this._pAddDialog.then(function (oDialog) {
            that._resetMachineDialog();
            oDialog.open();
          });
          return;
        }
        this._pAddDialog = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.AddMachine",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      _resetMachineDialog: function () {
        ["idNewMachineOffice", "idNewMachineType"].forEach(
          function (sId) {
            var oControl = Fragment.byId(this.getView().getId(), sId);
            oControl.setSelectedKey("");
            oControl.setValueState("None");
          }.bind(this)
        );
        var oName = Fragment.byId(this.getView().getId(), "idNewMachineName");
        oName.setValue("");
        oName.setValueState("None");
      },

      onCancelMachine: function () {
        this._pAddDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      onSaveMachine: function () {
        var that = this;
        var sViewId = this.getView().getId();
        var oOffice = Fragment.byId(sViewId, "idNewMachineOffice");
        var oName = Fragment.byId(sViewId, "idNewMachineName");
        var oType = Fragment.byId(sViewId, "idNewMachineType");

        var sOffice = oOffice.getSelectedKey();
        var sName = oName.getValue().trim();
        var sType = oType.getSelectedKey();

        oOffice.setValueState(sOffice ? "None" : "Error");
        oName.setValueState(sName ? "None" : "Error");
        oType.setValueState(sType ? "None" : "Error");
        if (!sOffice || !sName || !sType) {
          MessageToast.show("Office, machine name and type are required");
          return;
        }

        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "createMachine",
            data: JSON.stringify({
              cc: sOffice,
              machineName: sName,
              type: sType,
            }),
          },
          dataType: "json",
          success: function (oResult) {
            if (oResult && oResult.status === "success") {
              that._pAddDialog.then(function (oDialog) {
                oDialog.close();
              });
              MessageToast.show(sName + " added to " + sOffice);
              that._loadMachines();
            } else {
              oName.setValueState("Error");
              MessageBox.error(
                (oResult && oResult.error) || "Could not create machine"
              );
            }
          },
          error: function (oRequest) {
            MessageBox.error(oRequest.responseText || "Could not create machine");
          },
        });
      },

      /* ------------------------------------------------------------- report */

      onTabSelect: function (oEvent) {
        if (oEvent.getParameter("key") === "report" && !this._bReportReady) {
          this._bReportReady = true;
          this.onReportAllTime();
        }
      },

      onReportLastYear: function () {
        var oTo = new Date();
        var oFrom = new Date();
        oFrom.setFullYear(oFrom.getFullYear() - 1);
        this._setReportRange(oFrom, oTo);
      },

      /**
       * Opening default: the whole recorded history, so the report never starts
       * empty just because the newest expense is older than a year.
       */
      onReportAllTime: function () {
        var aMachines =
          this.getView().getModel("machines").getProperty("/results") || [];
        var sEarliest = null;
        aMachines.forEach(function (oMachine) {
          if (
            oMachine.firstServicedOn &&
            (!sEarliest || oMachine.firstServicedOn < sEarliest)
          ) {
            sEarliest = oMachine.firstServicedOn;
          }
        });

        var oFrom = sEarliest ? new Date(sEarliest) : new Date();
        if (!sEarliest) {
          oFrom.setFullYear(oFrom.getFullYear() - 1);
        }
        this._setReportRange(oFrom, new Date());
      },

      _setReportRange: function (oFrom, oTo) {
        this.byId("idReportRange").setDateValue(oFrom);
        this.byId("idReportRange").setSecondDateValue(oTo);
        this.onRunReport();
      },

      onReportRangeChange: function (oEvent) {
        if (oEvent.getParameter("valid")) {
          this.onRunReport();
        }
      },

      onRunReport: function () {
        var that = this;
        var oRange = this.byId("idReportRange");
        var oFrom = oRange.getDateValue();
        var oTo = oRange.getSecondDateValue();

        if (!oFrom || !oTo) {
          MessageToast.show("Pick a date range first");
          return;
        }

        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getMachineExpenseReport",
            data: JSON.stringify({
              fromDate: that._toIsoDate(oFrom),
              toDate: that._toIsoDate(oTo),
              cc: that.byId("idReportOffice").getSelectedKey(),
              type: that.byId("idReportType").getSelectedKey(),
            }),
          },
          dataType: "json",
          success: function (aRows) {
            aRows = aRows || [];
            that.getView().getModel("report").setData({ results: aRows });
            that._updateReportKpis(aRows);
            that._renderChart(aRows);
          },
          error: function () {
            MessageBox.error("Could not load the report");
          },
        });
      },

      _toIsoDate: function (oDate) {
        var sMonth = ("0" + (oDate.getMonth() + 1)).slice(-2);
        var sDay = ("0" + oDate.getDate()).slice(-2);
        return oDate.getFullYear() + "-" + sMonth + "-" + sDay;
      },

      _updateReportKpis: function (aRows) {
        var fTotal = 0;
        var iEntries = 0;
        aRows.forEach(function (oRow) {
          fTotal += parseFloat(oRow.totalAmount) || 0;
          iEntries += parseInt(oRow.expenseCount, 10) || 0;
        });

        this.byId("idKpiTotal").setValue(formatter.amount(fTotal));
        this.byId("idKpiMachines").setValue(String(aRows.length));
        this.byId("idKpiEntries").setValue(String(iEntries));
        this.byId("idReportTitle").setText(
          "Breakdown (" + aRows.length + " machines, " + iEntries + " entries)"
        );
      },

      _renderChart: function (aRows) {
        var oDiv = document.getElementById("machineExpenseChartDiv");
        if (!oDiv || typeof Chart === "undefined") {
          return;
        }

        if (this._oChart) {
          this._oChart.destroy();
          this._oChart = null;
        }

        if (!aRows.length) {
          oDiv.innerHTML =
            "<p style='padding:1rem;color:#666'>No expenses in the selected range.</p>";
          return;
        }

        var aLabels = aRows.map(function (oRow) {
          return oRow.machineName + " (" + oRow.cc + ")";
        });
        var aValues = aRows.map(function (oRow) {
          return parseFloat(oRow.totalAmount) || 0;
        });
        var aColors = aValues.map(function (fValue) {
          if (fValue >= 5000) {
            return "#d32f2f";
          }
          if (fValue >= 1000) {
            return "#f9a825";
          }
          return "#7cb342";
        });

        // One row per machine, so the canvas has to grow with the result set.
        var iHeight = Math.max(360, aLabels.length * 34);
        oDiv.innerHTML =
          "<canvas id='machineExpenseChart' style='height:" + iHeight + "px'></canvas>";
        var oCtx = document
          .getElementById("machineExpenseChart")
          .getContext("2d");

        this._oChart = new Chart(oCtx, {
          type: "bar",
          data: {
            labels: aLabels,
            datasets: [
              {
                label: "Expense",
                backgroundColor: aColors,
                borderColor: aColors,
                borderWidth: 1,
                barPercentage: 0.8,
                categoryPercentage: 0.9,
                data: aValues,
              },
            ],
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (oContext) {
                    var oRow = aRows[oContext.dataIndex];
                    return (
                      "Total: " +
                      oContext.parsed.x.toLocaleString("en-IN") +
                      "  (" +
                      oRow.expenseCount +
                      " entries)"
                    );
                  },
                },
              },
            },
          },
        });
      },

      onpressBack: function () {
        this.oRouter.navTo("Main");
      },
    });
  }
);
