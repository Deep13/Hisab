/*!
 * OpenUI5
 * (c) Copyright 2009-2020 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
sap.ui.define(["./isCrossOriginURL","sap/ui/Device"],function(i,D){"use strict";var o=function a(u,w){var W;if(w!=="_self"&&i(u)){W="noopener,noreferrer";if(D.browser.msie||D.browser.edge){var n=window.open("about:blank",w,W);if(n){n.opener=null;n.location.href=u;}return null;}}return window.open(u,w,W);};return o;});
