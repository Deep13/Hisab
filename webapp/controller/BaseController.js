sap.ui.define(["sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel"], function (Controller, JSONModel) {
  "use strict";

  return Controller.extend("Hisab.Hisab.controller.BaseController", {
    /**
     * Called when a controller is instantiated and its View controls (if available) are already created.
     * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
     * @memberOf Hisab.Hisab.view.ClientPayment
     */
    onInit: function () {},
    getHost: function () {
      return "localhost/Hisab/php/process.php";
    },

    // ---- Recent client tokens (shared by all transaction screens) ----
    // Each screen keeps its own recent-client list, held only in memory. It
    // accumulates as you enter transactions and is preserved while navigating
    // between screens, but a browser page refresh recreates the view and
    // starts the list empty again. The list is exposed as a "recentModel"
    // JSON model (/clients array) which the view renders as clickable tokens
    // below the entry table.

    initRecentClients: function (sMachineType) {
      // Only seed an empty list the first time this screen is shown in the
      // current page load; keep whatever has accumulated on later visits.
      if (!this.getView().getModel("recentModel")) {
        this.getView().setModel(new JSONModel({ clients: [] }), "recentModel");
      }
    },

    // Push a client to the front of the recent list (most recent first),
    // de-duplicated case-insensitively and capped at 12 entries.
    addRecentClient: function (sClient) {
      var oModel = this.getView().getModel("recentModel");
      if (!oModel || !sClient) {
        return;
      }
      sClient = String(sClient).trim();
      if (!sClient) {
        return;
      }
      var aClients = (oModel.getProperty("/clients") || []).filter(function (c) {
        return c.toLowerCase() !== sClient.toLowerCase();
      });
      aClients.unshift(sClient);
      if (aClients.length > 12) {
        aClients = aClients.slice(0, 12);
      }
      oModel.setProperty("/clients", aClients);
    },

    // Token pressed: drop the client name into the entry table's Client
    // field. Handles both the single-row model (/Client) and Thokai's
    // multi-row model (/results/0/Client).
    onSelectRecentClient: function (oEvent) {
      var sClient = oEvent.getSource().getText();
      var oTableModel = this.byId("idTable").getModel();
      if (!oTableModel) {
        return;
      }
      var oData = oTableModel.getData();
      if (oData && Array.isArray(oData.results)) {
        if (!oData.results.length) {
          oData.results.push({ Date: "", Client: "", Quantity: "", Rate: "" });
        }
        oTableModel.setProperty("/results/0/Client", sClient);
      } else {
        oTableModel.setProperty("/Client", sClient);
      }
    },
  });
});
