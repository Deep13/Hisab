sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/ui/model/Sorter",
  ],
  function (Controller, JSONModel, MessageBox, MessageToast, Fragment, Sorter) {
    "use strict";

    function toIsoDate(oDate) {
      return oDate.getFullYear() + "-" +
        ("0" + (oDate.getMonth() + 1)).slice(-2) + "-" +
        ("0" + oDate.getDate()).slice(-2);
    }

    return Controller.extend("Hisab.Hisab.controller.OpeningBalance", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("OpeningBalance")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        this._loadCashOpening();
        this._loadClientOpenings();
      },

      onpressBack: function () {
        this.oRouter.navTo("DailyKhata");
      },

      // ==================== CASH IN HAND ====================

      _loadCashOpening: function () {
        var that = this;
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getKhataOpening", data: JSON.stringify({}) },
          dataType: "json",
          success: function (res) {
            if (!res || res.status !== "success") {
              return;
            }
            // Default to the first of this month, the natural starting point.
            var oNow = new Date();
            that.byId("idCashDate").setValue(
              res.opening_date || toIsoDate(new Date(oNow.getFullYear(), oNow.getMonth(), 1))
            );
            that.byId("idCashAmount").setValue(String(res.amount || 0));
          },
          error: function (request) {
            MessageBox.error("Could not load the cash opening: " + request.responseText);
          },
        });
      },

      onSaveCashOpening: function () {
        var that = this;
        var sDate = this.byId("idCashDate").getValue();
        if (!sDate) {
          MessageBox.error("Pick the day the balance starts from");
          return;
        }

        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "setKhataOpening",
            data: JSON.stringify({
              opening_date: sDate,
              amount: parseFloat(this.byId("idCashAmount").getValue()) || 0,
            }),
          },
          dataType: "json",
          success: function (res) {
            if (res && res.status === "success") {
              MessageToast.show("Cash opening balance saved");
            } else {
              MessageBox.error((res && res.error) || "The cash balance could not be saved");
            }
          },
          error: function (request) {
            MessageBox.error("The cash balance could not be saved: " + request.responseText);
          },
        });
      },

      // ==================== CLIENT BALANCES ====================

      _loadClientOpenings: function () {
        var that = this;
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getClientOpenings", data: JSON.stringify({}) },
          dataType: "json",
          success: function (res) {
            if (!res || res.status !== "success") {
              MessageBox.error((res && res.error) || "Could not load client balances");
              return;
            }
            var rows = res.rows || [];
            var oModel = new JSONModel({ all: rows, visible: rows });
            oModel.setSizeLimit(2000);
            that.getView().setModel(oModel, "openingModel");

            var sAsOf = null;
            rows.some(function (r) {
              if (r.as_of_date) {
                sAsOf = r.as_of_date;
                return true;
              }
              return false;
            });
            var oNow = new Date();
            that.byId("idClientAsOf").setValue(
              sAsOf || toIsoDate(new Date(oNow.getFullYear(), oNow.getMonth(), 1))
            );
            that._updateOpeningTotal();
          },
          error: function (request) {
            MessageBox.error("Could not load client balances: " + request.responseText);
          },
        });
      },

      // The table is bound to a filtered copy, so search never loses edits made
      // to rows that are currently hidden.
      onSearchClients: function (oEvent) {
        var sQuery = (oEvent.getParameter("newValue") || "").trim().toLowerCase();
        var oModel = this.getView().getModel("openingModel");
        if (!oModel) {
          return;
        }
        var aAll = oModel.getProperty("/all") || [];
        oModel.setProperty("/visible", sQuery
          ? aAll.filter(function (r) {
              return r.client.toLowerCase().indexOf(sQuery) > -1;
            })
          : aAll);
      },

      onSortOpenings: function () {
        var that = this;
        if (this._pOpeningSort) {
          this._pOpeningSort.then(function (oDialog) {
            oDialog.open();
          });
          return;
        }
        this._pOpeningSort = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.OpeningSort",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      // Sorting only reorders the binding, so amounts typed into rows keep
      // pointing at the same client and no edit is lost.
      onOpeningSortConfirm: function (oEvent) {
        var oItem = oEvent.getParameter("sortItem");
        if (!oItem) {
          return;
        }
        var sKey = oItem.getKey();
        var oSorter = new Sorter(sKey, oEvent.getParameter("sortDescending"));
        if (sKey === "amount") {
          oSorter.fnCompare = function (a, b) {
            return (parseFloat(a) || 0) - (parseFloat(b) || 0);
          };
        }
        this.byId("idClientTable").getBinding("items").sort(oSorter);
      },

      onOpeningAmountChange: function () {
        this._updateOpeningTotal();
      },

      _updateOpeningTotal: function () {
        var oModel = this.getView().getModel("openingModel");
        if (!oModel) {
          return;
        }
        var total = (oModel.getProperty("/all") || []).reduce(function (sum, r) {
          return sum + (parseFloat(r.amount) || 0);
        }, 0);
        this.byId("idOpeningTotal").setText(total.toLocaleString("en-IN"));
      },

      onSaveClientOpenings: function () {
        var that = this;
        var oModel = this.getView().getModel("openingModel");
        if (!oModel) {
          return;
        }
        var sAsOf = this.byId("idClientAsOf").getValue();
        if (!sAsOf) {
          MessageBox.error("Pick the date these balances are as at");
          return;
        }

        // The whole sheet goes up, zeros included, so that clearing a figure
        // actually clears it and the as-of date is always recorded.
        var aRows = (oModel.getProperty("/all") || []).map(function (r) {
          return { client: r.client, amount: parseFloat(r.amount) || 0 };
        });

        if (!aRows.length) {
          MessageBox.information("There are no clients to save");
          return;
        }

        sap.ui.core.BusyIndicator.show(0);
        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "saveClientOpenings",
            data: JSON.stringify({ as_of_date: sAsOf, rows: aRows }),
          },
          dataType: "json",
          success: function (res) {
            sap.ui.core.BusyIndicator.hide();
            if (res && res.status === "success") {
              MessageToast.show(res.saved + " client balances saved");
            } else {
              MessageBox.error((res && res.error) || "Client balances could not be saved");
            }
          },
          error: function (request) {
            sap.ui.core.BusyIndicator.hide();
            MessageBox.error("Client balances could not be saved: " + request.responseText);
          },
        });
      },
    });
  }
);
