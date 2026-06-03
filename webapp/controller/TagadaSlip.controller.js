sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, MessageBox) {
    "use strict";

    var MONTHS = [
      "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
      "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
    ];

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
        var office = this.byId("idOffice").getSelectedKey();
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();

        if (!office || !month || !year) {
          return;
        }

        // Show loader
        sap.ui.core.BusyIndicator.show(0);

        // Get all clients for this office/month/year
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getAllClientsWithParam",
            data: JSON.stringify({
              month: month,
              year: year,
              machineType: "All",
              officeType: office
            })
          },
          dataType: "json",
          success: function (clients) {
            if (!clients || clients.length === 0) {
              sap.ui.core.BusyIndicator.hide();
              that._setTableData([]);
              return;
            }
            // For each client, get their total
            var clientNames = clients.map(function (c) { return c.client; });
            that._fetchClientTotals(clientNames, month, year, office);
          },
          error: function () {
            sap.ui.core.BusyIndicator.hide();
            that._setTableData([]);
          }
        });
      },

      _fetchClientTotals: function (clientNames, month, year, office) {
        var that = this;
        var completed = 0;
        var rows = [];

        clientNames.forEach(function (clientName) {
          $.ajax({
            url: that.uri,
            type: "POST",
            data: {
              method: "getClientTransaction",
              data: JSON.stringify({
                Client: clientName,
                month: month,
                year: year,
                machineType: "All",
                officeType: office
              })
            },
            dataType: "json",
            success: function (transactions) {
              var current = 0;
              if (transactions && transactions.length > 0) {
                transactions.forEach(function (t) {
                  current += parseFloat(t.total) || 0;
                });
              }
              rows.push({
                partyName: clientName,
                current: current,
                od: 0,
                total: current
              });
              completed++;
              if (completed === clientNames.length) {
                sap.ui.core.BusyIndicator.hide();
                that._setTableData(rows);
              }
            },
            error: function () {
              rows.push({
                partyName: clientName,
                current: 0,
                od: 0,
                total: 0
              });
              completed++;
              if (completed === clientNames.length) {
                sap.ui.core.BusyIndicator.hide();
                that._setTableData(rows);
              }
            }
          });
        });
      },

      _setTableData: function (rows) {
        // Sort by party name
        rows.sort(function (a, b) {
          return a.partyName.localeCompare(b.partyName);
        });

        // Assign serial numbers
        for (var i = 0; i < rows.length; i++) {
          rows[i].sl = i + 1;
        }

        var oModel = new JSONModel({ rows: rows });
        oModel.setSizeLimit(500);
        this.getView().setModel(oModel, "tagadaModel");
        this._updateGrandTotal();
      },

      onOdChange: function (oEvent) {
        var oCtx = oEvent.getSource().getBindingContext("tagadaModel");
        var path = oCtx.getPath();
        var oModel = oCtx.getModel();
        var current = parseFloat(oModel.getProperty(path + "/current")) || 0;
        var od = parseFloat(oEvent.getParameter("value")) || 0;
        oModel.setProperty(path + "/od", od);
        oModel.setProperty(path + "/total", current + od);
        this._updateGrandTotal();
      },

      onAddRow: function () {
        var oModel = this.getView().getModel("tagadaModel");
        var rows = oModel.getProperty("/rows");
        rows.push({
          sl: rows.length + 1,
          partyName: "",
          current: 0,
          od: 0,
          total: 0
        });
        oModel.setProperty("/rows", rows);
      },

      onDeleteRow: function (oEvent) {
        var oCtx = oEvent.getSource().getBindingContext("tagadaModel");
        var path = oCtx.getPath();
        var index = parseInt(path.split("/").pop(), 10);
        var oModel = oCtx.getModel();
        var rows = oModel.getProperty("/rows");
        rows.splice(index, 1);
        // Renumber serial numbers
        for (var i = 0; i < rows.length; i++) {
          rows[i].sl = i + 1;
        }
        oModel.setProperty("/rows", rows);
        this._updateGrandTotal();
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

      // ==================== PRINT ====================

      onPrint: function () {
        var oModel = this.getView().getModel("tagadaModel");
        if (!oModel) { return; }
        var rows = oModel.getProperty("/rows") || [];
        var office = this.byId("idOffice").getSelectedKey();
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();
        var monthName = MONTHS[parseInt(month, 10) - 1];

        var grandTotal = 0;
        rows.forEach(function (r) { grandTotal += parseFloat(r.total) || 0; });

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
        html += '</style></head><body>';

        html += '<div class="header">';
        html += '<h1>' + office + '</h1>';
        html += '<h2>' + monthName + ' ' + year + '</h2>';
        html += '</div>';

        html += '<table>';
        html += '<tr><th style="width:50px">SL</th><th>Party Name</th><th class="num" style="width:120px">Current</th><th class="num" style="width:120px">OD</th><th class="num" style="width:120px">Total</th><th style="width:150px"></th></tr>';

        rows.forEach(function (r) {
          if (r.partyName) {
            html += '<tr>';
            html += '<td class="center">' + r.sl + '</td>';
            html += '<td>' + r.partyName + '</td>';
            html += '<td class="num">' + r.current + '</td>';
            html += '<td class="num">' + (r.od || 0) + '</td>';
            html += '<td class="num">' + r.total + '</td>';
            html += '<td></td>';
            html += '</tr>';
          }
        });

        html += '<tr class="grand"><td colspan="4" style="text-align:right">Grand Total</td><td class="num">' + grandTotal + '</td><td></td></tr>';
        html += '</table></body></html>';

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
        var oModel = this.getView().getModel("tagadaModel");
        if (!oModel) { return; }
        var rows = oModel.getProperty("/rows") || [];
        var office = this.byId("idOffice").getSelectedKey();
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();
        var monthName = MONTHS[parseInt(month, 10) - 1];

        var grandTotal = 0;
        rows.forEach(function (r) { grandTotal += parseFloat(r.total) || 0; });

        // Build CSV
        var csv = office + " - " + monthName + " " + year + "\n\n";
        csv += "SL,Party Name,Current,OD,Total\n";

        rows.forEach(function (r) {
          if (r.partyName) {
            var name = r.partyName.indexOf(",") > -1 ? '"' + r.partyName + '"' : r.partyName;
            csv += r.sl + "," + name + "," + r.current + "," + (r.od || 0) + "," + r.total + "\n";
          }
        });

        csv += ",Grand Total,,," + grandTotal + "\n";

        var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Tagada_" + office.replace(/ /g, "_") + "_" + monthName + "_" + year + ".csv";
        link.click();
      },

      // ==================== PRINT INVOICES ====================

      onPrintInvoices: function () {
        var that = this;
        var office = this.byId("idOffice").getSelectedKey();
        var month = this.byId("idMonth").getSelectedKey();
        var year = this.byId("idYear").getSelectedKey();

        // Build OD map from current tagada table
        var odMap = {};
        var oModel = this.getView().getModel("tagadaModel");
        if (oModel) {
          var rows = oModel.getProperty("/rows") || [];
          rows.forEach(function (r) {
            if (r.partyName) {
              odMap[r.partyName] = parseFloat(r.od) || 0;
            }
          });
        }

        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getAllClientsWithParam",
            data: JSON.stringify({
              month: month,
              year: year,
              machineType: "All",
              officeType: office
            })
          },
          dataType: "json",
          success: function (clients) {
            if (!clients || clients.length === 0) {
              MessageBox.information("No clients found for the selected period");
              return;
            }
            var clientNames = clients.map(function (c) { return c.client; });
            that._fetchAllInvoices(clientNames, month, year, office, odMap);
          },
          error: function () {
            MessageBox.error("Failed to fetch clients");
          }
        });
      },

      _fetchAllInvoices: function (clientNames, month, year, office, odMap) {
        var that = this;
        var completed = 0;
        var allInvoices = [];
        var monthName = MONTHS[parseInt(month, 10) - 1];

        clientNames.forEach(function (clientName) {
          $.ajax({
            url: that.uri,
            type: "POST",
            data: {
              method: "getClientInvoice",
              data: JSON.stringify({
                Client: clientName,
                month: month,
                year: year,
                machineType: "All",
                officeType: office
              })
            },
            dataType: "json",
            success: function (dataClient) {
              if (dataClient && dataClient.length > 0) {
                var inv = that._processInvoiceData(dataClient, clientName, office, monthName, year);
                inv.od = odMap[clientName] || 0;
                inv.finalTotal = inv.total + inv.od;
                allInvoices.push(inv);
              }
              completed++;
              if (completed === clientNames.length) {
                that._openInvoicePrint(allInvoices);
              }
            },
            error: function () {
              completed++;
              if (completed === clientNames.length) {
                that._openInvoicePrint(allInvoices);
              }
            }
          });
        });
      },

      _processInvoiceData: function (dataClient, clientName, cc, monthName, year) {
        var millingLot = 0;
        var invoiceData = {
          client: clientName, cc: cc, month: monthName, year: year,
          Shaving: {}, Buffing: {}, Milling: {}, Softening: [], Tangan: {},
          ShavingTotal: 0, BuffingTotal: 0, SofteningTotal: 0, MillingTotal: 0, TanganTotal: 0
        };
        var total = 0;

        dataClient.forEach(function (el) {
          var qty = parseFloat(el.quantity);
          if (el.machineType === "Softening") {
            invoiceData.Softening.push(el);
          } else if (el.machineType === "Milling") {
            millingLot++;
            invoiceData.Milling[el.rate] = (invoiceData.Milling[el.rate] || 0) + qty;
          } else if (invoiceData[el.machineType] !== undefined) {
            invoiceData[el.machineType][el.rate] = (invoiceData[el.machineType][el.rate] || 0) + qty;
          }
          total += parseFloat(el.total);
          invoiceData.MillingLot = millingLot;
        });

        ["Shaving", "Buffing", "Milling", "Tangan"].forEach(function (sec) {
          var arr = [];
          Object.keys(invoiceData[sec]).forEach(function (rate) {
            var qty = invoiceData[sec][rate];
            arr.push({ desc: qty + " X " + rate, total: rate * qty });
            invoiceData[sec + "Total"] += rate * qty;
          });
          invoiceData[sec] = arr;
        });

        var softArr = [];
        invoiceData.Softening.forEach(function (v) {
          var desc = v.quantity > 3
            ? v.quantity + "hrs = 400 + " + (v.quantity - 3) * v.rate
            : v.quantity + "hrs = 400";
          softArr.push({ date: v.date, desc: desc, total: parseFloat(v.total) });
          invoiceData.SofteningTotal += parseFloat(v.total);
        });
        invoiceData.Softening = softArr;
        invoiceData.total = total;
        return invoiceData;
      },

      _openInvoicePrint: function (allInvoices) {
        if (allInvoices.length === 0) {
          MessageBox.information("No invoice data found");
          return;
        }

        allInvoices.sort(function (a, b) { return a.client.localeCompare(b.client); });

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
        html += '@media print { .page { width: 100%; padding: 20px 15px; } }';
        html += '</style></head><body>';

        allInvoices.forEach(function (inv) {
          html += '<div class="page">';
          html += '<div class="client-name">' + inv.client + '</div>';
          html += '<div class="cc">' + inv.cc + '</div>';
          html += '<div class="month-year">' + inv.month + ' ' + inv.year + '</div>';
          html += '<div class="row header-row"><div class="col-left"></div><div class="col-right">Total</div></div>';

          var sections = [
            { key: "Shaving", title: "Shaving", totalKey: "ShavingTotal" },
            { key: "Buffing", title: "Buffing", totalKey: "BuffingTotal" },
            { key: "Milling", title: "Milling", totalKey: "MillingTotal" },
            { key: "Softening", title: "Charbi", totalKey: "SofteningTotal" },
            { key: "Tangan", title: "Tangan", totalKey: "TanganTotal" }
          ];

          sections.forEach(function (sec) {
            if (inv[sec.key].length > 0) {
              html += '<div class="section-title">' + sec.title + '</div>';
              inv[sec.key].forEach(function (item) {
                if (sec.key === "Softening") {
                  html += '<div class="row item charbi-line"><div class="col-left"><span>' + item.date + '</span><span>' + item.desc + '</span></div><div class="col-right">' + item.total + '</div></div>';
                } else {
                  html += '<div class="row item"><div class="col-left">' + item.desc + '</div><div class="col-right">' + item.total + '</div></div>';
                }
              });
              if (sec.key === "Milling") {
                html += '<div class="milling-lot">' + inv.MillingLot + ' Lot</div>';
              }
              html += '<div class="row subtotal"><div class="col-left"></div><div class="col-right">' + inv[sec.totalKey] + '</div></div>';
            }
          });

          html += '<div class="totals-block">';
          if (inv.od > 0) {
            html += '<div class="totals-row"><span class="label">Grand Total:</span><span class="value">' + inv.total + '</span></div>';
            html += '<div class="totals-row"><span class="label">OD:</span><span class="value">' + inv.od + '</span></div>';
            html += '<div class="totals-row final"><span class="label">Total:</span><span class="value">' + inv.finalTotal + '</span></div>';
          } else {
            html += '<div class="totals-row final"><span class="label">Grand Total:</span><span class="value">' + inv.total + '</span></div>';
          }
          html += '</div>';
          html += '</div>';
        });

        html += '</body></html>';

        var printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.onload = function () { printWindow.print(); };
      }
    });
  }
);
