sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/BusyDialog",
    "sap/ui/core/Fragment",
    "sap/ui/model/Sorter",
  ],
  function (Controller, JSONModel, MessageBox, MessageToast, BusyDialog, Fragment, Sorter) {
    "use strict";

    var MONTHS = [
      "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
      "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
    ];

    // Parties billed at more than one factory are consolidated under this
    // heading; everyone else sits under the single factory they worked at.
    var ALL_GROUP = "All";

    // Old dues are kept in data/<factory>.csv, one file per factory.
    var FACTORIES = ["Factory 01", "Factory 02", "Factory 03", "Factory 04"];

    // Rows typed in by hand belong to no factory, so they sort last.
    var OTHER_GROUP = "Other";
    var OTHER_ORDER = 99;

    function money(n) {
      return parseFloat(n) || 0;
    }

    return Controller.extend("Hisab.Hisab.controller.TagadaSlip", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this.oRouter
          .getRoute("TagadaSlip")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        var currDate = new Date();
        this.byId("idMonth").setSelectedKey(("0" + (currDate.getMonth() + 1)).slice(-2));
        this.byId("idYear").setSelectedKey(currDate.getFullYear().toString());
        this._loadClientList();
      },

      onpressBack: function () {
        this.oRouter.navTo("Main");
      },

      _loadClientList: function () {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: { method: "getAllClients" },
          dataType: "json",
          success: function (dataClient) {
            var jModel = new JSONModel({ Clients_results: dataClient || [] });
            jModel.setSizeLimit(500);
            that.getView().setModel(jModel, "ClientModel");
          }
        });
      },

      onLoadData: function () {
        var that = this;
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();

        if (!month || !year) {
          return;
        }

        // One round trip for the whole month. This used to fetch a client list
        // and then a separate request per client, so a month took dozens.
        sap.ui.core.BusyIndicator.show(0);
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getTagadaSlip",
            data: JSON.stringify({
              month: parseInt(month, 10),
              year: parseInt(year, 10)
            })
          },
          dataType: "json",
          success: function (res) {
            sap.ui.core.BusyIndicator.hide();
            if (!res || res.status !== "success") {
              MessageBox.error((res && res.error) || "Could not load the slip");
              that._setTableData([]);
              return;
            }
            that._setTableData(that._buildRows(res));
          },
          error: function (request) {
            sap.ui.core.BusyIndicator.hide();
            MessageBox.error("Could not load the slip: " + request.responseText);
            that._setTableData([]);
          }
        });
      },

      /**
       * Turns a month's billing into slip rows.
       *
       * A party billed at more than one factory is consolidated into a single
       * "All" row at the top; everyone else sits under the one factory they
       * worked at. Every party therefore appears exactly once, which is what
       * lets OD and payments - held per client, never per factory - be shown
       * on the row without being counted twice.
       */
      _buildRows: function (res) {
        var mBalance = {};
        (res.balances || []).forEach(function (b) {
          mBalance[String(b.client).trim().toLowerCase()] = b;
        });

        var mClients = {};
        var mFactories = {};
        (res.billing || []).forEach(function (b) {
          var sKey = String(b.client).trim().toLowerCase();
          if (!mClients[sKey]) {
            mClients[sKey] = { partyName: b.client, offices: {}, current: 0 };
          }
          mClients[sKey].offices[b.cc] = (mClients[sKey].offices[b.cc] || 0) + money(b.current);
          mClients[sKey].current += money(b.current);
          mFactories[b.cc] = true;
        });

        var aFactories = Object.keys(mFactories).sort();
        var aRows = [];
        Object.keys(mClients).forEach(function (sKey) {
          var oClient = mClients[sKey];
          var aOffices = Object.keys(oClient.offices).sort();
          var bMulti = aOffices.length > 1;
          var oBal = mBalance[sKey] || {};
          var od = money(oBal.od);
          var paid = money(oBal.paid);

          aRows.push({
            partyName: oClient.partyName,
            offices: oClient.offices,
            current: oClient.current,
            od: od,
            paid: paid,
            total: oClient.current + od - paid,
            group: bMulti ? ALL_GROUP : aOffices[0],
            groupOrder: bMulti ? 0 : 1 + aFactories.indexOf(aOffices[0])
          });
        });
        return aRows;
      },

      _setTableData: function (rows) {
        this._prepareRows(rows);

        var oModel = this.getView().getModel("tagadaModel");
        if (!oModel) {
          oModel = new JSONModel({ rows: [] });
          oModel.setSizeLimit(1000);
          this.getView().setModel(oModel, "tagadaModel");
        }
        oModel.setProperty("/rows", rows);
        this._applyGrouping();
        this._updateGrandTotal();
      },

      /**
       * Orders the rows and hands out serial numbers.
       *
       * The sort key is precomputed and the table is sorted on that same key,
       * so what the SL numbers were handed out against is exactly what ends up
       * on screen. SL restarts in each section, so a factory's printed slip
       * reads 1, 2, 3 rather than carrying on from the section above.
       */
      _prepareRows: function (rows) {
        rows.forEach(function (r) {
          r.group = r.group || OTHER_GROUP;
          if (typeof r.groupOrder !== "number") {
            r.groupOrder = OTHER_ORDER;
          }
          r.sortKey = ("00" + r.groupOrder).slice(-3) + "|" +
            String(r.partyName || "").toLowerCase();
        });
        rows.sort(function (a, b) {
          if (a.sortKey === b.sortKey) { return 0; }
          return a.sortKey < b.sortKey ? -1 : 1;
        });

        var sGroup = null;
        var iSl = 0;
        rows.forEach(function (r) {
          if (r.group !== sGroup) {
            sGroup = r.group;
            iSl = 0;
          }
          r.sl = ++iSl;
        });
      },

      _applyGrouping: function () {
        var oBinding = this.byId("idTable").getBinding("items");
        if (!oBinding) {
          return;
        }
        oBinding.sort(new Sorter("sortKey", false, function (oCtx) {
          var sGroup = oCtx.getProperty("group") || OTHER_GROUP;
          return { key: sGroup, text: sGroup };
        }));
      },

      /** Sections in display order, used by both print paths and the export. */
      _groupedRows: function () {
        var oModel = this.getView().getModel("tagadaModel");
        if (!oModel) {
          return [];
        }
        var aGroups = [];
        var mByName = {};
        (oModel.getProperty("/rows") || []).forEach(function (r) {
          if (!r.partyName) {
            return;
          }
          var sGroup = r.group || OTHER_GROUP;
          if (!mByName[sGroup]) {
            mByName[sGroup] = { name: sGroup, order: r.groupOrder, rows: [] };
            aGroups.push(mByName[sGroup]);
          }
          mByName[sGroup].rows.push(r);
        });
        aGroups.sort(function (a, b) { return a.order - b.order; });
        return aGroups;
      },

      onOdChange: function (oEvent) {
        var oCtx = oEvent.getSource().getBindingContext("tagadaModel");
        var path = oCtx.getPath();
        var oModel = oCtx.getModel();
        var current = money(oModel.getProperty(path + "/current"));
        var paid = money(oModel.getProperty(path + "/paid"));
        var od = money(oEvent.getParameter("value"));
        oModel.setProperty(path + "/od", od);
        oModel.setProperty(path + "/total", current + od - paid);
        this._updateGrandTotal();
      },

      onAddRow: function () {
        var oModel = this.getView().getModel("tagadaModel");
        if (!oModel) {
          oModel = new JSONModel({ rows: [] });
          oModel.setSizeLimit(1000);
          this.getView().setModel(oModel, "tagadaModel");
        }
        var rows = oModel.getProperty("/rows") || [];
        rows.push({
          sl: 0,
          partyName: "",
          current: 0,
          od: 0,
          paid: 0,
          total: 0,
          group: OTHER_GROUP,
          groupOrder: OTHER_ORDER
        });
        this._setTableData(rows);
      },

      onDeleteRow: function (oEvent) {
        var oCtx = oEvent.getSource().getBindingContext("tagadaModel");
        var oModel = oCtx.getModel();
        var oRow = oCtx.getObject();
        var rows = oModel.getProperty("/rows") || [];
        // The table is sorted, so the binding path index is not the array
        // index - find the row itself rather than trusting the path.
        var iIndex = rows.indexOf(oRow);
        if (iIndex === -1) {
          return;
        }
        rows.splice(iIndex, 1);
        this._setTableData(rows);
      },

      _updateGrandTotal: function () {
        var oModel = this.getView().getModel("tagadaModel");
        if (!oModel) { return; }
        var rows = oModel.getProperty("/rows") || [];
        var grand = 0;
        rows.forEach(function (r) {
          grand += parseFloat(r.total) || 0;
        });
        this.byId("idGrandTotal").setText("Grand Total: " + grand);
      },

      // ==================== OLD DATA (CSV) ====================

      // Old dues live in data/<factory>.csv and are maintained by hand, so they
      // are pulled in on demand rather than loaded with the month's figures.
      // With the office picker gone every factory's file is read at once; a
      // factory with no file is simply skipped.
      onFetchOldData: function () {
        var that = this;
        var iPending = FACTORIES.length;
        var aRows = [];
        var aMissing = [];

        sap.ui.core.BusyIndicator.show(0);
        FACTORIES.forEach(function (sOffice) {
          $.ajax({
            url: that.uri,
            type: "POST",
            data: {
              method: "getOldData",
              data: JSON.stringify({ office: sOffice })
            },
            dataType: "json",
            success: function (res) {
              if (res && res.status === "success") {
                (res.rows || []).forEach(function (r) {
                  aRows.push(r);
                });
              } else {
                aMissing.push(sOffice);
              }
            },
            error: function () {
              aMissing.push(sOffice);
            },
            complete: function () {
              iPending--;
              if (iPending > 0) {
                return;
              }
              sap.ui.core.BusyIndicator.hide();
              if (aRows.length === 0) {
                MessageBox.information(
                  "No old data found. Checked: " + FACTORIES.join(", ")
                );
                return;
              }
              that._mergeOldData(aRows, "all factories");
            }
          });
        });
      },

      /**
       * Brings the file's rows into the table. A party already on the table
       * keeps its live Current figure and only takes the OD across, so nothing
       * is listed twice - a duplicate party name would also break the OD map
       * used when printing invoices. Parties not on the table are appended.
       */
      _mergeOldData: function (oldRows, office) {
        if (oldRows.length === 0) {
          MessageBox.information("No old data rows found for " + office);
          return;
        }

        var oModel = this.getView().getModel("tagadaModel");
        if (!oModel) {
          oModel = new JSONModel({ rows: [] });
          oModel.setSizeLimit(1000);
          this.getView().setModel(oModel, "tagadaModel");
        }
        var rows = oModel.getProperty("/rows") || [];

        var indexByName = {};
        rows.forEach(function (r, i) {
          if (r.partyName) {
            indexByName[r.partyName.trim().toLowerCase()] = i;
          }
        });

        // Updating an existing party overwrites an OD that may have been typed
        // in by hand, so every change is reported back for a quick check.
        var updated = [];
        var added = 0;

        oldRows.forEach(function (oldRow) {
          var key = oldRow.partyName.trim().toLowerCase();
          var od = parseFloat(oldRow.od) || 0;

          if (indexByName[key] !== undefined) {
            var row = rows[indexByName[key]];
            var previousOd = money(row.od);
            row.od = od;
            row.total = money(row.current) + od - money(row.paid);
            updated.push({
              partyName: row.partyName,
              oldOd: previousOd,
              newOd: od,
              total: row.total
            });
          } else {
            var current = money(oldRow.current);
            rows.push({
              sl: 0,
              partyName: oldRow.partyName,
              current: current,
              od: od,
              paid: 0,
              total: current + od,
              group: OTHER_GROUP,
              groupOrder: OTHER_ORDER
            });
            indexByName[key] = rows.length - 1;
            added++;
          }
        });

        this._setTableData(rows);

        if (updated.length > 0) {
          this._showOldDataResult(updated, added, office);
        } else {
          MessageToast.show("Old data from " + office + ": " + added + " added");
        }
      },

      _showOldDataResult: function (updated, added, office) {
        var that = this;
        var sSummary =
          updated.length + " existing " +
          (updated.length === 1 ? "party was" : "parties were") +
          " updated from " + office + ".csv" +
          (added > 0 ? ", and " + added + " new " + (added === 1 ? "party was" : "parties were") + " added." : ".");

        this.getView().setModel(
          new JSONModel({ updated: updated, summary: sSummary }),
          "oldDataModel"
        );

        if (this._pOldDataDialog) {
          this._pOldDataDialog.then(function (oDialog) {
            oDialog.open();
          });
          return;
        }
        this._pOldDataDialog = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.OldDataResult",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      onCloseOldDataDialog: function () {
        if (this._pOldDataDialog) {
          this._pOldDataDialog.then(function (oDialog) {
            oDialog.close();
          });
        }
      },

      // ==================== PRINT ====================

      onPrint: function () {
        var that = this;
        var aGroups = this._groupedRows();
        if (aGroups.length === 0) {
          MessageBox.information("Nothing to print yet");
          return;
        }
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();
        var monthName = MONTHS[parseInt(month, 10) - 1];

        var grandTotal = 0;
        aGroups.forEach(function (g) {
          g.rows.forEach(function (r) { grandTotal += money(r.total); });
        });

        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tagada Slip</title>';
        html += '<style>';
        html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
        html += 'body { font-family: "72", "72full", Arial, Helvetica, sans-serif; color: #32363a; padding: 20px; }';
        html += '.header { text-align: center; margin-bottom: 20px; }';
        html += '.header h1 { font-size: 22px; margin-bottom: 4px; }';
        html += '.header h2 { font-size: 16px; font-weight: normal; color: #6a6d70; }';
        html += 'table { width: 100%; border-collapse: collapse; font-size: 13px; }';
        html += 'th { background: #f2f2f2; border: 1px solid #bbb; padding: 8px 10px; text-align: left; font-weight: bold; }';
        html += 'th.num { text-align: right; }';
        html += 'td { border: 1px solid #bbb; padding: 6px 10px; }';
        html += 'td.num { text-align: right; }';
        html += 'td.center { text-align: center; }';
        html += '.grand td { font-weight: bold; font-size: 14px; background: #f2f2f2; }';
        html += '.section { page-break-after: always; }';
        html += '.section:last-child { page-break-after: auto; }';
        html += '.section h3 { font-size: 18px; margin-bottom: 10px; }';
        html += '</style></head><body>';

        html += '<div class="header">';
        html += '<h1>Tagada Slip</h1>';
        html += '<h2>' + monthName + ' ' + year + '</h2>';
        html += '</div>';

        // Consolidated parties come first, then one section per factory, each
        // starting on its own page so a factory's sheet can be handed over.
        aGroups.forEach(function (oGroup) {
          var sectionTotal = 0;
          html += '<div class="section">';
          html += '<h3>' + that._escapeHtml(oGroup.name) + '</h3>';
          html += '<table>';
          html += '<tr><th style="width:50px">SL</th><th>Party Name</th>'
            + '<th class="num" style="width:110px">Current</th>'
            + '<th class="num" style="width:110px">OD</th>'
            + '<th class="num" style="width:110px">Paid</th>'
            + '<th class="num" style="width:110px">Due</th>'
            + '<th style="width:140px"></th></tr>';

          oGroup.rows.forEach(function (r) {
            sectionTotal += money(r.total);
            html += '<tr>';
            html += '<td class="center">' + r.sl + '</td>';
            html += '<td>' + that._escapeHtml(r.partyName) + '</td>';
            html += '<td class="num">' + money(r.current) + '</td>';
            html += '<td class="num">' + money(r.od) + '</td>';
            html += '<td class="num">' + money(r.paid) + '</td>';
            html += '<td class="num">' + money(r.total) + '</td>';
            html += '<td></td>';
            html += '</tr>';
          });

          html += '<tr class="grand"><td colspan="5" style="text-align:right">'
            + that._escapeHtml(oGroup.name) + ' Total</td><td class="num">'
            + sectionTotal + '</td><td></td></tr>';
          html += '</table></div>';
        });

        html += '<table><tr class="grand"><td colspan="5" style="text-align:right">Grand Total</td>'
          + '<td class="num" style="width:110px">' + grandTotal + '</td><td style="width:140px"></td></tr></table>';
        html += '</body></html>';

        var printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.onload = function () {
          printWindow.print();
        };
      },

      // ==================== DOWNLOAD EXCEL ====================

      onDownloadExcel: function () {
        var aGroups = this._groupedRows();
        if (aGroups.length === 0) {
          MessageBox.information("Nothing to export yet");
          return;
        }
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();
        var monthName = MONTHS[parseInt(month, 10) - 1];

        var quote = function (v) {
          var s = String(v == null ? "" : v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };

        var grandTotal = 0;
        var csv = "Tagada Slip - " + monthName + " " + year + "\n";

        // Same sections as the print, in the same order.
        aGroups.forEach(function (oGroup) {
          var sectionTotal = 0;
          csv += "\n" + quote(oGroup.name) + "\n";
          csv += "SL,Party Name,Current,OD,Paid,Due\n";
          oGroup.rows.forEach(function (r) {
            sectionTotal += money(r.total);
            csv += r.sl + "," + quote(r.partyName) + "," + money(r.current) + "," +
              money(r.od) + "," + money(r.paid) + "," + money(r.total) + "\n";
          });
          grandTotal += sectionTotal;
          csv += ",," + quote(oGroup.name + " Total") + ",,," + sectionTotal + "\n";
        });

        csv += "\n,,Grand Total,,," + grandTotal + "\n";

        var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Tagada_" + monthName + "_" + year + ".csv";
        link.click();
        URL.revokeObjectURL(link.href);
      },

      // ==================== PRINT INVOICES ====================

      // One invoice needs one round trip per client, so a factory with many
      // clients takes a noticeable while before the print dialog appears.
      _showPrintBusy: function (sText) {
        if (!this._oPrintBusy) {
          this._oPrintBusy = new BusyDialog({
            title: "Print Invoices",
            text: "Please wait..."
          });
          this.getView().addDependent(this._oPrintBusy);
        }
        this._oPrintBusy.setText(sText);
        this._oPrintBusy.open();
      },

      _hidePrintBusy: function () {
        if (this._oPrintBusy) {
          this._oPrintBusy.close();
        }
      },

      /**
       * Prints one invoice per party on the slip, in the slip's own order -
       * consolidated parties first, then factory by factory - so the stack of
       * invoices matches the sheet they are collected against.
       *
       * The clients come off the table rather than from a fresh query, so the
       * OD and payment figures printed are exactly the ones on screen, edits
       * included.
       */
      onPrintInvoices: function () {
        var that = this;
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();

        var aParties = [];
        this._groupedRows().forEach(function (oGroup) {
          oGroup.rows.forEach(function (r) {
            aParties.push({
              client: r.partyName,
              group: oGroup.name,
              od: money(r.od),
              paid: money(r.paid)
            });
          });
        });

        if (aParties.length === 0) {
          MessageBox.information("Load the slip first, then print the invoices");
          return;
        }

        this._showPrintBusy("Loading notices...");
        this.loadNotices(function (notices) {
          that._notices = notices;
          that._fetchAllInvoices(aParties, month, year);
        });
      },

      _escapeHtml: function (text) {
        return String(text)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      },

      _fetchAllInvoices: function (aParties, month, year) {
        var that = this;
        var completed = 0;
        var allInvoices = [];
        var monthName = MONTHS[parseInt(month, 10) - 1];

        // A party whose invoice fails to load still counts, otherwise one bad
        // request would leave the print waiting forever.
        var onClientDone = function () {
          completed++;
          that._showPrintBusy(
            "Preparing invoices " + completed + " of " + aParties.length + "..."
          );
          if (completed === aParties.length) {
            that._openInvoicePrint(allInvoices);
          }
        };

        this._showPrintBusy("Preparing invoices 0 of " + aParties.length + "...");

        aParties.forEach(function (oParty, iOrder) {
          $.ajax({
            url: that.uri,
            type: "POST",
            data: {
              method: "getClientInvoice",
              data: JSON.stringify({
                Client: oParty.client,
                month: month,
                year: year,
                machineType: "All",
                // Every factory, so a party billed at two of them gets one
                // invoice broken down by factory rather than two invoices.
                officeType: "All"
              })
            },
            dataType: "json",
            success: function (dataClient) {
              if (dataClient && dataClient.length > 0) {
                var inv = that._processInvoiceData(
                  dataClient, oParty.client, oParty.group, monthName, year
                );
                inv.order = iOrder;
                inv.od = oParty.od;
                inv.paid = oParty.paid;
                inv.finalTotal = inv.total + oParty.od - oParty.paid;
                allInvoices.push(inv);
              }
              onClientDone();
            },
            error: onClientDone
          });
        });
      },

      /**
       * Builds one client's invoice, broken down by factory. The figures come
       * from the shared helper the Invoice screen uses, so a slip invoice and
       * the on-screen invoice for the same client always agree.
       */
      _processInvoiceData: function (dataClient, clientName, groupName, monthName, year) {
        var oGrouped = this.groupInvoiceByFactory(dataClient);
        return {
          client: clientName,
          cc: groupName,
          month: monthName,
          year: year,
          factories: oGrouped.factories,
          multiFactory: oGrouped.multiFactory,
          total: oGrouped.total
        };
      },

      _openInvoicePrint: function (allInvoices) {
        var that = this;
        if (allInvoices.length === 0) {
          this._hidePrintBusy();
          MessageBox.information("No invoice data found");
          return;
        }

        this._showPrintBusy("Opening print preview...");

        // Keep the slip's own order - consolidated parties first, then factory
        // by factory - so the printed stack matches the sheet.
        allInvoices.sort(function (a, b) { return a.order - b.order; });

        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Monthly Invoices</title>';
        html += '<style>';
        html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
        html += 'body { font-family: "72", "72full", Arial, Helvetica, sans-serif; color: #32363a; }';
        html += '.page { width: 70%; margin: 0 auto; padding: 40px 20px; }';
        html += '.page:not(:last-child) { page-break-after: always; }';
        html += '.client-name { text-align: center; font-size: 28px; font-weight: bold; margin-bottom: 2px; }';
        html += '.cc { text-align: center; font-size: 14px; color: #6a6d70; margin-bottom: 2px; }';
        html += '.month-year { text-align: center; font-size: 16px; margin-bottom: 20px; }';
        html += '.row { display: flex; align-items: baseline; }';
        html += '.col-left { width: 70%; padding-left: 40px; }';
        html += '.col-right { width: 30%; text-align: right; padding-right: 20px; }';
        html += '.header-row .col-right { font-size: 16px; font-weight: bold; padding-bottom: 8px; }';
        html += '.section-title { font-size: 16px; font-weight: bold; margin: 18px 0 6px 0; }';
        html += '.item { padding: 2px 0; font-size: 14px; }';
        html += '.subtotal .col-right { border-top: 1px solid #32363a; display: inline-block; min-width: 80px; text-align: right; padding-top: 2px; font-size: 14px; }';
        html += '.subtotal { padding: 2px 0; }';
        html += '.milling-lot { font-size: 14px; padding-left: 40px; }';
        html += '.charbi-line .col-left { display: flex; gap: 12px; }';
        html += '.grand-total { text-align: right; font-size: 20px; font-weight: bold; margin-top: 24px; padding-right: 20px; }';
        html += '.totals-block { margin-top: 24px; }';
        html += '.totals-row { display: flex; justify-content: flex-end; padding: 4px 0; padding-right: 20px; font-size: 16px; }';
        html += '.totals-row .label { min-width: 140px; text-align: right; padding-right: 20px; }';
        html += '.totals-row .value { min-width: 100px; text-align: right; }';
        html += '.totals-row.final { font-size: 20px; font-weight: bold; }';
        html += '.factory-name { text-align: center; font-size: 17px; font-weight: bold; margin: 20px 0 4px 0; }';
        html += '.factory-total { font-size: 17px; font-weight: bold; margin-top: 6px; }';
        html += '.notice-block { margin-bottom: 16px; }';
        html += '.notice-item { font-size: 16px; font-weight: bold; text-decoration: underline; text-align: center; padding: 2px 0; white-space: pre-wrap; }';
        html += '@media print { .page { width: 100%; padding: 20px 15px; } }';
        html += '</style></head><body>';

        allInvoices.forEach(function (inv) {
          html += '<div class="page">';
          html += '<div class="client-name">' + inv.client + '</div>';
          html += '<div class="cc">' + inv.cc + '</div>';
          html += '<div class="month-year">' + inv.month + ' ' + inv.year + '</div>';

          // Notices sit above the figures so they are read first.
          var notices = that.filterNoticesFor(that._notices, inv.client);
          if (notices.length > 0) {
            html += '<div class="notice-block">';
            notices.forEach(function (n) {
              html += '<div class="notice-item">*' + that._escapeHtml(n.notice) + '*</div>';
            });
            html += '</div>';
          }

          html += '<div class="row header-row"><div class="col-left"></div><div class="col-right">Total</div></div>';

          var sections = [
            { key: "Shaving", title: "Shaving", totalKey: "ShavingTotal" },
            { key: "Buffing", title: "Buffing", totalKey: "BuffingTotal" },
            { key: "Milling", title: "Milling", totalKey: "MillingTotal" },
            { key: "Softening", title: "Charbi", totalKey: "SofteningTotal" },
            { key: "Tangan", title: "Tangan", totalKey: "TanganTotal" }
          ];

          // One block per factory, each totalling on its own. A party billed at
          // a single factory prints as it always did, with no extra heading.
          inv.factories.forEach(function (oFactory) {
            if (oFactory.showHeader) {
              html += '<div class="factory-name">' + that._escapeHtml(oFactory.cc) + '</div>';
            }

            sections.forEach(function (sec) {
              if (oFactory[sec.key].length > 0) {
                html += '<div class="section-title">' + sec.title + '</div>';
                oFactory[sec.key].forEach(function (item) {
                  if (sec.key === "Softening") {
                    html += '<div class="row item charbi-line"><div class="col-left"><span>' + item.date + '</span><span>' + item.desc + '</span></div><div class="col-right">' + item.total + '</div></div>';
                  } else {
                    html += '<div class="row item"><div class="col-left">' + item.desc + '</div><div class="col-right">' + item.total + '</div></div>';
                  }
                });
                if (sec.key === "Milling") {
                  html += '<div class="milling-lot">' + oFactory.MillingLot + ' Lot</div>';
                }
                html += '<div class="row subtotal"><div class="col-left"></div><div class="col-right">' + oFactory[sec.totalKey] + '</div></div>';
              }
            });

            if (oFactory.showHeader) {
              html += '<div class="totals-row factory-total"><span class="label">Total:</span><span class="value">' + oFactory.total + '</span></div>';
            }
          });

          html += '<div class="totals-block">';
          html += '<div class="totals-row"><span class="label">Grand Total:</span><span class="value">' + inv.total + '</span></div>';
          if (inv.od !== 0) {
            // A negative OD is money already in hand, so it prints as an
            // advance without its minus sign - the label carries the sign.
            var bAdvance = inv.od < 0;
            html += '<div class="totals-row"><span class="label">' + (bAdvance ? 'Adv:' : 'OD:') + '</span><span class="value">' + (bAdvance ? '- ' + Math.abs(inv.od) : inv.od) + '</span></div>';
          }
          if (inv.paid !== 0) {
            html += '<div class="totals-row"><span class="label">Payment Received:</span><span class="value">- ' + Math.abs(inv.paid) + '</span></div>';
          }
          if (inv.od !== 0 || inv.paid !== 0) {
            html += '<div class="totals-row final"><span class="label">Total:</span><span class="value">' + inv.finalTotal + '</span></div>';
          }
          html += '</div>';

          html += '</div>';
        });

        html += '</body></html>';

        var printWindow = window.open('', '_blank');
        if (!printWindow) {
          this._hidePrintBusy();
          MessageBox.error("Please allow pop-ups for this site to print the invoices");
          return;
        }
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        // The print tab is up and focused, so the loader here has done its job.
        this._hidePrintBusy();
        printWindow.onload = function () { printWindow.print(); };
      }
    });
  }
);
