/*!
 * OpenUI5
 * (c) Copyright 2009-2020 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.define(['./isCrossOriginURL'],function(i){"use strict";var d=function a(r,h,t){r=typeof r==="string"?r.trim():r;if(!r&&t&&t!=="_self"&&i(h)){return"noopener noreferrer";}return r;};return d;});
