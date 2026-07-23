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

    return Controller.extend("Hisab.Hisab.controller.Routine", {
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
          .getRoute("Routine")
          .attachPatternMatched(this._handleRouteMatched, this);
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
            that
              .getView()
              .setModel(new JSONModel({ results: dataClient }), "Routine");
            console.log("success", dataClient);
          },
          error: function (request, error) {
            console.log("error", error);
          },
        });
      },
      onpressBack: function (oEvent) {
        this.oRouter.navTo("Main");
      },
      onPressYes: function (oEvent) {
        var that = this;
        var data = oEvent
          .getSource()
          .getParent()
          .getBindingContext("Routine")
          .getObject();
        data.id = parseInt(data.id);
        data = JSON.stringify(data);
        MessageBox.confirm("Have you serviced?", {
          onClose: function (sAction) {
            // MessageToast.show("Action selected: " + sAction);
            if (sAction === "OK") {
              $.ajax({
                url: that.uri,
                type: "POST",
                data: {
                  method: "setServiced",
                  data: data,
                },
                crossDomain: true,
                dataType: "json",
                success: function (sData) {
                  MessageBox.success(sData[0]);
                  console.log(sData);
                },
                error: function (request, error) {
                  MessageBox.error(request.responseText);
                },
              });
            }
          },
        });
      },
    });
  }
);
