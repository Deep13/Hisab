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
  };
});
