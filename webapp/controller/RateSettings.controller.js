sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.RateSettings", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("RateSettings")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        this._loadRates();
      },

      _loadRates: function () {
        var that = this;
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getRates", data: JSON.stringify({}) },
          dataType: "json",
          success: function (rates) {
            var oModel = new JSONModel(rates || []);
            that.byId("idRateTable").setModel(oModel);
          },
          error: function (request) {
            MessageBox.error("Could not load rates: " + request.responseText);
          },
        });
      },

      onSaveRates: function () {
        var that = this;
        var aRates = this.byId("idRateTable").getModel().getData();
        if (!aRates || !aRates.length) {
          return;
        }
        var iPending = aRates.length;
        var bError = false;
        aRates.forEach(function (r) {
          $.ajax({
            url: that.uri,
            type: "POST",
            data: {
              method: "updateRate",
              data: JSON.stringify({
                machineType: r.machineType,
                rate: parseFloat(r.rate) || 0,
                base: parseFloat(r.base) || 0,
                free_qty: parseFloat(r.free_qty) || 0,
              }),
            },
            dataType: "json",
            success: function (res) {
              if (!res || res.status !== "success") {
                bError = true;
              }
            },
            error: function () {
              bError = true;
            },
            complete: function () {
              iPending--;
              if (iPending === 0) {
                if (bError) {
                  MessageBox.error("Some rates could not be saved.");
                } else {
                  MessageToast.show("Rates saved");
                }
              }
            },
          });
        });
      },

      onpressBack: function () {
        this.oRouter.navTo("Main");
      },
    });
  }
);
