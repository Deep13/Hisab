/*
 * ! OpenUI5
 * (c) Copyright 2009-2020 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.define(["sap/ui/fl/ChangePersistenceFactory","sap/base/Log"],function(C,L){"use strict";var E={};function i(c,p,o){if(o.getSelector().name!==p.extensionPointName){return false;}return c.changesHavingCorrectViewPrefix(p,o);}E.getChangesForExtensionPoint=function(c,p){if(!p.extensionPointName){L.error("Missing name from extension point info!");return Promise.resolve([]);}return c.getChangesForComponent().then(function(a){return a.filter(i.bind(this,c,p));});};E.enhanceExtensionPointChanges=function(p,e){p.extensionPointName=e.name;var c=C.getChangePersistenceForControl(e.targetControl);return E.getChangesForExtensionPoint(c,p).then(function(a){a.forEach(function(o){if(o.isInInitialState()){o.setExtensionPointInfo(e);var s=o.getSelector();s.id=e.targetControl.getId();s.idIsLocal=false;o.setSelector(s);if(c.isChangeMapCreated()){c._addChangeAndUpdateDependencies(p.appComponent,o);}}});return a;});};return E;},true);
