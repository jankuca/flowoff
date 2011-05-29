/*global Element, EJS*/

(function () {
"use strict";

var fn_dynamicLink = function (event) {
	var href = this.attr('href');
	if (href[0] === '#') {
		event.preventDefault();
		event.stopPropagation();
		app.call(href);
	}
};
var makeLinksDynamic = function (el) {
	el.find('a[href]').forEach(function (a) {
		a.removeEventListener('click', fn_dynamicLink, false);
		a.addEventListener('click', fn_dynamicLink, false);
	});
};


var Component = Function.inherit(function () {
	var component = this;

	this._components = {};
	this.element = null;
	this.data = {
		'component': this
	};
	this.NAME = this.constructor.prototype.NAME;

	Object.defineProperty(this, 'rendered', {
		get: function () {
			return (component.element !== null);
		},
	});
}, {
	'toString': function () {
		return '[object Component]';
	},
	'attach': function (key, component) {
		if (component instanceof Component !== true) {
			throw 'The passed object is not a component (' + key + ')';
		}

		if (this._components[key] === undefined) {
			this._components[key] = [];
		}
		this._components[key].push(component);
		component.parent = this;
	},
	'getAttached': function (key) {
		if (this._components[key] === undefined) {
			return [];
		}
		return this._components[key].slice();
	},
	'remove': function (key, component) {
		var components = this._components[key],
			c, cc;
		if (components === undefined) {
			return;
		}
		if (component === undefined || component === false) {
			delete this._components[key];
			if (component !== false) {
				this.rerender(key);
			}
			return;
		}
		
		for (c = 0, cc = components.length; c < cc; ++c) {
			if (components[c] === component) {
				if (component.element) {
					component.element.remove();
				}
				delete components[c];
				this._components[key] = components.compact();
				return;
			}
		}
	},
	'render': function () {
		if (!this._template) {
			throw 'Missing component template ' + this.toString();
		}

		var ejs = new EJS({
			'text': this._template
		});
		var html = ejs.render(this.data);

		var div = new Element('div').html(html);
		div.find('*[components]').forEach(function (placeholder) {
			var key = placeholder.attr('components');
			if (key !== null) {
				this.getAttached(key).forEach(function (component) {
					if (typeof component.beforeRender === 'function') {
						component.beforeRender();
					}
					placeholder.insert(component.render());
					if (typeof component.afterRender === 'function') {
						component.afterRender();
					}
				});
			}
		}, this);

		this.element = div.firstChild;
		makeLinksDynamic(this.element);
		return this.element;
	},
	'rerender': function (key, not_rendered_only) {
		if (!this.element) {
			return;
		}

		if (arguments.length === 0) { // rerender the whole component
			var el = this.element;

			if (typeof this.beforeRender === 'function') {
				this.beforeRender();
			}
			el.insert({ after: this.render() });
			el.remove();
			if (typeof this.afterRender === 'function') {
				this.afterRender();
			}
			return;
		}

		// rerender only a section of the component
		var placeholder;
		var element_key = this.element.attr('components');
		if (element_key !== null && element_key === key) {
			placeholder = this.element;
		} else {
			placeholder = this.element.find('*[components="' + key + '"]').first();
		}
		if (placeholder === undefined) {
			console.warn('There is no such component placeholder "' + key + '".');
			return;
		}

		if (!not_rendered_only) {
			placeholder.html(null);
		}
		
		this.getAttached(key).forEach(function (component, i) {
			if (not_rendered_only && component.rendered) {
				return;
			}
			if (typeof component.beforeRender === 'function') {
				component.beforeRender();
			}
			if (!not_rendered_only || i === 0) {
				placeholder.insert(component.render());
			} else {
				placeholder.childNodes[i - 1].insert({ after: component.render() });
			}
			if (typeof component.afterRender === 'function') {
				component.afterRender();
			}
		});
	},
	'replace': function (key, components) {
		if (components instanceof Array !== true) {
			components = [components];
		}

		this._components[key] = [];
		components.forEach(function (component) {
			if (component instanceof Component !== true) {
				throw 'One of the passed objects is not a component (' + key + ')';
			}
			this._components[key].push(component);
		}, this);
		this.rerender(key);
	}
});

window.Component = Component;


EJS.Helpers.prototype.lang = function (key) {
	return app.lang(key, this._data);
};

})();