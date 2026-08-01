sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.Notice", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this._iEditId = 0;
        this.oRouter
          .getRoute("Notice")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        this._loadClientList();
        this._loadNotices();
        this.onNewNotice();
      },

      onpressBack: function () {
        this.oRouter.navTo("Main");
      },

      // A notice without clients is global; show that explicitly in the list.
      formatClients: function (aClients) {
        if (!aClients || !aClients.length) {
          return "All clients";
        }
        return aClients.join(", ");
      },

      _loadClientList: function () {
        var that = this;
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getAllClients" },
          dataType: "json",
          success: function (dataClient) {
            var oModel = new JSONModel({ Clients_results: dataClient || [] });
            oModel.setSizeLimit(1000);
            that.getView().setModel(oModel, "ClientModel");
          },
          error: function () {
            MessageBox.error("Could not load the client list");
          },
        });
      },

      // Unlike the print screens this one needs the notices even while the
      // master switch is off, so it reads the endpoint directly.
      _loadNotices: function () {
        var that = this;
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getNotices", data: JSON.stringify({}) },
          dataType: "json",
          success: function (res) {
            var oModel = new JSONModel({ notices: (res && res.notices) || [] });
            oModel.setSizeLimit(500);
            that.getView().setModel(oModel, "noticeModel");
            that.byId("idNoticesEnabled").setState(!!res && res.enabled === 1);
          },
          error: function (request) {
            MessageBox.error("Could not load notices: " + request.responseText);
          },
        });
      },

      onToggleNotices: function (oEvent) {
        var oSwitch = oEvent.getSource();
        var bEnabled = oEvent.getParameter("state");

        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "setNoticesEnabled",
            data: JSON.stringify({ enabled: bEnabled ? 1 : 0 }),
          },
          dataType: "json",
          success: function (res) {
            if (res && res.status === "success") {
              MessageToast.show(
                bEnabled
                  ? "Notices will be printed on invoices"
                  : "Notices will not be printed on any invoice"
              );
            } else {
              // The switch would otherwise show a state the server never took.
              oSwitch.setState(!bEnabled);
              MessageBox.error(
                (res && res.error) || "The setting could not be saved"
              );
            }
          },
          error: function (request) {
            oSwitch.setState(!bEnabled);
            MessageBox.error("The setting could not be saved: " + request.responseText);
          },
        });
      },

      onNewNotice: function () {
        this._iEditId = 0;
        this.byId("idEditorTitle").setText("New Notice");
        this.byId("idNoticeText").setValue("");
        this.byId("idNoticeClients").setSelectedKeys([]);
        this.byId("idNoticeActive").setState(true);
      },

      onEditNotice: function (oEvent) {
        var oNotice = oEvent
          .getSource()
          .getBindingContext("noticeModel")
          .getObject();

        this._iEditId = oNotice.id;
        this.byId("idEditorTitle").setText("Edit Notice");
        this.byId("idNoticeText").setValue(oNotice.notice);
        this.byId("idNoticeClients").setSelectedKeys(oNotice.clients || []);
        this.byId("idNoticeActive").setState(oNotice.active === 1);
      },

      onSaveNotice: function () {
        var that = this;
        var sNotice = this.byId("idNoticeText").getValue().trim();

        if (!sNotice) {
          MessageBox.error("Please enter the notice text");
          return;
        }

        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "saveNotice",
            data: JSON.stringify({
              id: this._iEditId || "",
              notice: sNotice,
              active: this.byId("idNoticeActive").getState() ? 1 : 0,
              clients: this.byId("idNoticeClients").getSelectedKeys(),
            }),
          },
          dataType: "json",
          success: function (res) {
            if (res && res.status === "success") {
              MessageToast.show("Notice saved");
              that.onNewNotice();
              that._loadNotices();
            } else {
              MessageBox.error(
                (res && res.error) || "The notice could not be saved"
              );
            }
          },
          error: function (request) {
            MessageBox.error("The notice could not be saved: " + request.responseText);
          },
        });
      },

      onDeleteNotice: function (oEvent) {
        var that = this;
        var oNotice = oEvent
          .getSource()
          .getBindingContext("noticeModel")
          .getObject();

        MessageBox.confirm("Delete this notice?", {
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) {
              return;
            }
            $.ajax({
              url: that.uri,
              type: "POST",
              data: {
                method: "deleteNotice",
                data: JSON.stringify({ id: oNotice.id }),
              },
              dataType: "json",
              success: function (res) {
                if (res && res.status === "success") {
                  MessageToast.show("Notice deleted");
                  // Editing the row that just vanished would silently create a
                  // new notice on save, so reset the editor.
                  if (that._iEditId === oNotice.id) {
                    that.onNewNotice();
                  }
                  that._loadNotices();
                } else {
                  MessageBox.error(
                    (res && res.error) || "The notice could not be deleted"
                  );
                }
              },
              error: function (request) {
                MessageBox.error("The notice could not be deleted: " + request.responseText);
              },
            });
          },
        });
      },
    });
  }
);
