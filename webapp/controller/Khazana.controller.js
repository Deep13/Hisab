sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
  ],
  function (Controller, JSONModel, MessageBox, Filter) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.Khazana", {
      /**
       * Called when a controller is instantiated and its View controls (if available) are already created.
       * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
       * @memberOf Hisab.Hisab.view.ViewTransaction
       */
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        // this.uri = this.http + "localhost/Hisab/php/process.php";
        this.uri = this.http + this.getHost();
        this.aFilters = {};
        this.oRouter
          .getRoute("Khazana")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function (oEvent) {
        var that = this;
        var date = new Date();
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getKhazana",
            data: JSON.stringify({
              month: date.getMonth() + 1,
              year: date.getFullYear(),
            }),
          },
          dataType: "json",
          success: function (dataClient) {
            var detailsModel = {
              results: dataClient,
            };
            var count = dataClient.length;
            that.byId("idTable").setHeaderText("Khazana (" + count + ")");
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
            that.byId("idTable").setHeaderText("Khazana (0)");
          },
        });
      },
      onGetTransaction: function (oEvent) {
        var that = this;
        var start = this.byId("datePicker").getDateValue();

        if (start) {
          var data = {
            month: start.getMonth() + 1,
            year: start.getFullYear(),
          };
          $.ajax({
            url: that.uri,
            type: "POST",
            data: {
              method: "getKhazana",
              data: JSON.stringify(data),
            },
            dataType: "json",
            success: function (dataClient) {
              var detailsModel = {
                results: dataClient,
              };
              var sum = 0;
              var count = dataClient.length;

              that.byId("idTable").setHeaderText("Khazana (" + count + ")");
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
              that.byId("idTable").setHeaderText("Khazana (0)");
            },
          });
        }
      },
      getTotal: function (c, o, p) {
        return parseInt(c) + parseInt(o) - parseInt(p);
      },
      /**
       * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
       * (NOT before the first rendering! onInit() is used for that one!).
       * @memberOf Hisab.Hisab.view.ViewTransaction
       */
      //	onBeforeRendering: function() {
      //
      //	},

      /**
       * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
       * This hook is the same one that SAPUI5 controls get after being rendered.
       * @memberOf Hisab.Hisab.view.ViewTransaction
       */
      //	onAfterRendering: function() {
      //
      //	},

      /**
       * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
       * @memberOf Hisab.Hisab.view.ViewTransaction
       */
      //	onExit: function() {
      //
      //	}
    });
  }
);
