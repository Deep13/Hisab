sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "Hisab/Hisab/model/formatter",
  ],
  function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    Sorter,
    MessageBox,
    MessageToast,
    Fragment,
    formatter
  ) {
    "use strict";

    // The two places an electricity meter can sit. Order matters: the meter
    // form's radio group maps its selected index onto this list.
    var ELECTRICITY_LOCATIONS = ["Factory", "Chowbaga"];

    // Order the printed bill sheet groups its sections in, independent of the
    // radio button order above.
    var LOCATION_PRINT_ORDER = ["Chowbaga", "Factory"];

    // Machine types in use across the app.
    var MACHINE_TYPES = [
      "Shaving",
      "Buffing",
      "Softening",
      "Milling",
      "Tangan",
      "Thokai",
    ];

    return Controller.extend("Hisab.Hisab.controller.MachineExpense", {
      formatter: formatter,

      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();

        this.getView().setModel(
          new JSONModel({ results: [] }),
          "machines"
        );
        this.getView().setModel(new JSONModel({ results: [] }), "report");
        this.getView().setModel(
          new JSONModel({
            offices: [],
            types: [],
            allTypes: MACHINE_TYPES.map(function (sType) {
              return { type: sType };
            }),
          }),
          "filters"
        );

        this.oRouter
          .getRoute("MachineExpense")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        this._loadOffices();
        this._loadMachines();
      },

      /* ---------------------------------------------------------------- data */

      /**
       * Offices come from the transaction data (Factory 01-04, Main ...) and are
       * merged with any office already present on a machine, so legacy machines
       * stay filterable even though their office name is no longer offered when
       * creating a machine.
       */
      _loadOffices: function () {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: { method: "getOffices" },
          dataType: "json",
          success: function (aOffices) {
            that._aMasterOffices = (aOffices || []).map(function (oOffice) {
              return oOffice.cc;
            });
            that._refreshFilterValues();
          },
          error: function () {
            that._aMasterOffices = [];
            that._refreshFilterValues();
          },
        });
      },

      _loadMachines: function () {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: { method: "getMachines" },
          dataType: "json",
          success: function (aMachines) {
            that
              .getView()
              .getModel("machines")
              .setData({ results: aMachines || [] });
            that._refreshFilterValues();
            that._applyMachineFilters();
          },
          error: function () {
            that.getView().getModel("machines").setData({ results: [] });
            MessageBox.error("Could not load machines");
          },
        });
      },

      _refreshFilterValues: function () {
        var aMachines = this.getView().getModel("machines").getProperty("/results") || [];
        var aOffices = (this._aMasterOffices || []).slice();
        var aTypes = MACHINE_TYPES.slice();

        aMachines.forEach(function (oMachine) {
          if (oMachine.cc && aOffices.indexOf(oMachine.cc) === -1) {
            aOffices.push(oMachine.cc);
          }
          if (oMachine.type && aTypes.indexOf(oMachine.type) === -1) {
            aTypes.push(oMachine.type);
          }
        });
        aOffices.sort();

        var oFilters = this.getView().getModel("filters");
        oFilters.setProperty(
          "/offices",
          aOffices.map(function (sOffice) {
            return { cc: sOffice };
          })
        );
        oFilters.setProperty(
          "/types",
          aTypes.map(function (sType) {
            return { type: sType };
          })
        );
      },

      /* ------------------------------------------------------- machine list */

      onMachineSearch: function () {
        this._applyMachineFilters();
      },

      onMachineFilterChange: function () {
        this._applyMachineFilters();
      },

      onClearMachineFilters: function () {
        this.byId("idMachineSearch").setValue("");
        this.byId("idMachineOffice").setSelectedKey("");
        this.byId("idMachineType").setSelectedKey("");
        this.byId("idSpendFilter").setSelectedKey("all");
        this._applyMachineFilters();
      },

      _applyMachineFilters: function () {
        var oTable = this.byId("idMachineTable");
        var oBinding = oTable.getBinding("items");
        if (!oBinding) {
          return;
        }

        var aFilters = [];
        var sQuery = this.byId("idMachineSearch").getValue().trim();
        var sOffice = this.byId("idMachineOffice").getSelectedKey();
        var sType = this.byId("idMachineType").getSelectedKey();
        var sSpend = this.byId("idSpendFilter").getSelectedKey();

        if (sQuery) {
          aFilters.push(
            new Filter({
              filters: [
                new Filter("machineName", FilterOperator.Contains, sQuery),
                new Filter("type", FilterOperator.Contains, sQuery),
                new Filter("cc", FilterOperator.Contains, sQuery),
              ],
              and: false,
            })
          );
        }
        if (sOffice) {
          aFilters.push(new Filter("cc", FilterOperator.EQ, sOffice));
        }
        if (sType) {
          aFilters.push(new Filter("type", FilterOperator.EQ, sType));
        }
        if (sSpend === "none") {
          aFilters.push(
            new Filter({
              path: "expenseCount",
              test: function (vCount) {
                return parseInt(vCount, 10) === 0;
              },
            })
          );
        } else if (sSpend === "some") {
          aFilters.push(
            new Filter({
              path: "expenseCount",
              test: function (vCount) {
                return parseInt(vCount, 10) > 0;
              },
            })
          );
        }

        oBinding.filter(aFilters);
        this._updateMachineSummary();
      },

      _updateMachineSummary: function () {
        var oTable = this.byId("idMachineTable");
        var oBinding = oTable.getBinding("items");
        if (!oBinding) {
          return;
        }

        // Totals must reflect the filtered set, not everything loaded.
        var fTotal = 0;
        oBinding.getContexts(0, oBinding.getLength()).forEach(function (oCtx) {
          fTotal += parseFloat(oCtx.getObject().totalAmount) || 0;
        });

        this.byId("idMachineCount").setText(
          "Machines (" + oBinding.getLength() + ")"
        );
        this.byId("idMachineTotal").setText(
          "Total spend: " + formatter.amount(fTotal)
        );
      },

      onSortMachines: function () {
        var that = this;
        if (this._pMachineSort) {
          this._pMachineSort.then(function (oDialog) {
            oDialog.open();
          });
          return;
        }
        this._pMachineSort = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.MachineSort",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      onMachineSortConfirm: function (oEvent) {
        var oItem = oEvent.getParameter("sortItem");
        if (!oItem) {
          return;
        }
        var bDescending = oEvent.getParameter("sortDescending");
        var sPath = oItem.getKey();
        var bNumeric =
          sPath === "totalAmount" || sPath === "expenseCount";

        var oSorter = new Sorter(sPath, bDescending);
        if (bNumeric) {
          oSorter.fnCompare = function (a, b) {
            return (parseFloat(a) || 0) - (parseFloat(b) || 0);
          };
        }
        this.byId("idMachineTable").getBinding("items").sort(oSorter);
      },

      onMachinePress: function (oEvent) {
        var oMachine = oEvent
          .getSource()
          .getBindingContext("machines")
          .getObject();
        this.oRouter.navTo("MachineExpenseDetail", {
          machineDetail: encodeURIComponent(
            JSON.stringify({
              cc: oMachine.cc,
              machineName: oMachine.machineName,
              type: oMachine.type,
            })
          ),
        });
      },

      /* ------------------------------------------------------- add a machine */

      onAddMachine: function () {
        var that = this;
        if (this._pAddDialog) {
          this._pAddDialog.then(function (oDialog) {
            that._resetMachineDialog();
            oDialog.open();
          });
          return;
        }
        this._pAddDialog = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.AddMachine",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      _resetMachineDialog: function () {
        ["idNewMachineOffice", "idNewMachineType"].forEach(
          function (sId) {
            var oControl = Fragment.byId(this.getView().getId(), sId);
            oControl.setSelectedKey("");
            oControl.setValueState("None");
          }.bind(this)
        );
        var oName = Fragment.byId(this.getView().getId(), "idNewMachineName");
        oName.setValue("");
        oName.setValueState("None");
      },

      onCancelMachine: function () {
        this._pAddDialog.then(function (oDialog) {
          oDialog.close();
        });
      },

      onSaveMachine: function () {
        var that = this;
        var sViewId = this.getView().getId();
        var oOffice = Fragment.byId(sViewId, "idNewMachineOffice");
        var oName = Fragment.byId(sViewId, "idNewMachineName");
        var oType = Fragment.byId(sViewId, "idNewMachineType");

        var sOffice = oOffice.getSelectedKey();
        var sName = oName.getValue().trim();
        var sType = oType.getSelectedKey();

        oOffice.setValueState(sOffice ? "None" : "Error");
        oName.setValueState(sName ? "None" : "Error");
        oType.setValueState(sType ? "None" : "Error");
        if (!sOffice || !sName || !sType) {
          MessageToast.show("Office, machine name and type are required");
          return;
        }

        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "createMachine",
            data: JSON.stringify({
              cc: sOffice,
              machineName: sName,
              type: sType,
            }),
          },
          dataType: "json",
          success: function (oResult) {
            if (oResult && oResult.status === "success") {
              that._pAddDialog.then(function (oDialog) {
                oDialog.close();
              });
              MessageToast.show(sName + " added to " + sOffice);
              that._loadMachines();
            } else {
              oName.setValueState("Error");
              MessageBox.error(
                (oResult && oResult.error) || "Could not create machine"
              );
            }
          },
          error: function (oRequest) {
            MessageBox.error(oRequest.responseText || "Could not create machine");
          },
        });
      },

      /* ------------------------------------------------------------- report */

      onTabSelect: function (oEvent) {
        var sKey = oEvent.getParameter("key");
        if (sKey === "report" && !this._bReportReady) {
          this._bReportReady = true;
          this.onReportAllTime();
        }
        if (sKey === "electricity" && !this._bElectricityReady) {
          this._bElectricityReady = true;
          var oNow = new Date();
          this.byId("idBillMonth").setSelectedKey((oNow.getMonth() + 1).toString());
          this.byId("idBillYear").setSelectedKey(oNow.getFullYear().toString());
          this._loadElectricity();
        }
      },

      // ==================== ELECTRICITY ====================

      _loadElectricity: function () {
        this._loadMeters();
        this._loadBills();
      },

      _elecModel: function () {
        var oModel = this.getView().getModel("elecModel");
        if (!oModel) {
          oModel = new JSONModel({ meters: [], bills: [], billTotalText: "0" });
          oModel.setSizeLimit(500);
          this.getView().setModel(oModel, "elecModel");
        }
        return oModel;
      },

      _loadMeters: function () {
        var that = this;
        $.ajax({
          url: this.uri,
          type: "POST",
          data: { method: "getElectricityMeters", data: JSON.stringify({}) },
          dataType: "json",
          success: function (meters) {
            that._elecModel().setProperty("/meters", meters || []);
          },
          error: function (request) {
            MessageBox.error("Could not load meters: " + request.responseText);
          },
        });
      },

      _loadBills: function () {
        var that = this;
        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "getElectricityBills",
            data: JSON.stringify({
              month: parseInt(this.byId("idBillMonth").getSelectedKey(), 10) || 0,
              year: parseInt(this.byId("idBillYear").getSelectedKey(), 10) || 0,
            }),
          },
          dataType: "json",
          success: function (res) {
            if (!res || res.status !== "success") {
              MessageBox.error((res && res.error) || "Could not load bills");
              return;
            }
            var oModel = that._elecModel();
            oModel.setProperty("/bills", res.rows || []);
            oModel.setProperty("/billTotalText", (res.total || 0).toLocaleString("en-IN"));
          },
          error: function (request) {
            MessageBox.error("Could not load bills: " + request.responseText);
          },
        });
      },

      onBillFilterChange: function () {
        this._loadBills();
      },

      // ---- Meters ----

      onAddMeter: function () {
        this._openMeterDialog(null);
      },

      onEditMeter: function (oEvent) {
        this._openMeterDialog(oEvent.getSource().getBindingContext("elecModel").getObject());
      },

      _openMeterDialog: function (oMeter) {
        var that = this;
        var bEdit = !!oMeter;
        // The radio group works on an index, so the stored location is mapped
        // both ways. An unrecognised value falls back to the first option.
        var iLocation = bEdit ? ELECTRICITY_LOCATIONS.indexOf(oMeter.cc) : 0;
        var oModel = new JSONModel({
          title: bEdit ? "Edit Meter" : "Add Meter",
          id: bEdit ? oMeter.id : 0,
          customer_id: bEdit ? oMeter.customer_id : "",
          meter_number: bEdit ? oMeter.meter_number : "",
          consumer_name: bEdit ? oMeter.consumer_name : "",
          nickname: bEdit ? oMeter.nickname : "",
          ccIndex: iLocation < 0 ? 0 : iLocation,
        });
        this.getView().setModel(oModel, "meterModel");

        if (this._pMeterDialog) {
          this._pMeterDialog.then(function (oDialog) { oDialog.open(); });
          return;
        }
        this._pMeterDialog = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.ElectricityMeter",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      onCancelMeter: function () {
        if (this._pMeterDialog) {
          this._pMeterDialog.then(function (oDialog) { oDialog.close(); });
        }
      },

      onSaveMeter: function () {
        var that = this;
        var oData = this.getView().getModel("meterModel").getData();

        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "saveElectricityMeter",
            data: JSON.stringify({
              id: oData.id,
              customer_id: oData.customer_id,
              meter_number: oData.meter_number,
              consumer_name: oData.consumer_name,
              nickname: oData.nickname,
              cc: ELECTRICITY_LOCATIONS[oData.ccIndex] || ELECTRICITY_LOCATIONS[0],
            }),
          },
          dataType: "json",
          success: function (res) {
            if (res && res.status === "success") {
              MessageToast.show("Meter saved");
              that.onCancelMeter();
              that._loadElectricity();
            } else {
              MessageBox.error((res && res.error) || "The meter could not be saved");
            }
          },
          error: function (request) {
            MessageBox.error("The meter could not be saved: " + request.responseText);
          },
        });
      },

      onDeleteMeter: function (oEvent) {
        var that = this;
        var oMeter = oEvent.getSource().getBindingContext("elecModel").getObject();
        var sExtra = parseInt(oMeter.billCount, 10) > 0
          ? " Its " + oMeter.billCount + " recorded bill(s) will be deleted too."
          : "";

        MessageBox.confirm("Delete meter '" + oMeter.consumer_name + "'?" + sExtra, {
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) {
              return;
            }
            $.ajax({
              url: that.uri,
              type: "POST",
              data: { method: "deleteElectricityMeter", data: JSON.stringify({ id: oMeter.id }) },
              dataType: "json",
              success: function (res) {
                if (res && res.status === "success") {
                  MessageToast.show("Meter deleted");
                  that._loadElectricity();
                } else {
                  MessageBox.error((res && res.error) || "The meter could not be deleted");
                }
              },
              error: function (request) {
                MessageBox.error("The meter could not be deleted: " + request.responseText);
              },
            });
          },
        });
      },

      // ---- Bills ----

      onAddBill: function () {
        var aMeters = this._elecModel().getProperty("/meters") || [];
        if (!aMeters.length) {
          MessageBox.information("Add a meter first, then record its monthly bill.");
          return;
        }
        this._openBillDialog(null);
      },

      onEditBill: function (oEvent) {
        this._openBillDialog(oEvent.getSource().getBindingContext("elecModel").getObject());
      },

      _openBillDialog: function (oBill) {
        var that = this;
        var bEdit = !!oBill;
        var oModel = new JSONModel({
          title: bEdit ? "Edit Bill" : "Add Bill",
          meter_id: bEdit ? oBill.meter_id.toString() : "",
          month: bEdit ? oBill.month.toString() : this.byId("idBillMonth").getSelectedKey(),
          year: bEdit ? oBill.year.toString() : this.byId("idBillYear").getSelectedKey(),
          amount: bEdit ? oBill.amount : "",
        });
        this.getView().setModel(oModel, "billModel");

        if (this._pBillDialog) {
          this._pBillDialog.then(function (oDialog) { oDialog.open(); });
          return;
        }
        this._pBillDialog = Fragment.load({
          id: this.getView().getId(),
          name: "Hisab.Hisab.fragments.ElectricityBill",
          controller: this,
        }).then(function (oDialog) {
          that.getView().addDependent(oDialog);
          oDialog.open();
          return oDialog;
        });
      },

      onCancelBill: function () {
        if (this._pBillDialog) {
          this._pBillDialog.then(function (oDialog) { oDialog.close(); });
        }
      },

      onSaveBill: function () {
        var that = this;
        var oData = this.getView().getModel("billModel").getData();

        if (!oData.meter_id) {
          MessageBox.error("Select a meter");
          return;
        }

        $.ajax({
          url: this.uri,
          type: "POST",
          data: {
            method: "saveElectricityBill",
            data: JSON.stringify({
              meter_id: parseInt(oData.meter_id, 10),
              month: parseInt(oData.month, 10),
              year: parseInt(oData.year, 10),
              amount: parseFloat(oData.amount) || 0,
            }),
          },
          dataType: "json",
          success: function (res) {
            if (res && res.status === "success") {
              MessageToast.show("Bill saved");
              that.onCancelBill();
              that._loadElectricity();
            } else {
              MessageBox.error((res && res.error) || "The bill could not be saved");
            }
          },
          error: function (request) {
            MessageBox.error("The bill could not be saved: " + request.responseText);
          },
        });
      },

      // Prints exactly what the month filter is showing, so the paper copy and
      // the screen can never disagree.
      onPrintBills: function () {
        var oModel = this.getView().getModel("elecModel");
        var aBills = (oModel && oModel.getProperty("/bills")) || [];
        var sMonthKey = this.byId("idBillMonth").getSelectedKey();
        var sYear = this.byId("idBillYear").getSelectedKey();

        if (!aBills.length) {
          MessageBox.information("No electricity bills recorded for this month to print.");
          return;
        }

        var MONTHS = [
          "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
          "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
        ];
        var sMonthName = MONTHS[parseInt(sMonthKey, 10) - 1] || sMonthKey;
        var esc = function (t) {
          return String(t == null ? "" : t)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        var money = function (n) { return (parseFloat(n) || 0).toLocaleString("en-IN"); };

        var fTotal = 0;
        aBills.forEach(function (b) {
          fTotal += parseFloat(b.amount) || 0;
        });

        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Electricity Bills - '
          + esc(sMonthName) + ' ' + esc(sYear) + '</title>';
        html += '<style>';
        html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
        html += 'body { font-family: "72", Arial, Helvetica, sans-serif; color: #32363a; padding: 30px; }';
        html += 'h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }';
        html += 'h2 { text-align: center; font-size: 15px; font-weight: normal; color: #6a6d70; margin-bottom: 20px; }';
        html += 'table { width: 100%; border-collapse: collapse; font-size: 13px; }';
        html += 'th { background: #f2f2f2; border: 1px solid #bbb; padding: 8px 10px; text-align: left; font-weight: bold; }';
        html += 'td { border: 1px solid #bbb; padding: 6px 10px; }';
        html += 'th.num, td.num { text-align: right; }';
        html += 'td.center { text-align: center; }';
        html += '.subtotal td { font-weight: bold; background: #f7f7f7; }';
        html += '.total td { font-weight: bold; background: #f2f2f2; font-size: 15px; }';
        html += '.section-title { font-size: 16px; font-weight: bold; margin: 22px 0 6px 0; }';
        html += 'table.grand { margin-top: 18px; }';
        html += '.count { margin-top: 14px; font-size: 13px; color: #6a6d70; }';
        html += '</style></head><body>';

        html += '<h1>Electricity Bills</h1>';
        html += '<h2>' + esc(sMonthName) + ' ' + esc(sYear) + '</h2>';

        // Bills are printed one section per location, Chowbaga first. Any
        // location outside the two known ones still gets its own section
        // rather than being dropped off the sheet.
        var mByLocation = {};
        aBills.forEach(function (b) {
          var sLocation = (b.cc || "").trim() || "(No location)";
          if (!mByLocation[sLocation]) {
            mByLocation[sLocation] = [];
          }
          mByLocation[sLocation].push(b);
        });

        var aOrdered = LOCATION_PRINT_ORDER.filter(function (loc) {
          return mByLocation[loc];
        });
        Object.keys(mByLocation).sort().forEach(function (loc) {
          if (aOrdered.indexOf(loc) === -1) {
            aOrdered.push(loc);
          }
        });

        aOrdered.forEach(function (sLocation) {
          var aRows = mByLocation[sLocation];
          var fSectionTotal = 0;
          aRows.forEach(function (b) { fSectionTotal += parseFloat(b.amount) || 0; });

          html += '<div class="section-title">' + esc(sLocation) + '</div>';
          html += '<table>';
          html += '<tr><th style="width:45px">SL</th><th style="width:150px">Nickname</th>'
            + '<th>Consumer Name</th><th style="width:140px">Customer ID</th>'
            + '<th style="width:140px">Meter Number</th>'
            + '<th class="num" style="width:130px">Amount</th></tr>';

          aRows.forEach(function (b, i) {
            html += '<tr>';
            html += '<td class="center">' + (i + 1) + '</td>';
            html += '<td>' + esc(b.nickname) + '</td>';
            html += '<td>' + esc(b.consumer_name) + '</td>';
            html += '<td>' + esc(b.customer_id) + '</td>';
            html += '<td>' + esc(b.meter_number) + '</td>';
            html += '<td class="num">' + money(b.amount) + '</td>';
            html += '</tr>';
          });

          html += '<tr class="subtotal"><td colspan="5">' + esc(sLocation) + ' Total</td>'
            + '<td class="num">' + money(fSectionTotal) + '</td></tr>';
          html += '</table>';
        });

        // Only worth a combined figure when more than one section was printed.
        if (aOrdered.length > 1) {
          html += '<table class="grand"><tr class="total"><td>Grand Total</td>'
            + '<td class="num" style="width:130px">' + money(fTotal) + '</td></tr></table>';
        }

        html += '<div class="count">' + aBills.length + ' bill(s) for '
          + esc(sMonthName) + ' ' + esc(sYear) + '</div>';
        html += '</body></html>';

        var w = window.open('', '_blank');
        if (!w) {
          MessageBox.error("Please allow pop-ups for this site to print");
          return;
        }
        w.document.write(html);
        w.document.close();
        w.focus();
        w.onload = function () { w.print(); };
      },

      onDeleteBill: function (oEvent) {
        var that = this;
        var oBill = oEvent.getSource().getBindingContext("elecModel").getObject();

        MessageBox.confirm("Delete this bill?", {
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) {
              return;
            }
            $.ajax({
              url: that.uri,
              type: "POST",
              data: { method: "deleteElectricityBill", data: JSON.stringify({ id: oBill.id }) },
              dataType: "json",
              success: function (res) {
                if (res && res.status === "success") {
                  MessageToast.show("Bill deleted");
                  that._loadElectricity();
                } else {
                  MessageBox.error((res && res.error) || "The bill could not be deleted");
                }
              },
              error: function (request) {
                MessageBox.error("The bill could not be deleted: " + request.responseText);
              },
            });
          },
        });
      },

      onReportLastYear: function () {
        var oTo = new Date();
        var oFrom = new Date();
        oFrom.setFullYear(oFrom.getFullYear() - 1);
        this._setReportRange(oFrom, oTo);
      },

      /**
       * Opening default: the whole recorded history, so the report never starts
       * empty just because the newest expense is older than a year.
       */
      onReportAllTime: function () {
        var aMachines =
          this.getView().getModel("machines").getProperty("/results") || [];
        var sEarliest = null;
        aMachines.forEach(function (oMachine) {
          if (
            oMachine.firstServicedOn &&
            (!sEarliest || oMachine.firstServicedOn < sEarliest)
          ) {
            sEarliest = oMachine.firstServicedOn;
          }
        });

        var oFrom = sEarliest ? new Date(sEarliest) : new Date();
        if (!sEarliest) {
          oFrom.setFullYear(oFrom.getFullYear() - 1);
        }
        this._setReportRange(oFrom, new Date());
      },

      _setReportRange: function (oFrom, oTo) {
        this.byId("idReportRange").setDateValue(oFrom);
        this.byId("idReportRange").setSecondDateValue(oTo);
        this.onRunReport();
      },

      onReportRangeChange: function (oEvent) {
        if (oEvent.getParameter("valid")) {
          this.onRunReport();
        }
      },

      onRunReport: function () {
        var that = this;
        var oRange = this.byId("idReportRange");
        var oFrom = oRange.getDateValue();
        var oTo = oRange.getSecondDateValue();

        if (!oFrom || !oTo) {
          MessageToast.show("Pick a date range first");
          return;
        }

        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getMachineExpenseReport",
            data: JSON.stringify({
              fromDate: that._toIsoDate(oFrom),
              toDate: that._toIsoDate(oTo),
              cc: that.byId("idReportOffice").getSelectedKey(),
              type: that.byId("idReportType").getSelectedKey(),
            }),
          },
          dataType: "json",
          success: function (aRows) {
            aRows = aRows || [];
            that.getView().getModel("report").setData({ results: aRows });
            that._updateReportKpis(aRows);
            that._renderChart(aRows);
          },
          error: function () {
            MessageBox.error("Could not load the report");
          },
        });
      },

      _toIsoDate: function (oDate) {
        var sMonth = ("0" + (oDate.getMonth() + 1)).slice(-2);
        var sDay = ("0" + oDate.getDate()).slice(-2);
        return oDate.getFullYear() + "-" + sMonth + "-" + sDay;
      },

      _updateReportKpis: function (aRows) {
        var fTotal = 0;
        var iEntries = 0;
        aRows.forEach(function (oRow) {
          fTotal += parseFloat(oRow.totalAmount) || 0;
          iEntries += parseInt(oRow.expenseCount, 10) || 0;
        });

        this.byId("idKpiTotal").setValue(formatter.amount(fTotal));
        this.byId("idKpiMachines").setValue(String(aRows.length));
        this.byId("idKpiEntries").setValue(String(iEntries));
        this.byId("idReportTitle").setText(
          "Breakdown (" + aRows.length + " machines, " + iEntries + " entries)"
        );
      },

      _renderChart: function (aRows) {
        var oDiv = document.getElementById("machineExpenseChartDiv");
        if (!oDiv || typeof Chart === "undefined") {
          return;
        }

        if (this._oChart) {
          this._oChart.destroy();
          this._oChart = null;
        }

        if (!aRows.length) {
          oDiv.innerHTML =
            "<p style='padding:1rem;color:#666'>No expenses in the selected range.</p>";
          return;
        }

        var aLabels = aRows.map(function (oRow) {
          return oRow.machineName + " (" + oRow.cc + ")";
        });
        var aValues = aRows.map(function (oRow) {
          return parseFloat(oRow.totalAmount) || 0;
        });
        var aColors = aValues.map(function (fValue) {
          if (fValue >= 5000) {
            return "#d32f2f";
          }
          if (fValue >= 1000) {
            return "#f9a825";
          }
          return "#7cb342";
        });

        // One row per machine, so the canvas has to grow with the result set.
        var iHeight = Math.max(360, aLabels.length * 34);
        oDiv.innerHTML =
          "<canvas id='machineExpenseChart' style='height:" + iHeight + "px'></canvas>";
        var oCtx = document
          .getElementById("machineExpenseChart")
          .getContext("2d");

        this._oChart = new Chart(oCtx, {
          type: "bar",
          data: {
            labels: aLabels,
            datasets: [
              {
                label: "Expense",
                backgroundColor: aColors,
                borderColor: aColors,
                borderWidth: 1,
                barPercentage: 0.8,
                categoryPercentage: 0.9,
                data: aValues,
              },
            ],
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function (oContext) {
                    var oRow = aRows[oContext.dataIndex];
                    return (
                      "Total: " +
                      oContext.parsed.x.toLocaleString("en-IN") +
                      "  (" +
                      oRow.expenseCount +
                      " entries)"
                    );
                  },
                },
              },
            },
          },
        });
      },

      onpressBack: function () {
        this.oRouter.navTo("Main");
      },
    });
  }
);
