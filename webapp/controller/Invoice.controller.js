sap.ui.define(
  ["../controller/BaseController", "sap/ui/model/json/JSONModel"],
  function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.Invoice", {
      /**
       * Called when a controller is instantiated and its View controls (if available) are already created.
       * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
       * @memberOf Hisab.Hisab.view.Invoice
       */
      checkLength: function (data) {
        if (data.length > 0 || data.desc) {
          return true;
        } else {
          return false;
        }
      },
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("Invoice")
          .attachPatternMatched(this._handleRouteMatched, this);
      },
      _handleRouteMatched: function (oEvent) {
        var millingLot = 0;
        var that = this;
        var dataView = oEvent.getParameter("arguments").clientData;
        var oData = JSON.parse(dataView);
        var months = [
          "JANUARY",
          "FEBRUARY",
          "MARCH",
          "APRIL",
          "MAY",
          "JUNE",
          "JULY",
          "AUGUST",
          "SEPTEMBER",
          "OCTOBER",
          "NOVEMBER",
          "DECEMBER",
        ];
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getClientInvoice",
            data: dataView,
          },
          dataType: "json",
          success: function (dataClient) {
            var invoiceData = {
              client: oData.Client,
              cc: oData.officeType,
              month: months[oData.month - 1],
              year: oData.year,
              Shaving: {},
              Buffing: {},
              Milling: {},
              Softening: [],
              Tangan: {},
              ShavingTotal: 0,
              BuffingTotal: 0,
              SofteningTotal: 0,
              MillingTotal: 0,
			   TanganTotal: 0,
            };
            var total = 0;
            dataClient.forEach((element) => {
              if (element.machineType == "Shaving") {
                if (invoiceData.Shaving[element.rate]) {
                  invoiceData.Shaving[element.rate] =
                    invoiceData.Shaving[element.rate] +
                    parseFloat(element.quantity);
                } else {
                  invoiceData.Shaving[element.rate] = parseFloat(
                    element.quantity
                  );
                }
              } else if (element.machineType == "Buffing") {
                if (invoiceData.Buffing[element.rate]) {
                  invoiceData.Buffing[element.rate] =
                    invoiceData.Buffing[element.rate] +
                    parseFloat(element.quantity);
                } else {
                  invoiceData.Buffing[element.rate] = parseFloat(
                    element.quantity
                  );
                }
              } else if (element.machineType == "Tangan") {
                if (invoiceData.Tangan[element.rate]) {
                  invoiceData.Tangan[element.rate] =
                    invoiceData.Tangan[element.rate] +
                    parseFloat(element.quantity);
                } else {
                  invoiceData.Tangan[element.rate] = parseFloat(
                    element.quantity
                  );
                }
              } else if (element.machineType == "Milling") {
                millingLot++;
                if (invoiceData.Milling[element.rate]) {
                  invoiceData.Milling[element.rate] =
                    invoiceData.Milling[element.rate] +
                    parseFloat(element.quantity);
                } else {
                  invoiceData.Milling[element.rate] = parseFloat(
                    element.quantity
                  );
                }
              } else if (element.machineType == "Softening") {
                invoiceData.Softening.push(element);
              }
              total = total + parseFloat(element.total);
              invoiceData.MillingLot = millingLot;
            });
            var invoiceObjData = {
              Shaving: [],
              Buffing: [],
              Milling: [],
              Softening: [],
			  Tangan: [],
            };
            Object.keys(invoiceObjData).forEach(function (val) {
              if (val !== "Softening") {
                Object.keys(invoiceData[val]).forEach(function (value) {
                  invoiceObjData[val].push({
                    desc: invoiceData[val][value] + " X " + value,
                    total: value * invoiceData[val][value],
                  });
                  invoiceData[val + "Total"] += value * invoiceData[val][value];
                });
              } else {
                invoiceData.Softening.forEach(function (values) {
                  var desc = "";
                  if (values.quantity > 3) {
                    desc =
                      values.quantity +
                      "hrs = 400 + " +
                      (values.quantity - 3) * values.rate;
                  } else {
                    desc = values.quantity + "hrs = 400";
                  }
                  invoiceObjData.Softening.push({
                    date: values.date,
                    desc: desc,
                    total: values.total,
                  });
                  invoiceData.SofteningTotal += parseFloat(values.total);
                });
              }
            });
            invoiceData.Shaving = invoiceObjData.Shaving;
            invoiceData.Buffing = invoiceObjData.Buffing;
            invoiceData.Milling = invoiceObjData.Milling;
            invoiceData.Softening = invoiceObjData.Softening;
			invoiceData.Tangan = invoiceObjData.Tangan;
            
            invoiceData.total = total;
            that.getView().setModel(new JSONModel(invoiceData), "viewModel");
          },
          error: function (request, error) {
            console.log(error);

            // that
            //   .getView()
            //   .byId("idTable")
            //   .setModel(new JSONModel({ results: [] }), "detailsModel");
            // that.byId("idTotal").setText("");
            // that.byId("idTable").setHeaderText("Client Transactions (0)");
          },
        });
      },

      onPrintInvoice: function (oEvent) {
        var oTarget = this.getView(),
          sTargetId = "target";

        if (sTargetId) {
          oTarget = oTarget.byId(sTargetId);
        }

        if (oTarget) {
          var $domTarget = oTarget.$()[0],
            sTargetContent = $domTarget.innerHTML,
            sOriginalContent = document.body.innerHTML;

          document.body.innerHTML = sTargetContent;
          window.print();
          document.body.innerHTML = sOriginalContent;
        } else {
          jQuery.sap.log.error(
            'onPrint needs a valid target container [view|data:targetId="SID"]'
          );
        }
      },
      onpressBack: function (oEvent) {
        this.oRouter.navTo("ClientPayment");
      },
    });
  }
);
