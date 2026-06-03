sap.ui.define(
  ["../controller/BaseController", "sap/ui/model/json/JSONModel"],
  function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.LabourPayment", {
      /**
       * Called when a controller is instantiated and its View controls (if available) are already created.
       * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
       * @memberOf Hisab.Hisab.view.LabourPayment
       */
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("LabourPayment")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function (oEvent) {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getAllLabours",
            data: JSON.stringify({}),
          },
          dataType: "json",
          success: function (dataClient) {
            var ComboObj = {
              Clients_results: dataClient,
            };
            that.getView().setModel(new JSONModel(ComboObj), "ComboModel");
          },
          error: function (request, error) {
            // console.log("fhfj");
          },
        });
      },

      onpressBack: function (oEvent) {
        this.oRouter.navTo("Main");
      },
      onChangeSelection: function () {
        var that = this;
        var data = {};
        this.byId("idClient").setSelectedKey("");
        data.officeType = this.byId("idOffice").getSelectedKey();
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getAllLabourWithParam",
            data: JSON.stringify(data),
          },
          dataType: "json",
          success: function (dataClient) {
            var aDataClient = [];
            dataClient.forEach(function (val) {
              if (val.labour) {
                aDataClient.push({ Labor: val.labour });
              }
            });
            var ComboObj = {
              Clients_results: aDataClient,
            };
            that.getView().setModel(new JSONModel(ComboObj), "ComboModel");
          },
          error: function (request, error) {
            // console.log("fhfj");
            var ComboObj = {
              Clients_results: [],
            };
            that.getView().setModel(new JSONModel(ComboObj), "ComboModel");
          },
        });
      },

      onGetTransaction: function (oEvent) {
        var that = this;
        this.byId("idClientTx").setVisible(true);
        var office = this.byId("idOffice").getSelectedKey();
        var Client = this.byId("idClient").getSelectedKey();
        var start = this.byId("datePicker").getValue();
        var end = this.byId("datePicker2").getValue();

        if (Client && start && end) {
          var data = {
            office: office,
            Labour: Client,
            start: start,
            end: end,
          };
          $.ajax({
            url: that.uri,
            type: "POST",
            data: {
              method: "getLabourTransaction",
              data: JSON.stringify(data),
            },
            dataType: "json",
            success: function (dataClient) {
              var detailsModel = {
                results: dataClient,
              };
              var sum = 0;
              var count = dataClient.length;
              dataClient.forEach(function (amount) {
                sum = sum + parseInt(amount.total, 10);
              });
              that.byId("idTotal").setText("RB: " + sum);
              that.byId("idPay").setText("LB: " + Math.floor(sum / 3));
              that
                .byId("idTable")
                .setHeaderText("Client Transactions (" + count + ")");
              that
                .getView()
                .byId("idTable")
                .setModel(new JSONModel(detailsModel), "detailsModel");
            },
            error: function (request, error) {
              that
                .getView()
                .byId("idTable")
                .setModel(new JSONModel({ results: [] }), "detailsModel");
              that.byId("idTotal").setText("");
              that.byId("idTable").setHeaderText("Client Transactions (0)");
            },
          });
        }
      },

      onResetTransaction: function (oEvent) {
        this.byId("idClientTx").setVisible(false);
      },

      onGenerateInvoice: function (oEvent) {
        var Client = this.byId("idClient").getSelectedKey();
        var data = {
          Client: Client,
        };
        this.oRouter.navTo("Invoice", { clientData: JSON.stringify(data) });
      },
    });
  }
);
