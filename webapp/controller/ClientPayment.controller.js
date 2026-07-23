sap.ui.define(
  ["../controller/BaseController", "sap/ui/model/json/JSONModel"],
  function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.ClientPayment", {
      /**
       * Called when a controller is instantiated and its View controls (if available) are already created.
       * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
       * @memberOf Hisab.Hisab.view.ClientPayment
       */
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("ClientPayment")
          .attachPatternMatched(this._handleRouteMatched, this);
        this.getView()
          .byId("idMonth")
          .setSelectedKey(new Date().getMonth().toString());
      },

      _handleRouteMatched: function (oEvent) {
        var that = this;
        var currDate = new Date();
        this.byId("idMonth").setSelectedKey(("0" + (currDate.getMonth() + 1)).slice(-2));
        this.byId("idYear").setSelectedKey(currDate.getFullYear().toString());
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getAllClients",
            data: JSON.stringify({}),
          },
          dataType: "json",
          success: function (dataClient) {
            var data = [{ id: "All", client: "All" }];
            data = data.concat(dataClient);
            var ComboObj = {
              Clients_results: data,
            };
            var jModel = new JSONModel(ComboObj);
            that.getView().setModel(jModel, "ComboModel");
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
        data.month = this.byId("idMonth").getSelectedKey();
        data.year = this.byId("idYear").getSelectedKey();
        data.machineType = this.byId("idOperation").getSelectedKey();
        data.officeType = this.byId("idOffice").getSelectedKey();
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getAllClientsWithParam",
            data: JSON.stringify(data),
          },
          dataType: "json",
          success: function (dataClient) {
            var data = [{ id: "All", client: "All" }];
            data = data.concat(dataClient);
            var ComboObj = {
              Clients_results: data,
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
        var Client = this.byId("idClient").getSelectedKey();
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();
        var machineType = this.byId("idOperation").getSelectedKey();
        var officeType = this.byId("idOffice").getSelectedKey();

        var data = {
          Client: Client,
          month: month,
          year: year,
          machineType: machineType,
          officeType: officeType,
        };
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getClientTransaction",
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
            that.byId("idTotal").setText("Total Amount Payable: " + sum);
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
      },

      onResetTransaction: function (oEvent) {
        this.byId("idClientTx").setVisible(false);
      },

      onGenerateInvoice: function (oEvent) {
        var Client = this.byId("idClient").getSelectedKey();
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();
        var machineType = this.byId("idOperation").getSelectedKey();
        var officeType = this.byId("idOffice").getSelectedKey();
        this.http = "http://";
        this.uri = this.http + this.getHost();
        var data = {
          Client: Client,
          month: month,
          year: year,
          machineType: machineType,
          officeType: officeType,
        };
        window.open(
          'http://localhost/Hisab/webapp/#/Invoice/{"Client":"' +
          Client +
          '","month":"' +
          month +
          '","year":"' +
          year +
          '","machineType":"' +
          machineType +
          '","officeType":"' +
          officeType +
          '"}'
        );
      },

    });
  }
);
