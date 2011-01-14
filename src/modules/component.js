(function (window) {

var Component = Class.create(Observable, {
	'initialize': function () {
		this._components = [];
		this._element = null;
		this.data = {
			'component': this
		};
		this.name = this.constructor.prototype.name;
	},

	'isRendered': function () {
		return (this._element !== null);
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
				console.log(component);
				if (component._element) {
					component._element.remove();
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

		var div = new Element('div').update(html);
		div.select('*[components]').each(function (placeholder) {
			var key = placeholder.readAttribute('components');
			if (key !== null) {
				var components = this.getAttached(key);
				for (var o = 0; o < components.length; ++o) {
					var component = components[o];
					if (typeof component.beforeRender == 'function') {
						component.beforeRender();
					}
					placeholder.insert(component.render());
					if (typeof component.afterRender == 'function') {
						component.afterRender();
					}
				}
			}
		}.bind(this));
		
		this._element = div.firstChild;
		makeLinksDynamic(this._element);
		return this._element;
	},
	rerender: function (key, not_rendered_only) {
		if (!this._element) {
			throw 'Invalid state: Cannot rerender components in an unrendered component';
		}

		var placeholder;
		var element_key = this._element.readAttribute('components');
		if (element_key !== null && element_key == key) {
			placeholder = this._element;
		} else {
			placeholder = this._element.select('*[components="' + key + '"]').first();
		}
		if (placeholder === undefined) {
			console.warn('There is no such component placeholder "' + key + '".');
			return;
		}

		if (!not_rendered_only) {
			placeholder.update();
		}
		
		var components = this.getAttached(key);
		for (var o = 0, oo = components.length; o < oo; ++o) {
			var component = components[o];

			if (not_rendered_only && component.isRendered()) {
				continue;
			}
			if (typeof component.beforeRender == 'function') {
				component.beforeRender();
			}
			if (!not_rendered_only || o === 0) {
				placeholder.insert(component.render());
			} else {
				placeholder.childElements()[o - 1].insert({ after: component.render() });
			}
			if (typeof component.afterRender == 'function') {
				component.afterRender();
			}
		}
	},
	'replace': function (key, components) {
		if (components instanceof Array !== true) {
			components = [components];
		}

		this._components[key] = [];
		for (var i = 0, ii = components.length; i < ii; ++i) {
			var component = components[i];
			if (component instanceof Component !== true) {
				throw 'One of the passed objects is not a component (' + key + ')';
			}
			this._components[key].push(component);
		}
		this.rerender(key);
	}
});

var makeLinksDynamic = function (el) {
	el.select('a[href]').each(function (a) {
		var href = a.readAttribute('href');
		if (href[0] == '#') {
			a.observe('click', function (event) {
				event.preventDefault();
				event.stopPropagation();
				app.call(href);
			});
		}
	});
};


window.Component = Component;

})(window);