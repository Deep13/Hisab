sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "Hisab/Hisab/model/formatter",
  ],
  function (Controller, JSONModel, MessageBox, MessageToast, formatter) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.ServiceDetail", {
      /**
       * Called when a controller is instantiated and its View controls (if available) are already created.
       * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
       * @memberOf Hisab.Hisab.view.Invoice
       */
      formatter: formatter,
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        // this.uri = this.http + "localhost/Hisab/php/process.php";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("ServiceDetail")
          .attachPatternMatched(this._handleRouteMatched, this);
      },
      _handleRouteMatched: function (oEvent) {
        var that = this;
        var machineData = oEvent.getParameter("arguments").machineDetail;
        this.data = JSON.parse(machineData);
        this.onTable();
      },
      onpressBack: function (oEvent) {
        this.oRouter.navTo("Routine");
      },
      onTable: function () {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getService",
            data: JSON.stringify({
              machineName: this.data.machineName,
              cc: this.data.cc,
            }),
          },
          dataType: "json",
          success: function (dataClient) {
            that
              .getView()
              .setModel(new JSONModel({ results: dataClient }), "Service");
            console.log("success", dataClient);
          },
          error: function (request, error) {
            console.log("error", error);
          },
        });
      },
      onPressAdd: function () {
        var that = this;
        var sName = this.getView().byId("newService").getValue();
        var sAmt = this.getView().byId("newServiceAmt").getValue();
        var sDate = this.getView().byId("newServiceDate").getValue();
        var sOffice = this.getView().byId("office").getText();
        var sMachine = this.getView().byId("machine").getText();
        var sType = this.getView().byId("type").getText();
        var data = {
          servicedOn: sDate,
          Amount: sAmt,
          serviceName: sName,
          cc: sOffice,
          machineName: sMachine,
          type: sType,
        };
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "insertService",
            data: JSON.stringify(data),
          },
          crossDomain: true,
          dataType: "json",
          success: function (sData) {
            MessageBox.success("Updated");
            that.getView().byId("newService").setValue("");
            that.getView().byId("newServiceAmt").setValue("");
            that.getView().byId("newServiceDate").setValue("");
            that.onTable();
          },
          error: function (request, error) {
            MessageBox.error(request.responseText);
          },
        });
      },
    });
  }
);
