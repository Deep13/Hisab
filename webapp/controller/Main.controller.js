sap.ui.define(
  ["../controller/BaseController", "sap/m/MessageStrip"],
  function (Controller, MessageStrip) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.Main", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("Main")
          .attachPatternMatched(this._handleRouteMatched, this);
        //	this.oRouter.getRoute("Main").attachPatternMatched(this.onPatternMatched, this);
      },
      _handleRouteMatched: function (oEvent) {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getRoutine",
          },
          dataType: "json",
          success: function (dataClient) {
            dataClient.forEach(function (item) {
              var service = new Date(item.ServicedOn);
              var a = new Date(
                service.setMonth(
                  service.getMonth() + parseInt(item.IntervalMonths)
                )
              );
              if (a.toDateString() == new Date().toDateString()) {
                that._generateMsgStrip(item.Name);
              }
            });
            console.log("success", dataClient);
          },
          error: function (request, error) {
            console.log("error", error);
          },
        });
      },
      onPressTransactionShaving: function (oEvent) {
        this.oRouter.navTo("TransactionShaving");
      },

      onPressBuffingTransaction: function (oEvent) {
        this.oRouter.navTo("TransactionBuffing");
      },

      onPressMillingTransaction: function (oEvent) {
        this.oRouter.navTo("TransactionMilling");
      },

      onPressSofteningTransaction: function (oEvent) {
        this.oRouter.navTo("TransactionSoftening");
      },

      onPressRateSettings: function (oEvent) {
        this.oRouter.navTo("RateSettings");
      },

      onPressTanganTransaction: function (oEvent) {
        this.oRouter.navTo("TransactionTangan");
      },

      onPressThokai: function (oEvent) {
        this.oRouter.navTo("TransactionThokai");
      },

      onPressClient: function (oEvent) {
        this.oRouter.navTo("ClientPayment");
      },
      onPressTagada: function (oEvent) {
        window.open(
          'http://localhost/Hisab/webapp/#/TagadaSlip'
        );
      },

      onPressProfitLoss: function () {
        this.oRouter.navTo("ProfitLoss");
      },

      onPressLabour: function (oEvent) {
        this.oRouter.navTo("LabourPayment");
      },
      onPressRoutine: function () {
        this.oRouter.navTo("Routine");
      },
      onPressMachineExpense: function () {
        this.oRouter.navTo("MachineExpense");
      },
      onPressTran: function () {
        this.oRouter.navTo("ViewTransaction");
      },
      onPressClientMaster: function () {
        this.oRouter.navTo("MasterClient");
      },
      onPressAnalytics: function () {
        this.oRouter.navTo("Analytics");
      },
      onPressKhazana: function () {
        this.oRouter.navTo("Khazana");
      },
      _generateMsgStrip: function (name) {
        var sText = name + " needs to be serviced!!";
        var oVC = this.byId("VLayout");
        var oMsgStrip = new MessageStrip({
          text: sText,
          showCloseButton: true,
          showIcon: true,
          type: "Error",
        });
        oMsgStrip.addStyleClass("sapUiTinyMargin");
        // this.oInvisibleMessage.announce(
        //   "New Information Bar of type " + sType + " " + sText,
        //   InvisibleMessageMode.Assertive
        // );
        oVC.addItem(oMsgStrip);
      },
    });
  }
);
