sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox"
], function (Controller, JSONModel, MessageBox) {
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

    // ---- Invoice figures (shared by the Invoice screen and the Tagada Slip) ----

    /**
     * Rolls one factory's transaction rows into the per-machine-type lines and
     * subtotals an invoice prints. Shared so the two screens that print
     * invoices can never disagree about a client's figures.
     */
    buildFactoryBlock: function (aRows) {
      var millingLot = 0;
      var oBlock = {
        Shaving: {}, Buffing: {}, Milling: {}, Softening: [], Tangan: {},
        ShavingTotal: 0, BuffingTotal: 0, SofteningTotal: 0, MillingTotal: 0,
        TanganTotal: 0
      };
      var total = 0;

      (aRows || []).forEach(function (element) {
        var sType = element.machineType;
        if (sType === "Shaving" || sType === "Buffing" ||
            sType === "Tangan" || sType === "Milling") {
          if (sType === "Milling") {
            millingLot++;
          }
          oBlock[sType][element.rate] =
            (oBlock[sType][element.rate] || 0) + parseFloat(element.quantity);
        } else if (sType === "Softening") {
          oBlock.Softening.push(element);
        }
        total = total + parseFloat(element.total);
      });
      oBlock.MillingLot = millingLot;

      var oLines = {
        Shaving: [], Buffing: [], Milling: [], Softening: [], Tangan: []
      };
      Object.keys(oLines).forEach(function (sType) {
        if (sType !== "Softening") {
          Object.keys(oBlock[sType]).forEach(function (sRate) {
            oLines[sType].push({
              desc: oBlock[sType][sRate] + " X " + sRate,
              total: sRate * oBlock[sType][sRate],
              // The invoice prints the lot count under each milling line, and
              // that line binds against the line itself - so the figure has to
              // travel on the line, not just on the factory block.
              millingLot: millingLot
            });
            oBlock[sType + "Total"] += sRate * oBlock[sType][sRate];
          });
        } else {
          oBlock.Softening.forEach(function (values) {
            var desc = values.quantity > 3
              ? values.quantity + "hrs = 400 + " + (values.quantity - 3) * values.rate
              : values.quantity + "hrs = 400";
            oLines.Softening.push({
              date: values.date,
              desc: desc,
              total: parseFloat(values.total)
            });
            oBlock.SofteningTotal += parseFloat(values.total);
          });
        }
      });

      oBlock.Shaving = oLines.Shaving;
      oBlock.Buffing = oLines.Buffing;
      oBlock.Milling = oLines.Milling;
      oBlock.Softening = oLines.Softening;
      oBlock.Tangan = oLines.Tangan;
      oBlock.total = total;
      return oBlock;
    },

    /**
     * Splits a client's month into one block per factory, each totalling on its
     * own, plus the total across all of them. A client billed at a single
     * factory comes back as a list of one with its heading suppressed, so the
     * invoice looks exactly as it always did.
     */
    groupInvoiceByFactory: function (aRows) {
      var that = this;
      var mByFactory = {};
      var aOrder = [];

      (aRows || []).forEach(function (element) {
        var sCc = String(element.cc == null ? "" : element.cc).trim() || "Unassigned";
        if (!mByFactory[sCc]) {
          mByFactory[sCc] = [];
          aOrder.push(sCc);
        }
        mByFactory[sCc].push(element);
      });
      aOrder.sort();

      var total = 0;
      var aFactories = aOrder.map(function (sCc) {
        var oBlock = that.buildFactoryBlock(mByFactory[sCc]);
        oBlock.cc = sCc;
        total += oBlock.total;
        return oBlock;
      });

      var bMulti = aFactories.length > 1;
      aFactories.forEach(function (oBlock) {
        oBlock.showHeader = bMulti;
      });

      return { factories: aFactories, multiFactory: bMulti, total: total };
    },

    // ---- New client confirmation (shared by all transaction screens) ----
    // A client name typed by hand is added to the master automatically. That
    // is convenient but silently turns a typo into a permanent client, so a
    // name the master has never seen is confirmed first.

    isNewClient: function (sClient) {
      var oComboModel = this.getView().getModel("ComboModel");
      if (!oComboModel || !sClient) {
        return false;
      }
      var sName = String(sClient).trim().toLowerCase();
      if (!sName) {
        return false;
      }
      var aClients = oComboModel.getProperty("/Clients_results") || [];
      // With no list loaded there is nothing to compare against, so treat the
      // name as known rather than prompting on every save.
      if (!aClients.length) {
        return false;
      }
      return !aClients.some(function (oClient) {
        return String(oClient.client).trim().toLowerCase() === sName;
      });
    },

    /**
     * Runs fnProceed once it is safe to save. For a name already in the master
     * that is immediately; for a new name it asks first and only proceeds if
     * confirmed. fnProceed receives true when the name still has to be created.
     */
    confirmNewClient: function (sClient, fnProceed) {
      if (!this.isNewClient(sClient)) {
        fnProceed(false);
        return;
      }
      MessageBox.confirm(
        "\"" + String(sClient).trim() + "\" is not in the client list.\n\n" +
          "Add it as a new client?",
        {
          title: "New Client",
          actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
          emphasizedAction: MessageBox.Action.OK,
          onClose: function (sAction) {
            if (sAction === MessageBox.Action.OK) {
              fnProceed(true);
            }
          }
        }
      );
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
