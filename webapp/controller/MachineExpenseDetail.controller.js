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

    return Controller.extend("Hisab.Hisab.controller.MachineExpenseDetail", {
      formatter: formatter,

      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();

        this.getView().setModel(new JSONModel({ results: [] }), "expenses");
        this.getView().setModel(new JSONModel({}), "machine");

        this.oRouter
          .getRoute("MachineExpenseDetail")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function (oEvent) {
        var sArg = oEvent.getParameter("arguments").machineDetail;
        this._oMachine = JSON.parse(decodeURIComponent(sArg));

        this.getView().getModel("machine").setData({
          cc: this._oMachine.cc,
          machineName: this._oMachine.machineName,
          type: this._oMachine.type,
          expenseCount: 0,
          totalAmount: 0,
          lastServicedOn: null,
        });

        this._resetForm();
        this.onClearExpenseFilters();
        this._loadExpenses();
      },

      _resetForm: function () {
        this.byId("idNewServiceName").setValue("");
        this.byId("idNewServiceName").setValueState("None");
        this.byId("idNewServiceAmount").setValue("");
        this.byId("idNewServiceAmount").setValueState("None");
        this.byId("idNewServiceDate").setDateValue(new Date());
        this.byId("idNewServiceDate").setValueState("None");
      },

      /* ---------------------------------------------------------------- data */

      _loadExpenses: function () {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getMachineExpenses",
            data: JSON.stringify({
              cc: that._oMachine.cc,
              machineName: that._oMachine.machineName,
            }),
          },
          dataType: "json",
          success: function (aExpenses) {
            aExpenses = aExpenses || [];
            that.getView().getModel("expenses").setData({ results: aExpenses });
            that._updateMachineHeader(aExpenses);
            that._applyExpenseFilters();
          },
          error: function () {
            that.getView().getModel("expenses").setData({ results: [] });
            MessageBox.error("Could not load expenses");
          },
        });
      },

      _updateMachineHeader: function (aExpenses) {
        var fTotal = 0;
        var sLast = null;
        aExpenses.forEach(function (oExpense) {
          fTotal += parseFloat(oExpense.Amount) || 0;
          if (!sLast || oExpense.servicedOn > sLast) {
            sLast = oExpense.servicedOn;
          }
        });

        var oModel = this.getView().getModel("machine");
        oModel.setProperty("/expenseCount", aExpenses.length);
        oModel.setProperty("/totalAmount", fTotal);
        oModel.setProperty("/lastServicedOn", sLast);
      },

      /* ------------------------------------------------------- add an expense */

      onAddExpense: function () {
        var that = this;
        var oName = this.byId("idNewServiceName");
        var oAmount = this.byId("idNewServiceAmount");
        var oDate = this.byId("idNewServiceDate");

        var sName = oName.getValue().trim();
        var sAmount = oAmount.getValue().trim();
        var oDateValue = oDate.getDateValue();

        oName.setValueState(sName ? "None" : "Error");
        oDate.setValueState(oDateValue ? "None" : "Error");
        // An amount of 0 is legitimate (warranty work), a non-number is not.
        var bAmountValid = sAmount !== "" && !isNaN(parseFloat(sAmount));
        oAmount.setValueState(bAmountValid ? "None" : "Error");

        if (!sName || !oDateValue || !bAmountValid) {
          MessageToast.show("Service name, amount and date are required");
          return;
        }

        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "insertMachineExpense",
            data: JSON.stringify({
              cc: that._oMachine.cc,
              machineName: that._oMachine.machineName,
              serviceName: sName,
              servicedOn: that._toIsoDate(oDateValue),
              Amount: parseFloat(sAmount),
            }),
          },
          dataType: "json",
          success: function (oResult) {
            if (oResult && oResult.status === "success") {
              MessageToast.show("Expense added");
              that._resetForm();
              that._loadExpenses();
            } else {
              MessageBox.error(
                (oResult && oResult.error) || "Could not save expense"
              );
            }
          },
          error: function (oRequest) {
            MessageBox.error(oRequest.responseText || "Could not save expense");
          },
        });
      },

      _toIsoDate: function (oDate) {
        var sMonth = ("0" + (oDate.getMonth() + 1)).slice(-2);
        var sDay = ("0" + oDate.getDate()).slice(-2);
        return oDate.getFullYear() + "-" + sMonth + "-" + sDay;
      },

      /* ------------------------------------------------------ filter and sort */

      onExpenseSearch: function () {
        this._applyExpenseFilters();
      },

      onExpenseFilterChange: function () {
        this._applyExpenseFilters();
      },

      onClearExpenseFilters: function () {
        this.byId("idExpenseSearch").setValue("");
        this.byId("idExpenseRange").setDateValue(null);
        this.byId("idExpenseRange").setSecondDateValue(null);
        this.byId("idExpenseAmount").setSelectedKey("all");
        this._applyExpenseFilters();
      },

      _applyExpenseFilters: function () {
        var oBinding = this.byId("idExpenseTable").getBinding("items");
        if (!oBinding) {
          return;
        }

        var aFilters = [];
        var sQuery = this.byId("idExpenseSearch").getValue().trim();
        var oRange = this.byId("idExpenseRange");
        var oFrom = oRange.getDateValue();
        var oTo = oRange.getSecondDateValue();
        var sAmount = this.byId("idExpenseAmount").getSelectedKey();

        if (sQuery) {
          aFilters.push(
            new Filter("serviceName", FilterOperator.Contains, sQuery)
          );
        }
        if (oFrom && oTo) {
          // servicedOn is an ISO string, so a lexical BETWEEN is also chronological.
          aFilters.push(
            new Filter(
              "servicedOn",
              FilterOperator.BT,
              this._toIsoDate(oFrom),
              this._toIsoDate(oTo)
            )
          );
        }
        if (sAmount === "0") {
          aFilters.push(
            new Filter({
              path: "Amount",
              test: function (vAmount) {
                return (parseFloat(vAmount) || 0) === 0;
              },
            })
          );
        } else if (sAmount !== "all") {
          var fMin = parseFloat(sAmount);
          aFilters.push(
            new Filter({
              path: "Amount",
              test: function (vAmount) {
                return (parseFloat(vAmount) || 0) > fMin;
              },
            })
          );
        }

        oBinding.filter(aFilters);
        this._updateExpenseSummary();
      },

      _updateExpenseSummary: function () {
        var oBinding = this.byId("idExpenseTable").getBinding("items");
        if (!oBinding) {
          return;
        }

        var fTotal = 0;
        oBinding.getContexts(0, oBinding.getLength()).forEach(function (oCtx) {
          fTotal += parseFloat(oCtx.getObject().Amount) || 0;
        });

        this.byId("idExpenseCount").setText(
          "Expenses (" + oBinding.getLength() + ")"
        );
        this.byId("idExpenseTotal").setText(
          "Filtered total: " + formatter.amount(fTotal)
        );
      },

      onSortExpenses: function () {
        var that = this;
        if (this._pExpenseSort) {
          this._pExpenseSort.then(function (oDialog) {
            oDialog.open();
          });
          return;
        }
        this._pExpenseSort = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.ExpenseSort",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      onExpenseSortConfirm: function (oEvent) {
        var oItem = oEvent.getParameter("sortItem");
        if (!oItem) {
          return;
        }
        var sPath = oItem.getKey();
        var oSorter = new Sorter(sPath, oEvent.getParameter("sortDescending"));
        if (sPath === "Amount") {
          oSorter.fnCompare = function (a, b) {
            return (parseFloat(a) || 0) - (parseFloat(b) || 0);
          };
        }
        this.byId("idExpenseTable").getBinding("items").sort(oSorter);
      },

      onpressBack: function () {
        this.oRouter.navTo("MachineExpense");
      },
    });
  }
);
