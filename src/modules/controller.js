(function () {
"use strict";

var Controller = Function.inherit(function (route) {
	this._route = route;
}, {
	'view': function () {
		app.data.started = true;
		if (typeof this[this._route.view] !== 'function') {
			throw '404 Page Not Found (Missing view)';
		}
		document.fire('flowoff:callstart', this._route);
		this[this._route.view](this._route.params);
	},
});


window.Controller = Controller;

})();