(function () {
"use strict";

Object.defineProperty(window.HTMLFormElement.prototype, 'values', {
	get: function () {
		var values = {};
		this.find('input', 'select', 'textarea').forEach(function (item) {
			var name = item.attr('name');
			if (name) {
				values[name.replace('__', ':')] = item.value;
			}
		});

		return values;
	}
});

}());