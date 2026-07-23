sap.ui.define(
  ["sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel"],
  function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.BaseController", {
      /**
       * Called when a controller is instantiated and its View controls (if available) are already created.
       * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
       * @memberOf Hisab.Hisab.view.ClientPayment
       */
      onInit: function () { },
      getHost: function () {
        return "localhost:8080/Hisab/php/process.php";
      },
    });
  }
);
