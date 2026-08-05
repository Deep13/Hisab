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

    // ---- Invoice notices (shared by Tagada Slip and the Invoice screen) ----
    // Notices are maintained in the Notice screen and printed at the top of a
    // client's invoice.

    // Yields the notices that may be printed: an empty list when the master
    // switch is off, and also on failure, since a notice must never block a print.
    loadNotices: function (fnDone) {
      $.ajax({
        url: "http://" + this.getHost(),
        type: "POST",
        data: { method: "getNotices", data: JSON.stringify({}) },
        dataType: "json",
        success: function (oResult) {
          if (!oResult || oResult.enabled !== 1) {
            fnDone([]);
            return;
          }
          fnDone(oResult.notices || []);
        },
        error: function () {
          fnDone([]);
        },
      });
    },

    // Active notices for one client: the global ones (no client picked on the
    // notice) plus the ones this client was explicitly picked for. A combined
    // "All" invoice covers many clients, so it only carries the global ones.
    filterNoticesFor: function (aNotices, sClient) {
      var sName = String(sClient || "").trim().toLowerCase();
      return (aNotices || []).filter(function (oNotice) {
        if (oNotice.active !== 1) {
          return false;
        }
        if (!oNotice.clients || oNotice.clients.length === 0) {
          return true;
        }
        if (sName === "all") {
          return false;
        }
        return oNotice.clients.some(function (sPicked) {
          return String(sPicked).trim().toLowerCase() === sName;
        });
      });
    },

    // ---- Recent clients (shared by all transaction screens) ----
    // Each screen keeps its own recent-client list, held only in memory. It
    // accumulates as you enter transactions and is preserved while navigating
    // between screens, but a browser page refresh recreates the view and
    // starts the list empty again. The list is not shown anywhere: it only
    // decides the order of the client suggestion list, so the parties you are
    // working with right now sit at the top of the dropdown.

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
      this.sortClientsByRecent();
    },

    // Reorders the client suggestion list so recently used clients come first,
    // most recent at the top. Everything else keeps the order the server sent
    // (alphabetical). Call this whenever ComboModel is (re)loaded, since a
    // fresh fetch arrives in plain alphabetical order.
    sortClientsByRecent: function () {
      var oComboModel = this.getView().getModel("ComboModel");
      var oRecentModel = this.getView().getModel("recentModel");
      if (!oComboModel || !oRecentModel) {
        return;
      }

      var aClients = oComboModel.getProperty("/Clients_results") || [];
      var aRecent = oRecentModel.getProperty("/clients") || [];
      if (!aClients.length || !aRecent.length) {
        return;
      }

      var mRank = {};
      aRecent.forEach(function (sClient, iIndex) {
        mRank[String(sClient).trim().toLowerCase()] = iIndex;
      });

      // Array.sort is stable, so returning 0 keeps the server's ordering for
      // the clients that have not been used yet.
      var aSorted = aClients.slice().sort(function (a, b) {
        var iA = mRank[String(a.client).trim().toLowerCase()];
        var iB = mRank[String(b.client).trim().toLowerCase()];
        if (iA === undefined && iB === undefined) {
          return 0;
        }
        if (iA === undefined) {
          return 1;
        }
        if (iB === undefined) {
          return -1;
        }
        return iA - iB;
      });

      oComboModel.setProperty("/Clients_results", aSorted);
    },
  });
});
