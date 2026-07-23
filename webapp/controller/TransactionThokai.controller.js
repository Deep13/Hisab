sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, MessageBox) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.TransactionThokai", {
      /**
       * Called when a controller is instantiated and its View controls (if available) are already created.
       * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
       * @memberOf Hisab.Hisab.view.TransactionThokai
       */
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("TransactionThokai")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function (oEvent) {
        var that = this;
        // Get Labour's Data
        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "getAllLabours",
            data: JSON.stringify({}),
          },
          dataType: "json",
          success: function (dataLabour) {
            // Get Labour's Data
            $.ajax({
              url: that.uri,
              type: "POST",
              data: {
                method: "getAllClients",
                data: JSON.stringify({}),
              },
              dataType: "json",
              success: function (dataClient) {
                that.ClientList = [];
                var ComboObj = {
                  Labour_results: dataLabour,
                  Clients_results: dataClient,
                };
                dataClient.forEach(function (Client) {
                  that.ClientList.push(Client.Client);
                });
                var jModel = new JSONModel(ComboObj);
                that.getView().setModel(jModel, "ComboModel");
              },
              error: function (request, error) {},
            });
          },
          error: function (request, error) {},
        });
        // get First Row
        this.getFirstRow();
      },

      onpressBack: function (oEvent) {
        this.oRouter.navTo("Main");
      },

      getFirstRow: function (oEvent) {
        // Empty Model
        var data = [
          {
            Date: "",
            Client: "",
            Quantity: "",
            Rate: "",
          },
        ];
        // Add Data
        var oModel = new sap.ui.model.json.JSONModel({
          results: data,
        });
        // Set Model
        this.byId("idTable").setModel(oModel);
      },

      onAddRow: function (oEvent) {
        var flag = true;
        var tableData = this.byId("idTable").getModel().getData();
        tableData.results.forEach(function (temp) {
          if (!temp.Date && !temp.Client && !temp.Quantity && !temp.Rate) {
            flag = false;
          }
        });
        if (flag === true) {
          var cuurentModel = this.byId("idTable").getModel().getData().results;
          cuurentModel.push({
            Date: "",
            Client: "",
            Quantity: "",
            Rate: "",
          });
          this.byId("idTable").getModel().refresh();
        } else {
          MessageBox.error("All fields are mandatory!");
        }
      },

      onSaveTransaction: function (oEvent) {
        var results = [],
          that = this,
          messages = [],
          flag = true,
          clientFlag = true;
        var sOffice = this.byId("idOffice").getSelectedKey();
        var sLaborName = "";
        // get All the records
        var aRecords = this.byId("idTable").getModel().getData();
        aRecords.results.forEach(function (temp) {
          if (!(!temp.Date && !temp.Client && !temp.Quantity && !temp.Rate)) {
            if (!that.ClientList.includes(temp.Client)) {
              that.saveClient(temp.Client);
            }
            results.push({
              client: temp.Client,
              labour: sLaborName,
              date: temp.Date,
              month: parseInt(temp.Date.substring(0, 2), 10),
              cc: sOffice,
              rate: temp.Rate,
              quantity: temp.Quantity,
              machineType: "Thokai",
              total: temp.Rate * temp.Quantity,
            });
          } else {
            flag = false;
          }
        });
        if (flag) {
          for (var i = 0; i < results.length; i++) {
            var data = JSON.stringify(results[i]);
            $.ajax({
              url: that.uri,
              type: "POST",
              data: {
                method: "onCreateATransaction",
                data: data,
              },
              crossDomain: true,
              dataType: "json",
              success: function (sData) {
                messages = messages + sData[0] + "\n";
                if (i === results.length) {
                  MessageBox.success(messages);
                }
              },
              error: function (request, error) {
                MessageBox.error(request.responseText);
                if (i === results.length && messages.length > 0) {
                  MessageBox.success(messages);
                  that._handleRouteMatched();
                }
              },
            });
          }
        } else {
          if (!clientFlag) {
            MessageBox.error("Maintain Client in Master Data");
          } else {
            MessageBox.error("All fields are mandatory!");
          }
        }
      },

      onResetTransaction: function (oEvent) {
        this.getFirstRow();
        this._handleRouteMatched();
      },

      saveClient: function (client) {
        var that = this;
        var dataClient = {
          Client: client,
        };
        // Save Labour's Data
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "onCreateClient",
            data: JSON.stringify(dataClient),
          },
          dataType: "json",
          success: function (success) {},
          error: function (request, error) {},
        });
      },
    });
  }
);
