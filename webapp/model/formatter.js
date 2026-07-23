sap.ui.define([], function () {
  "use strict";
  return {
    statusReminder: function (on, months) {
      var service = new Date(on);
      var a = new Date(service.setMonth(service.getMonth() + parseInt(months)));
      if (a.toDateString() == new Date().toDateString()) {
        return "Error";
      }
      return "Success";
    },
    expiryDate: function (on, months) {
      var service = new Date(on);
      var a = new Date(service.setMonth(service.getMonth() + parseInt(months)));
      return a.toDateString();
    },
    serviceOn: function (on) {
      return new Date(on).toDateString();
    },

    /**
     * "2021-04-19" -> "19/04/2021". Machines that never had an expense come
     * back with a null date, which must stay blank rather than "Invalid Date".
     */
    displayDate: function (sDate) {
      if (!sDate) {
        return "";
      }
      var aParts = String(sDate).substring(0, 10).split("-");
      if (aParts.length !== 3) {
        return sDate;
      }
      return aParts[2] + "/" + aParts[1] + "/" + aParts[0];
    },

    amount: function (vAmount) {
      var fAmount = parseFloat(vAmount);
      if (isNaN(fAmount)) {
        fAmount = 0;
      }
      return fAmount.toLocaleString("en-IN");
    },

    amountState: function (vAmount) {
      var fAmount = parseFloat(vAmount);
      if (!fAmount) {
        return "None";
      }
      if (fAmount >= 5000) {
        return "Error";
      }
      if (fAmount >= 1000) {
        return "Warning";
      }
      return "Success";
    },
  };
});
