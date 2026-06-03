sap.ui.define(
  [
    "../controller/BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
  ],
  function (Controller, JSONModel, MessageBox) {
    "use strict";

    return Controller.extend("Hisab.Hisab.controller.Analytics", {
      onInit: function () {
        this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
        this.http = "http://";
        this.uri = this.http + this.getHost();
        this._monthNames = [
          "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
          "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
        ];
        this._labourMonthChart = null;
        this._labourWeekChart = null;
        this._labourCompareChart = null;
        this._clientChart = null;
        this.oRouter
          .getRoute("Analytics")
          .attachPatternMatched(this._handleRouteMatched, this);
      },

      _handleRouteMatched: function () {
        this._loadLabourList();
      },

      onpressBack: function () {
        this.oRouter.navTo("Main");
      },

      random_rgba: function (count) {
        var colors = [];
        for (var i = 0; i < count; i++) {
          var o = Math.round, r = Math.random, s = 255;
          colors.push(
            "rgba(" + o(r() * s) + "," + o(r() * s) + "," + o(r() * s) + ",0.6)"
          );
        }
        return colors;
      },

      _getThresholdColors: function (values) {
        var bgColor = [];
        values.forEach(function (val) {
          if (val < 500000) {
            bgColor.push("rgba(255,0,0,0.7)");
          } else if (val < 650000) {
            bgColor.push("rgba(255,202,3,0.7)");
          } else {
            bgColor.push("rgba(23,191,51,0.7)");
          }
        });
        return bgColor;
      },

      onTabSelect: function (oEvent) {
        var key = oEvent.getParameter("key");
        if (key === "labour") {
          this._loadLabourList();
          this._initLabourCompareDefaults();
          this._loadLabourComparison();
        } else if (key === "matrix") {
          this._initMatrixDefaults();
          this._loadProcessMatrix();
        }
      },

      _loadLabourList: function () {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: { method: "getAllLabours" },
          dataType: "json",
          success: function (data) {
            that.getView().setModel(new JSONModel(data), "LabourModel");
          }
        });
      },

      // ==================== CLIENT DATA TAB ====================

      onRenderPL: function () {
        var that = this;
        this.getView().byId("idMonth").setVisible(false);

        $.ajax({
          url: that.uri,
          type: "POST",
          data: { method: "getAllTransaction" },
          dataType: "json",
          success: function (dataClient) {
            if (!dataClient || dataClient.length === 0) {
              return;
            }
            var dataSet = {};
            dataClient.forEach(function (val) {
              var key = that._monthNames[parseInt(val.month, 10) - 1] + " - " + val.year;
              dataSet[key] = (dataSet[key] || 0) + parseFloat(val.total);
            });

            var labels = Object.keys(dataSet);
            var values = Object.values(dataSet);
            var bgColor = that._getThresholdColors(values);

            // Destroy old chart
            if (that._clientChart) {
              that._clientChart.destroy();
              that._clientChart = null;
            }

            var chartHeight = Math.max(400, labels.length * 40);
            $("#myPLDiv").html("");
            $("#myPLDiv").append("<canvas id='myPLChart' style='height:" + chartHeight + "px'></canvas>");
            var ctx = document.getElementById("myPLChart").getContext("2d");

            that._clientChart = new Chart(ctx, {
              type: "bar",
              data: {
                labels: labels,
                datasets: [{
                  label: "Month wise Total",
                  backgroundColor: bgColor,
                  borderColor: bgColor,
                  borderWidth: 1,
                  barPercentage: 0.8,
                  categoryPercentage: 0.9,
                  data: values
                }]
              },
              options: {
                indexAxis: "y",
                elements: { bar: { borderWidth: 2 } },
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  tooltip: {
                    callbacks: {
                      label: function (context) {
                        return "Total: " + context.parsed.x.toLocaleString("en-IN");
                      }
                    }
                  }
                },
                onClick: function (e, ele) {
                  if (ele.length > 0) {
                    var selectedIndex = ele[0].index;
                    that._drillDownToClients(that._clientChart, that._clientChart.data.labels[selectedIndex]);
                  }
                }
              }
            });
          },
          error: function () {
            MessageBox.error("Failed to load transaction data");
          }
        });
      },

      _drillDownToClients: function (chart, monthLabel) {
        this.getView().byId("idMonth").setVisible(true);
        var that = this;
        var month = this._monthNames.indexOf(monthLabel.split(" - ")[0]) + 1;
        var year = monthLabel.split(" - ")[1];

        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getClientTransaction",
            data: JSON.stringify({
              Client: "All",
              month: month,
              year: year,
              machineType: "All",
              officeType: "All"
            })
          },
          dataType: "json",
          success: function (dataClient) {
            var dataSet = {};
            dataClient.forEach(function (val) {
              dataSet[val.client] = (dataSet[val.client] || 0) + parseFloat(val.total);
            });

            var labels = Object.keys(dataSet);
            var values = Object.values(dataSet);
            var bgColor = that.random_rgba(labels.length);

            var chartHeight = Math.max(400, labels.length * 40);
            chart.canvas.parentNode.style.height = chartHeight + "px";
            chart.canvas.style.height = chartHeight + "px";
            chart.data.labels = labels;
            chart.data.datasets = [{
              label: "Client wise - " + monthLabel,
              backgroundColor: bgColor,
              borderColor: bgColor,
              borderWidth: 1,
              barPercentage: 0.8,
              categoryPercentage: 0.9,
              data: values
            }];
            chart.options.onClick = null;
            chart.resize();
            chart.update();
          }
        });
      },

      // ==================== LABOUR DATA TAB ====================

      onLabourFilterChange: function () {
        var labourCombo = this.byId("idLabourCombo");
        var selectedItem = labourCombo.getSelectedItem();
        if (!selectedItem) {
          return;
        }
        var labourName = selectedItem.getText();
        var month = this.byId("idLabourMonth").getSelectedKey();
        var year = this.byId("idLabourYear").getSelectedKey();
        this._loadLabourData(labourName, month, year);
      },

      _loadLabourData: function (labourName, month, year) {
        var that = this;
        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getLabourAnalytics",
            data: JSON.stringify({ labour: labourName })
          },
          dataType: "json",
          success: function (transactions) {
            if (!transactions || transactions.length === 0) {
              that._clearLabourCharts();
              MessageBox.information("No transactions found for " + labourName);
              return;
            }

            // Filter by year
            var filtered = transactions;
            if (year && year !== "All") {
              filtered = filtered.filter(function (t) {
                return parseInt(t.year, 10) === parseInt(year, 10);
              });
            }

            // Month chart shows all months (within year filter)
            that._renderLabourMonthChart(filtered, labourName);

            // Week chart filters further by month
            var weekData = filtered;
            if (month && month !== "All") {
              weekData = weekData.filter(function (t) {
                return parseInt(t.month, 10) === parseInt(month, 10);
              });
            }

            if (weekData.length === 0) {
              if (that._labourWeekChart) {
                that._labourWeekChart.destroy();
                that._labourWeekChart = null;
              }
              $("#myLabourWeekDiv").html("<p style='color:#888;padding:20px'>No data for selected month</p>");
              return;
            }
            that._renderLabourWeekChart(weekData, labourName);
          },
          error: function () {
            MessageBox.error("Failed to load labour data");
          }
        });
      },

      _clearLabourCharts: function () {
        if (this._labourMonthChart) {
          this._labourMonthChart.destroy();
          this._labourMonthChart = null;
        }
        if (this._labourWeekChart) {
          this._labourWeekChart.destroy();
          this._labourWeekChart = null;
        }
        $("#myLabourMonthDiv").html("");
        $("#myLabourWeekDiv").html("");
      },

      _renderLabourMonthChart: function (transactions, labourName) {
        var that = this;
        var dataSet = {};

        transactions.forEach(function (val) {
          var key = that._monthNames[parseInt(val.month, 10) - 1] + " - " + val.year;
          dataSet[key] = (dataSet[key] || 0) + parseFloat(val.total);
        });

        var labels = Object.keys(dataSet);
        var values = Object.values(dataSet).map(function (v) { return Math.floor(v / 3); });
        var bgColor = this.random_rgba(labels.length);

        if (this._labourMonthChart) {
          this._labourMonthChart.destroy();
        }

        var chartHeight = Math.max(300, labels.length * 40);
        $("#myLabourMonthDiv").html("");
        $("#myLabourMonthDiv").append("<canvas id='labourMonthCanvas' style='height:" + chartHeight + "px'></canvas>");
        var ctx = document.getElementById("labourMonthCanvas").getContext("2d");

        this._labourMonthChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [{
              label: labourName + " - Monthly",
              backgroundColor: bgColor,
              borderColor: bgColor,
              borderWidth: 1,
              barPercentage: 0.8,
              categoryPercentage: 0.9,
              data: values
            }]
          },
          options: {
            indexAxis: "y",
            elements: { bar: { borderWidth: 2 } },
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return "Total: " + context.parsed.x.toLocaleString("en-IN");
                  }
                }
              }
            }
          }
        });
      },

      _renderLabourWeekChart: function (transactions, labourName) {
        var dataSet = {};

        transactions.forEach(function (val) {
          // date format: dd/mm/yyyy
          var parts = val.date.split("/");
          if (parts.length === 3) {
            var d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
            var weekStart = new Date(d);
            weekStart.setDate(d.getDate() - d.getDay() + 1); // Monday
            var weekLabel = ("0" + weekStart.getDate()).slice(-2) + "/" +
                            ("0" + (weekStart.getMonth() + 1)).slice(-2) + "/" +
                            weekStart.getFullYear();
            var key = "W/O " + weekLabel;
            dataSet[key] = (dataSet[key] || 0) + parseFloat(val.total);
          }
        });

        var labels = Object.keys(dataSet);
        var values = Object.values(dataSet).map(function (v) { return Math.floor(v / 3); });
        var bgColor = this.random_rgba(labels.length);

        if (this._labourWeekChart) {
          this._labourWeekChart.destroy();
        }

        var chartHeight = Math.max(300, labels.length * 40);
        $("#myLabourWeekDiv").html("");
        $("#myLabourWeekDiv").append("<canvas id='labourWeekCanvas' style='height:" + chartHeight + "px'></canvas>");
        var ctx = document.getElementById("labourWeekCanvas").getContext("2d");

        this._labourWeekChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [{
              label: labourName + " - Weekly",
              backgroundColor: bgColor,
              borderColor: bgColor,
              borderWidth: 1,
              barPercentage: 0.8,
              categoryPercentage: 0.9,
              data: values
            }]
          },
          options: {
            elements: { bar: { borderWidth: 2 } },
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return "Total: " + context.parsed.y.toLocaleString("en-IN");
                  }
                }
              }
            }
          }
        });
      },

      // ==================== PROCESS MATRIX TAB ====================

      _initMatrixDefaults: function () {
        var monthSel = this.byId("idMatrixMonth");
        var yearSel = this.byId("idMatrixYear");
        if (!monthSel.getSelectedKey()) {
          var currDate = new Date();
          monthSel.setSelectedKey(("0" + (currDate.getMonth() + 1)).slice(-2));
          yearSel.setSelectedKey(currDate.getFullYear().toString());
        }
      },

      onMatrixFilterChange: function () {
        this._loadProcessMatrix();
      },

      _loadProcessMatrix: function () {
        var that = this;
        var month = this.byId("idMatrixMonth").getSelectedKey();
        var year = this.byId("idMatrixYear").getSelectedKey();
        var office = this.byId("idMatrixOffice").getSelectedKey();
        if (!month || !year) { return; }

        $.ajax({
          url: that.uri,
          type: "POST",
          data: {
            method: "getClientTransaction",
            data: JSON.stringify({
              Client: "All",
              month: month,
              year: year,
              machineType: "All",
              officeType: office || "All"
            })
          },
          dataType: "json",
          success: function (transactions) {
            that._renderProcessMatrix(transactions || []);
          },
          error: function () {
            that._renderProcessMatrix([]);
          }
        });
      },

      _renderProcessMatrix: function (transactions) {
        var processes = ["Shaving", "Softening", "Tangan", "Milling", "Buffing"];
        var processColors = {
          Shaving: "#42a5f5",
          Softening: "#ab47bc",
          Tangan: "#ef5350",
          Milling: "#ffa726",
          Buffing: "#26a69a"
        };

        // Group: client -> process -> {count, total}
        var clientMap = {};
        transactions.forEach(function (t) {
          if (!t.client || !t.machineType) { return; }
          if (!clientMap[t.client]) {
            clientMap[t.client] = {};
            processes.forEach(function (p) {
              clientMap[t.client][p] = { count: 0, total: 0 };
            });
          }
          if (clientMap[t.client][t.machineType]) {
            clientMap[t.client][t.machineType].count += 1;
            clientMap[t.client][t.machineType].total += parseFloat(t.total) || 0;
          }
        });

        var clientNames = Object.keys(clientMap).sort();

        if (clientNames.length === 0) {
          $("#processMatrixDiv").html('<p style="padding:20px;color:#888">No data for selected month</p>');
          return;
        }

        var html = '<table style="border-collapse:collapse;width:100%;font-size:13px">';
        // Header row
        html += '<thead><tr>';
        html += '<th style="text-align:left;padding:10px 14px;background:#f5f5f5;border-bottom:2px solid #ddd;position:sticky;left:0">Client</th>';
        processes.forEach(function (p) {
          html += '<th style="text-align:center;padding:10px 14px;background:#f5f5f5;border-bottom:2px solid #ddd;min-width:110px">' + p + '</th>';
        });
        html += '<th style="text-align:center;padding:10px 14px;background:#f5f5f5;border-bottom:2px solid #ddd">Missing</th>';
        html += '</tr></thead><tbody>';

        clientNames.forEach(function (client, idx) {
          var rowBg = idx % 2 === 0 ? "#ffffff" : "#fafafa";
          var missingList = [];
          html += '<tr>';
          html += '<td style="padding:8px 14px;border-bottom:1px solid #eee;background:' + rowBg + ';font-weight:500">' + client + '</td>';
          processes.forEach(function (p) {
            var cell = clientMap[client][p];
            if (cell.count > 0) {
              html += '<td style="padding:4px;border-bottom:1px solid #eee;background:' + rowBg + ';text-align:center">'
                + '<div title="' + p + ': ' + cell.count + ' entries, Total ' + cell.total.toLocaleString("en-IN") + '" '
                + 'style="background:' + processColors[p] + ';color:#fff;border-radius:4px;padding:6px 10px;font-weight:bold;display:inline-block;min-width:50px">'
                + cell.count + '</div></td>';
            } else {
              missingList.push(p);
              html += '<td style="padding:4px;border-bottom:1px solid #eee;background:' + rowBg + ';text-align:center">'
                + '<div style="background:#f5f5f5;border:1px dashed #ccc;border-radius:4px;padding:6px 10px;color:#999;display:inline-block;min-width:50px">—</div></td>';
            }
          });
          var missingColor = missingList.length === 0 ? "#7cb342" : (missingList.length >= 3 ? "#e53935" : "#fb8c00");
          var missingText = missingList.length === 0 ? "Complete" : missingList.length + " missing";
          html += '<td style="padding:8px 14px;border-bottom:1px solid #eee;background:' + rowBg + ';text-align:center;color:' + missingColor + ';font-weight:600" title="' + missingList.join(", ") + '">' + missingText + '</td>';
          html += '</tr>';
        });

        html += '</tbody></table>';
        html += '<p style="padding:10px 0;color:#666;font-size:12px">Numbers in cells represent transaction count for that process. Hover over a cell for details.</p>';

        $("#processMatrixDiv").html(html);
      },

      onPrintMatrix: function () {
        var matrixDiv = document.getElementById("processMatrixDiv");
        if (!matrixDiv || !matrixDiv.innerHTML.trim() || matrixDiv.innerHTML.indexOf("No data") > -1) {
          sap.m.MessageBox.information("No data available to print");
          return;
        }

        var office = this.byId("idMatrixOffice").getSelectedKey();
        var monthKey = this.byId("idMatrixMonth").getSelectedKey();
        var year = this.byId("idMatrixYear").getSelectedKey();
        var monthName = this._monthNames[parseInt(monthKey, 10) - 1] || "";

        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Process Matrix</title>';
        html += '<style>';
        html += '* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }';
        html += 'body { font-family: "72", Arial, Helvetica, sans-serif; color: #32363a; padding: 25px; }';
        html += 'h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }';
        html += 'h2 { text-align: center; font-size: 15px; color: #6a6d70; font-weight: normal; margin-bottom: 20px; }';
        html += 'table { width: 100%; font-size: 12px; }';
        html += '@media print { @page { size: landscape; } html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }';
        html += '</style></head><body>';
        html += '<h1>Process Matrix - R&amp;D Enterprise</h1>';
        html += '<h2>' + monthName + ' ' + year + ' &nbsp;|&nbsp; Office: ' + office + '</h2>';
        html += matrixDiv.innerHTML;
        html += '</body></html>';

        var w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
        w.focus();
        w.onload = function () { w.print(); };
      },

      // ==================== LABOUR COMPARISON ====================

      _initLabourCompareDefaults: function () {
        var dateRange = this.byId("idLabourDateRange");
        if (!dateRange.getDateValue()) {
          var today = new Date();
          var firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
          dateRange.setDateValue(firstDay);
          dateRange.setSecondDateValue(today);
        }
      },

      onLabourCompareChange: function () {
        this._loadLabourComparison();
      },

      _loadLabourComparison: function () {
        var that = this;
        var dateRange = this.byId("idLabourDateRange");
        var startDate = dateRange.getDateValue();
        var endDate = dateRange.getSecondDateValue();
        if (!startDate || !endDate) { return; }

        $.ajax({
          url: that.uri,
          type: "POST",
          data: { method: "getAllTransaction" },
          dataType: "json",
          success: function (transactions) {
            that._renderLabourComparison(transactions || [], startDate, endDate);
          },
          error: function () {
            that._renderLabourComparison([], startDate, endDate);
          }
        });
      },

      _renderLabourComparison: function (transactions, startDate, endDate) {
        var office = this.byId("idLabourCompareOffice").getSelectedKey();
        var start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        var end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59);

        // Filter transactions by date range and office
        var filtered = transactions.filter(function (t) {
          if (!t.date || !t.labour) { return false; }
          var parts = t.date.split("/");
          if (parts.length !== 3) { return false; }
          var d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          if (d < start || d > end) { return false; }
          if (office !== "All" && t.cc !== office) { return false; }
          return true;
        });

        // Group by labour (labour amount = total / 3)
        var labourMap = {};
        filtered.forEach(function (t) {
          labourMap[t.labour] = (labourMap[t.labour] || 0) + (parseFloat(t.total) || 0);
        });

        var entries = Object.keys(labourMap).map(function (name) {
          return { name: name, total: Math.floor(labourMap[name] / 3) };
        });
        entries.sort(function (a, b) { return b.total - a.total; });

        if (this._labourCompareChart) {
          this._labourCompareChart.destroy();
          this._labourCompareChart = null;
        }

        if (entries.length === 0) {
          $("#labourCompareDiv").html('<p style="padding:20px;color:#888">No data for selected date range</p>');
          return;
        }

        var labels = entries.map(function (e) { return e.name; });
        var values = entries.map(function (e) { return e.total; });
        var bgColor = values.map(function (v) {
          if (v < 2500) { return "rgba(239,83,80,0.7)"; }
          if (v < 5000) { return "rgba(255,167,38,0.7)"; }
          return "rgba(102,187,106,0.7)";
        });

        var chartHeight = Math.max(400, labels.length * 36);
        $("#labourCompareDiv").html("");
        $("#labourCompareDiv").append("<canvas id='labourCompareCanvas' style='height:" + chartHeight + "px'></canvas>");
        var ctx = document.getElementById("labourCompareCanvas").getContext("2d");

        // Custom plugin to draw marker lines at 2500 and 5000
        var markerLinePlugin = {
          id: "markerLines",
          afterDraw: function (chart) {
            var ctx = chart.ctx;
            var xAxis = chart.scales.x;
            var yAxis = chart.scales.y;
            var markers = [
              { value: 2500, color: "#e53935", label: "2500" },
              { value: 5000, color: "#43a047", label: "5000" }
            ];
            markers.forEach(function (m) {
              if (m.value < xAxis.min || m.value > xAxis.max) { return; }
              var xPos = xAxis.getPixelForValue(m.value);
              ctx.save();
              ctx.strokeStyle = m.color;
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              ctx.moveTo(xPos, yAxis.top);
              ctx.lineTo(xPos, yAxis.bottom);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = m.color;
              ctx.font = "bold 11px Arial";
              ctx.textAlign = "center";
              ctx.fillText(m.label, xPos, yAxis.top - 4);
              ctx.restore();
            });
          }
        };

        this._labourCompareChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [{
              label: "Labour Amount (Total / 3)",
              backgroundColor: bgColor,
              borderColor: bgColor,
              borderWidth: 1,
              barPercentage: 0.8,
              categoryPercentage: 0.9,
              data: values
            }]
          },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20 } },
            plugins: {
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    return "Labour Amount: " + ctx.parsed.x.toLocaleString("en-IN");
                  }
                }
              },
              legend: { display: true }
            },
            scales: {
              x: {
                beginAtZero: true,
                title: { display: true, text: "Labour Amount" }
              }
            }
          },
          plugins: [markerLinePlugin]
        });
      }
    });
  }
);
