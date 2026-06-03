/*!
* OpenUI5
 * (c) Copyright 2009-2020 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
*/
sap.ui.define(["sap/ui/fl/apply/_internal/extensionPoint/Processor","sap/base/util/merge"],function(A,m){"use strict";var P={applyExtensionPoint:function(e){var E=m({defaultContent:[]},e);return A.registerExtensionPoint(E).then(A.createDefaultContent.bind(this,e,[])).then(A.addDefaultContentToExtensionPointInfo.bind(this,E));}};return P;});
