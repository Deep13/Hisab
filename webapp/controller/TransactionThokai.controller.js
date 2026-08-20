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
                // A fresh fetch is alphabetical; restore the recently-used order.
                that.sortClientsByRecent();
              },
              error: function (request, error) {},
            });
          },
          error: function (request, error) {},
        });
        // get First Row
        this.getFirstRow();
        // Recent client tokens for this screen
        this.initRecentClients("Thokai");
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
        // This screen saves many rows at once, so every name the master has
        // never seen is collected and confirmed in one prompt rather than
        // one dialog per row.
        var aNewClients = [];
        var mSeenNew = {};
        aRecords.results.forEach(function (temp) {
          if (!(!temp.Date && !temp.Client && !temp.Quantity && !temp.Rate)) {
            // De-duplicated case-insensitively, the same way isNewClient
            // matches, so "New One" and "new one" are not created twice.
            var sKey = String(temp.Client).trim().toLowerCase();
            if (that.isNewClient(temp.Client) && !mSeenNew[sKey]) {
              mSeenNew[sKey] = true;
              aNewClients.push(String(temp.Client).trim());
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
          var doSave = function () {
            aNewClients.forEach(function (sClient) {
              that.saveClient(sClient);
            });
            results.forEach(function (oRow) {
              that.addRecentClient(oRow.client);
            });
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
          };

          if (!aNewClients.length) {
            doSave();
          } else {
            MessageBox.confirm(
              (aNewClients.length === 1
                ? "\"" + aNewClients[0] + "\" is not in the client list."
                : "These names are not in the client list:\n\n  " +
                  aNewClients.join("\n  ")) +
                "\n\n" +
                (aNewClients.length === 1
                  ? "Add it as a new client?"
                  : "Add them as new clients?"),
              {
                title: aNewClients.length === 1 ? "New Client" : "New Clients",
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                onClose: function (sAction) {
                  if (sAction === MessageBox.Action.OK) {
                    doSave();
                  }
                },
              }
            );
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
