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
            };

            // An "All factories" preview is split per factory so each one adds
            // up on its own; a single-factory preview is just a list of one,
            // with its heading and subtotal suppressed.
            var oGrouped = that.groupInvoiceByFactory(dataClient);
            var total = oGrouped.total;

            invoiceData.factories = oGrouped.factories;
            invoiceData.multiFactory = oGrouped.multiFactory;
            invoiceData.total = total;
            invoiceData.notices = [];
            invoiceData.hasOd = false;
            invoiceData.od = 0;
            invoiceData.hasPaid = false;
            invoiceData.paid = 0;
            invoiceData.hasWrittenOff = false;
            invoiceData.writtenOff = 0;
            invoiceData.hasFinal = false;
            invoiceData.finalTotal = total;
            // Toggled by the "Exclude OD" box in the header; starts off so a
            // freshly opened invoice always shows the settlement figures.
            invoiceData.excludeOd = false;
            var oViewModel = new JSONModel(invoiceData);
            that.getView().setModel(oViewModel, "viewModel");

            // Dues carried in from earlier months, from the same source the
            // Tagada Slip uses. A combined "All" invoice has no single client,
            // so it carries no OD line.
            if (oData.Client && oData.Client !== "All") {
              $.ajax({
                url: that.uri,
                type: "POST",
                data: {
                  method: "getClientBalances",
                  data: JSON.stringify({
                    month: parseInt(oData.month, 10),
                    year: parseInt(oData.year, 10)
                  })
                },
                dataType: "json",
                success: function (res) {
                  if (!res || res.status !== "success") {
                    return;
                  }
                  var name = String(oData.Client).trim().toLowerCase();
                  var match = (res.rows || []).filter(function (r) {
                    return r.client.trim().toLowerCase() === name;
                  })[0];
                  if (!match) {
                    return;
                  }

                  // OD is what was owed coming into the month; paid is what
                  // came in during it. Either one alone is worth showing, so
                  // they are tested separately.
                  var od = parseFloat(match.od) || 0;
                  var paid = parseFloat(match.paid) || 0;
                  // Money the client was let off. Without this line the invoice
                  // would still bill them for an amount already forgiven.
                  var writtenOff = parseFloat(match.writtenOff) || 0;
                  if (!od && !paid && !writtenOff) {
                    return;
                  }

                  if (od) {
                    oViewModel.setProperty("/od", od);
                    oViewModel.setProperty("/odLabel", od < 0 ? "Adv" : "OD");
                    oViewModel.setProperty("/odDisplay",
                      od < 0 ? "- " + Math.abs(od) : od);
                    oViewModel.setProperty("/hasOd", true);
                  }
                  if (paid) {
                    oViewModel.setProperty("/paid", paid);
                    oViewModel.setProperty("/paidDisplay", "- " + Math.abs(paid));
                    oViewModel.setProperty("/hasPaid", true);
                  }
                  if (writtenOff) {
                    oViewModel.setProperty("/writtenOff", writtenOff);
                    oViewModel.setProperty("/writtenOffDisplay", "- " + Math.abs(writtenOff));
                    oViewModel.setProperty("/hasWrittenOff", true);
                  }
                  oViewModel.setProperty("/finalTotal", total + od - paid - writtenOff);
                  oViewModel.setProperty("/hasFinal", true);
                }
              });
            }

            // Notices are maintained in the Notice screen and printed above the
            // figures. They arrive separately so the invoice never waits on them.
            that.loadNotices(function (aNotices) {
              oViewModel.setProperty(
                "/notices",
                that.filterNoticesFor(aNotices, oData.Client).map(function (oNotice) {
                  return { text: "*" + oNotice.notice + "*" };
                })
              );
            });
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

      /**
       * Prints just the invoice by flagging it in the DOM and letting the print
       * stylesheet hide everything else.
       *
       * This used to swap document.body.innerHTML for the invoice, print, then
       * swap the old markup back. Assigning innerHTML rebuilds every node from
       * a string, so UI5 was left holding references to discarded elements and
       * every event listener went with them - the page came back looking right
       * but no button responded. Nothing is rebuilt here: two classes go on,
       * the browser prints, and the classes come off.
       */
      onPrintInvoice: function (oEvent) {
        var oTarget = this.byId("target");
        var oDom = oTarget && oTarget.getDomRef();
        if (!oDom) {
          jQuery.sap.log.error(
            'onPrint needs a valid target container [view|data:targetId="SID"]'
          );
          return;
        }

        var iFallback;
        var bRestored = false;
        var fnRestore = function () {
          if (bRestored) {
            return;
          }
          bRestored = true;
          clearTimeout(iFallback);
          window.removeEventListener("afterprint", fnRestore);
          document.body.classList.remove("hisab-printing");
          oDom.classList.remove("hisab-print-area");
        };

        document.body.classList.add("hisab-printing");
        oDom.classList.add("hisab-print-area");

        // Restoring too early would print the whole page, so this waits for
        // afterprint rather than for print() to return - print() comes straight
        // back in some browsers instead of blocking until the dialog closes.
        // The classes only apply inside @media print, so a late restore costs
        // nothing on screen; the timer just stops them lingering for good.
        window.addEventListener("afterprint", fnRestore);
        iFallback = setTimeout(fnRestore, 60000);
        window.print();
      },
      onpressBack: function (oEvent) {
        this.oRouter.navTo("ClientPayment");
      },
    });
  }
);
