sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
  ],
  function (Controller, JSONModel, MessageBox, Filter) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.ViewTransaction", {
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
          .getRoute("ViewTransaction")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function (oEvent) {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getAllTransaction",
          },
          dataType: "json",
          success: function (dataClient) {
            var detailsModel = {
              results: dataClient,
            };
            var count = dataClient.length;
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
              Labour_results: dataClient,
            };
            that.getView().setModel(new JSONModel(ComboObj), "ComboModel");
          },
          error: function (request, error) {
            // console.log("fhfj");
          },
        });
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getAllClients",
          },
          dataType: "json",
          success: function (dataClient) {
            var ComboObj = {
              Clients_results: dataClient,
            };
            var jModel = new JSONModel(ComboObj);
            jModel.setSizeLimit(ComboObj.Clients_results.length);
            that.getView().setModel(jModel, "ClientModel");
          },
          error: function (request, error) {
            var ComboObj = {
              Clients_results: [],
            };
            that.getView().setModel(new JSONModel(ComboObj), "ClientModel");
          },
        });
      },
      onQuantityChange: function (oEvent) {
        var quantity = oEvent.getParameter("newValue");
        if (!quantity) {
          quantity = 0;
        }
        var data = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getObject();
        var total = parseFloat(quantity) * parseFloat(data.rate);
        if (data.machineType === "Softening") {
          if (quantity > 3) {
            total = 400 + (quantity - 3) * parseFloat(data.rate);
          } else {
            total = 400;
          }
        }

        var path = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getPath();
        oEvent
          .getSource()
          .getModel("detailsModel")
          .setProperty(path + "/total", total);
      },

      onRateChange: function (oEvent) {
        var rate = oEvent.getParameter("newValue");
        if (!rate) {
          rate = 0;
        }
        var data = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getObject();
        var total = parseFloat(rate) * parseFloat(data.quantity);
        if (data.machineType === "Softening") {
          if (data.quantity > 3) {
            total = 400 + (data.quantity - 3) * parseFloat(rate);
          } else {
            total = 400;
          }
        }

        var path = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getPath();
        oEvent
          .getSource()
          .getModel("detailsModel")
          .setProperty(path + "/total", total);
      },

      onpressBack: function (oEvent) {
        this.oRouter.navTo("Main");
      },
      onEdit: function (oEvent) {
        var obj = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getObject();
        this.current = JSON.parse(JSON.stringify(obj));
        var path = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getPath();
        oEvent
          .getSource()
          .getModel("detailsModel")
          .setProperty(path + "/Edit", true);
      },
      onCancel: function (oEvent) {
        var path = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getPath();
        oEvent
          .getSource()
          .getModel("detailsModel")
          .setProperty(path, this.current);
      },
      onSave: function (oEvent) {
        var that = this;
        var path = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getPath();

        var data = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getObject();
        data.month = parseInt(data.date.substring(3, 5), 10);
        data.year = parseInt(data.date.substring(6), 10);
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "updateTrans",
            data: JSON.stringify(data),
          },
          crossDomain: true,
          dataType: "json",
          success: function (sData) {
            that
              .getView()
              .byId("idTable")
              .getModel("detailsModel")
              .setProperty(path + "/Edit", false);

            MessageBox.success("Updated");
          },
          error: function (request, error) {
            MessageBox.error(request.responseText);
          },
        });
      },
      onChangeSelection: function (oEvent) {
        var value = oEvent.getParameter("newValue");
        this.onFilterTable("cc", value);
      },
      onChangeSelectionOp: function (oEvent) {
        var value = oEvent.getParameter("newValue");
        this.onFilterTable("machineType", value);
      },
      onChangeSelectionClient: function (oEvent) {
        var value = oEvent.getParameter("newValue");
        this.onFilterTable("client", value);
      },
      onChangeSelectionLabour: function (oEvent) {
        var value = oEvent.getParameter("newValue");
        this.onFilterTable("labour", value);
      },

      onFilterTable: function (type, value) {
        var that = this;
        var aLocFilter = [];
        var oTable = this.byId("idTable"),
          oBinding = oTable.getBinding("items");
        if (value === "") {
          var oFilter = new Filter(type, "NE", "");
        } else {
          var oFilter = new Filter(type, "EQ", value);
        }

        this.aFilters[type] = oFilter;
        Object.values(this.aFilters).forEach(function (val) {
          aLocFilter.push(val);
        });

        // apply filter settings
        oBinding.filter(aLocFilter);
        that
          .byId("idTable")
          .setHeaderText(
            "Client Transactions (" + oTable.getGrowingInfo().total + ")"
          );
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
