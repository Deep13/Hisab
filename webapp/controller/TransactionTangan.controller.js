sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, MessageBox) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.TransactionTangan", {
      /**
       * Called when a controller is instantiated and its View controls (if available) are already created.
       * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
       * @memberOf Hisab.Hisab.view.TransactionTangan
       */
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("TransactionTangan")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function (oEvent) {
        this.updateValues();
        // get First Row
        this.getFirstRow();
      },
      updateValues: function () {
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
      },
      onpressBack: function (oEvent) {
        this.oRouter.navTo("Main");
      },

      getFirstRow: function (oEvent) {
        // Empty Model
        var data = {
          Date: "",
          Client: "",
          Quantity: "1",
          Rate: "400",
        };
        // Add Data
        var oModel = new sap.ui.model.json.JSONModel(data);
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
            Quantity: "1",
            Rate: "400",
          });
          this.byId("idTable").getModel().refresh();
        } else {
          MessageBox.error("All fields are mandatory!");
        }
      },
      onRefresh: function () {
        this.byId("idTable").getModel().setData({
          Date: "",
          Client: "",
          Quantity: "1",
          Rate: "300",
        });
        this.byId("idTable").getModel().refresh();
      },
      onSaveTransaction: function () {
        var that = this;
        var sOffice = this.byId("idOffice").getSelectedKey();
        var temp = this.byId("idTable").getModel().getData();
        var sLaborName = "";
        if (!temp.Date || !temp.Client || !temp.Quantity || !temp.Rate) {
          alert("Fill all details");
        } else {
          var data = JSON.stringify({
            client: temp.Client,
            labour: sLaborName,
            date: temp.Date,
            month: parseInt(temp.Date.substring(3, 5), 10),
            cc: sOffice,
            rate: temp.Rate,
            quantity: temp.Quantity,
            machineType: "Tangan",
            total: temp.Rate * temp.Quantity,
            year: parseInt(temp.Date.substring(6), 10),
          });
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
              // var messages = sData[0] + "\n";
              // that.onRefresh();
              that.getView().byId("datePicker").focus();
              // that._handleRouteMatched();
              that.updateValues();
              // MessageBox.success(messages);
            },
            error: function (request, error) {
              MessageBox.error(request.responseText);
              // if (i === results.length && messages.length > 0) {
              //   MessageBox.success(messages);
              //   that._handleRouteMatched();
              // }
            },
          });
          that.saveClient(temp.Client);
        }
      },
      // onSaveTransaction: function (oEvent) {
      //   var results = [],
      //     that = this,
      //     messages = [],
      //     flag = true,
      //     clientFlag = true;
      //   var sOffice = this.byId("idOffice").getSelectedKey();
      //   var sLaborName = "";
      //   // get All the records
      //   var aRecords = this.byId("idTable").getModel().getData();
      //   aRecords.results.forEach(function (temp) {
      //     if (!(!temp.Date && !temp.Client && !temp.Quantity && !temp.Rate)) {
      //       if (!that.ClientList.includes(temp.Client)) {
      //         that.saveClient(temp.Client);
      //       }
      //       results.push({
      //         client: temp.Client,
      //         labour: sLaborName,
      //         date: temp.Date,
      //         month: parseInt(temp.Date.substring(0, 2), 0),
      //         cc: sOffice,
      //         rate: temp.Rate,
      //         quantity: temp.Quantity,
      //         machineType: "Tangan",
      //         total: temp.Rate * temp.Quantity,
      //       });
      //     } else {
      //       flag = false;
      //     }
      //   });
      //   if (flag) {
      //     for (var i = 0; i < results.length; i++) {
      //       var data = JSON.stringify(results[i]);
      //       $.ajax({
      //         url: that.uri,
      //         type: "POST",
      //         data: {
      //           method: "onCreateATransaction",
      //           data: data,
      //         },
      //         crossDomain: true,
      //         dataType: "json",
      //         success: function (sData) {
      //           messages = messages + sData[0] + "\n";
      //           if (i === results.length) {
      //             MessageBox.success(messages);
      //           }
      //         },
      //         error: function (request, error) {
      //           MessageBox.error(request.responseText);
      //           if (i === results.length && messages.length > 0) {
      //             MessageBox.success(messages);
      //             that._handleRouteMatched();
      //           }
      //         },
      //       });
      //     }
      //   } else {
      //     if (!clientFlag) {
      //       MessageBox.error("Maintain Client in Master Data");
      //     } else {
      //       MessageBox.error("All fields are mandatory!");
      //     }
      //   }
      // },

      onResetTransaction: function (oEvent) {
        this.getFirstRow();
        this._handleRouteMatched();
      },

      saveClient: function (client) {
        var that = this;
        var dataClient = {
          id: client.toLowerCase().replace(/ /g, ""),
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
