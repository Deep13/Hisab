sap.ui.define(
  [
    "../controller/BaseController",
    "sap/m/MessageStrip",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/model/Filter",
  ],
  function (Controller, MessageStrip, JSONModel, MessageBox, Filter) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.MasterClient", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("MasterClient")
          .attachPatternMatched(this._handleRouteMatched, this);
        //	this.oRouter.getRoute("Main").attachPatternMatched(this.onPatternMatched, this);
      },
      _handleRouteMatched: function (oEvent) {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getAllClients",
          },
          dataType: "json",
          success: function (dataClient) {
            var detailsModel = {
              results: dataClient,
            };
            var count = dataClient.length;
            that.byId("idTable").setHeaderText("Clients (" + count + ")");
            that
              .getView()
              .byId("idTable")
              .setModel(new JSONModel(detailsModel), "detailsModel");
            that
              .getView()
              .byId("idLabor")
              .setModel(new JSONModel(detailsModel), "ComboModel");
          },
          error: function (request, error) {
            console.log("error", error);
          },
        });
      },
      onChangeSelectionClient: function (oEvent) {
        var value = oEvent.getParameter("newValue");
        this.onFilterTable("client", value);
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

        // this.aFilters[type] = oFilter;
        // Object.values(this.aFilters).forEach(function (val) {
        aLocFilter.push(oFilter);
        // });

        // apply filter settings
        oBinding.filter(aLocFilter);
        that
          .byId("idTable")
          .setHeaderText("Clients (" + oTable.getGrowingInfo().total + ")");
      },
      onSaveClient: function (oEvent) {
        var that = this;
        var obj = oEvent
          .getSource()
          .getBindingContext("detailsModel")
          .getObject();
        MessageBox.confirm("Are you sure?", {
          actions: ["Yes", MessageBox.Action.CLOSE],
          emphasizedAction: "Yes",
          onClose: function (sAction) {
            if (sAction == "Yes") {
              $.ajax({
                url: that.uri,
                type: "POST",
                data: {
                  method: "onUpdateClient",
                  data: JSON.stringify(obj),
                },
                success: function (dataClient) {
                  $.ajax({
                    url: that.uri,
                    type: "POST",
                    data: {
                      method: "getAllClients",
                    },
                    dataType: "json",
                    success: function (dataClient) {
                      var detailsModel = {
                        results: dataClient,
                      };
                      var count = dataClient.length;
                      that
                        .byId("idTable")
                        .setHeaderText("Clients (" + count + ")");
                      that
                        .getView()
                        .byId("idTable")
                        .setModel(new JSONModel(detailsModel), "detailsModel");
                      that
                        .getView()
                        .byId("idLabor")
                        .setModel(new JSONModel(detailsModel), "ComboModel");
                    },
                    error: function (request, error) {
                      console.log("error", error);
                    },
                  });
                  MessageBox.success("Success");
                },
                error: function (request, error) {
                  MessageBox.error("Error" + JSON.stringify(error));
                },
              });
            }
          },
        });
      },
      onpressBack: function (oEvent) {
        this.oRouter.navTo("Main");
      },
    });
  }
);
