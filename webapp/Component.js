sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device",
	"sap/ui/model/Model",
	"Hisab/Hisab/model/models"
], function (UIComponent, Device, Model, models) {
	"use strict";

	// The Model constructor hard-codes "this.iSizeLimit = 100", which truncates
	// every aggregation binding (client/labour dropdowns, transaction tables) at
	// 100 entries no matter how much data the backend returns. Setting a bigger
	// value on the prototype does not help, because the instance property from
	// the constructor shadows it. So intercept that first assignment instead:
	// the very first write always comes from the constructor and is raised,
	// every later write (an explicit setSizeLimit call) is honoured as-is.
	var DEFAULT_SIZE_LIMIT = 10000;
	Object.defineProperty(Model.prototype, "iSizeLimit", {
		configurable: true,
		get: function () {
			return this._iSizeLimit === undefined ? DEFAULT_SIZE_LIMIT : this._iSizeLimit;
		},
		set: function (iSize) {
			this._iSizeLimit = this._iSizeLimit === undefined ? DEFAULT_SIZE_LIMIT : iSize;
		}
	});

	return UIComponent.extend("Hisab.Hisab.Component", {

		metadata: {
			manifest: "json"
		},

		/**
		 * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
		 * @public
		 * @override
		 */
		init: function () {
			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);

			// enable routing
			this.getRouter().initialize();

			// set the device model
			this.setModel(models.createDeviceModel(), "device");
		}
	});
});