/**
 * FlowOff Framework
 * --
 * @author Jan Kuča <jan@jankuca.com>, http://jankuca.com
 * @company Flow Media, http://flowmedia.cz
 */
 
(function (window) {

var l = window.location;

var ObservableEvent = Class.create({
	'initialize': function (type) {
		this.type = type;
	}
});
var Observable = Class.create({
	'observe': function (type, listener) {
		if (this.__event_listeners === undefined) {
			this.__event_listeners = {};
		}
		if (this.__event_listeners[type] === undefined) {
			this.__event_listeners[type] = [listener];
		} else {
			this.__event_listeners[type].push(listener);;
		}
	},

	'stopObserving': function (type, listener) {
		if (this.__event_listeners === undefined) {
			return;
		}
		var listeners = this.__event_listeners[type];
		if (listeners === undefined) {
			return;
		}

		if (!listeners) {
			delete this.__event_listeners[type];
		} else {
			for (var i = 0, ii = listeners.length; i < ii; ++i) {
				if (listeners[i] === listener) {
					delete this.__event_listeners[type][i];
				}
			}
		}
	},

	'fire': function (type, memo) {
		if (this.__event_listeners === undefined) {
			return;
		}
		var listeners = this.__event_listeners[type];
		if (listeners === undefined) {
			return;
		}

		var event = new ObservableEvent(type);
		event.target = this;
		event.memo = memo;

		for (var i = 0, ii = listeners.length; i < ii; ++i) {
			var listener = listeners[i];
			if (listener !== undefined) {
				if (listener.call(this, event) === false) {
					return false;
				}
			}
		}
	}
});

var Router = function () {
	this._ns = '';
	this._routes = [];
	this._staticNS = [];

	this.PARAM_HEX = /^[a-f0-9]+$/i;
	this.PARAM_INTEGER = /^\d+$/;
};
Router.prototype.namespace = function (ns) {
	if (ns === null) {
		this._ns = '';
	} else {
		this._ns = '/' + ns;
	}
};
Router.prototype.push = function (pattern, options) {
	this._routes.push([
		this._ns === '' ? null : this._ns.substr(1),
		this._ns + pattern,
		options
	]);
};
Router.prototype.pushStaticNamespace = function (ns) {
	this._staticNS.push(ns);
};
Router.prototype.match = function (uri, qs) {
	var staticNS = this._staticNS;
	for (var s = 0, ss = staticNS.length; s < ss; ++s) {
		var ns = staticNS[s];
		if (uri == '/' + ns || (new RegExp('^/' + ns + '/')).test(uri)) {
			return null;
		}
	}

	var routes = this._routes,
		route,
		pattern,
		options, _options,
		regexps;
	
	if (!!qs) {
		var query = {};
		var parts = qs.split('&');
		for (var e = 0, ee = parts.length; e < ee; ++e) {
			var part = parts[e].split('=');
			query[part[0]] = decodeURIComponent(part[1]);
		}
	}

	__route_loop: for (var r = 0, rr = routes.length; r < rr; ++r) {
		route = routes[r];
		pattern = route[1].replace(/\//g, '\\/');
		_options = route[2];
		options = {};
		for (var o in _options) {
			if (_options.hasOwnProperty(o)) {
				options[o] = _options[o];
			}
		}

		var param_keys = [];
		var p, pp;

		var placeholders = pattern.match(/:_?[a-z][\w\-]*/g);
		if (placeholders !== null) {
			for (p = 0, pp = placeholders.length; p < pp; ++p) {
				var placeholder = placeholders[p].match(/^:(_?[a-z][\w\-]*)$/);
				param_keys.push(placeholder[1]);
				pattern = pattern.replace(':' + placeholder[1], '([^/]+)');
			}
		}

		var match = new RegExp('^' + pattern + '\\/?$').exec(uri);
		if (match === null) {
			continue;
		}

		var rules = options.params,
			params = {};
		if (rules instanceof RegExp) {
			for (p = 0, pp = param_keys.length; p < pp; ++p) {
				if (!rules.test(match[p + 1])) {
					continue __route_loop;
				}

				params[param_keys[p]] = match[p + 1];
			}
		} else if (rules === undefined) {
			for (p = 0, pp = param_keys.length; p < pp; ++p) {
				params[param_keys[p]] = match[p + 1];
			}
		} else {
			for (p in rules) {
				if (rules.hasOwnProperty(p)) {
					var index = param_keys.indexOf(p);
					if (index > -1) {
						if (!rules[p].test(match[index + 1])) {
							continue __route_loop;
						}

						params[p] = match[index + 1];
					}
				}
			}
		}

		if (options.controller[0] == ':') {
			var key = options.controller.substr(1);
			options.controller = params[key];
			if (options.controller === undefined) {
				throw 'Invalid route: Undefined parameter :' + key;
			}
		}

		if (options.view[0] == ':') {
			var key = options.view.substr(1);
			options.view = params[key];
			if (options.view === undefined) {
				throw 'Invalid route: Undefined parameter :' + key;
			}
		}

		// query string
		if (!!qs) {
			var q;
			if (rules instanceof RegExp) {
				for (q in query) {
					if (query.hasOwnProperty(q)) {
						if (!rules.test(query[q])) {
							continue __route_loop;
						}

						params[q] = query[q];
					}
				}
			} else if (rules === undefined) {
				for (q in query) {
					if (query.hasOwnProperty(q)) {
						params[q] = query[q];
					}
				}
			} else {
				for (q in query) {
					if (query.hasOwnProperty(q)) {
						if (!rules.hasOwnProperty(q) || !rules[q].test(query[q])) {
							continue __route_loop;
						}

						params[q] = query[q];
					}
				}
			}
		}

		return {
			'namespace': route[0],
			'controller': options.controller,
			'view': options.view,
			'params': params
		};
	}

	return null;
};

Router.prototype.resolve = function (target, abs) {
	if (abs && !app._cfg.domain) {
		throw 'Invalid state: No domain set';
	}

	var routes = this._routes,
		route,
		uri,
		options,
		regexps,
		params = target.params || {},
		param_keys;
	
	var create_qs = function (params, param_keys) {
		var query = [];
		for (var p in params) {
			if (params.hasOwnProperty(p) && ['_c', '_v'].indexOf(p) == -1 && param_keys.indexOf(p) == -1) {
				query.push(p + '=' + encodeURIComponent(params[p]));
			}
		}
		return (query.length > 0) ? '?' + query.join('&') : '';
	};

	__route_loop: for (var r = 0, rr = routes.length; r < rr; ++r) {
		route = routes[r];
		uri = route[1];
		options = route[2];

		// if the namespace does not match, move to the next route
		if (route[0] != target.namespace) {
			continue;
		}

		var p, pp;
		param_keys = [];
		params['_c'] = target.controller;
		params['_v'] = target.view;

		// check whether there are values for all placeholders in the route pattern
		var placeholders = uri.match(/:_?[a-z][\w\-]*/g);
		if (placeholders !== null) {
			for (p = 0, pp = placeholders.length; p < pp; ++p) {
				var placeholder = placeholders[p].match(/^:(_?[a-z][\w\-]*)$/);
				param_keys.push(placeholder[1]);
				if (params[placeholder[1]] === undefined) {
					continue __route_loop;
				}
			}
		}

		var r_controller = options.controller;
		if (r_controller[0] == ':') {
			var key = r_controller.substr(1);
			if (params[key] === undefined) {
				continue;
			}
			r_controller = params[key];
		}
		if (r_controller != target.controller) {
			continue;
		}

		var r_view = options.view;
		if (r_view[0] == ':') {
			var key = r_view.substr(1);
			if (params[key] === undefined) {
				continue;
			}
			r_view = params[key];
		}
		if (r_view != target.view) {
			continue;
		}

		var rules = options.params,
			key;
		if (rules === undefined) {
			for (p = 0, pp = param_keys.length; p < pp; ++p) {
				key = param_keys[p];
				uri = uri.replace(':' + key, params[key]);
			}
		} else if (rules instanceof RegExp) {
			for (p = 0, pp = param_keys.length; p < pp; ++p) {
				key = param_keys[p];
				if (!rules.test(params[key])) {
					continue __route_loop;
				}
				uri = uri.replace(':' + key, params[key]);
			}
		} else {
			for (p = 0, pp = param_keys.length; p < pp; ++p) {
				key = param_keys[p];
				if (rules[key] !== undefined && !rules[key].test(params[key])) {
					continue __route_loop;
				}
				uri = uri.replace(':' + key, params[key]);
			}
		}
		return (abs ? 'http://' + app._cfg.domain : '') + uri + create_qs(params, param_keys);
	}

	return null;
};

var FlowOff = {
	'_cfg': {
		'root': '/',
		'domain': window.location.host
	},
	'data': {
		'booted': false,
		'hash': '',
		'viewReady': false
	},
	'_router': new Router(),

	'_controllers': {},
	'_components': {},
	'_lang': {}
};
FlowOff.set = function (key, value) {
	this._cfg[key] = value;
};
FlowOff.getRouter = function () {
	return this._router;
};

FlowOff.run = function () {
	/* 1) Detect pathname in the URL and redirect to the right page with the hash only (where cache manifest is set) */
	if (l.pathname != this._cfg.root) {
		l.href = l.protocol + '//' + l.host + l.port + this._cfg.root + '#' + l.pathname;
		return;
	}
	if (l.hash == '') {
		l.hash = '#/';
	}
	
	this.set('ROOT', this._cfg.dir);
	
	Event.observe(window, 'flowoff:callend', function () {
		this.data.viewReady = true;
	}.bind(this));

	var startup = function () {
		/* 3) Remove static content */
		if (this._cfg.erase) {
			document.body.update();
		}
		
		/* 4) CALL */
		this.call(l.hash);
		
		/* 5) Set up hashchange checking */
		this.data.hash = l.hash;
		if ('onhashchange' in window) {
			Event.observe(window, 'hashchange', function () {
				if (this.data.hash != l.hash) {
					this.call(l.hash);
				}
			}.bind(this));
		} else {
			setInterval(function () {
				if (l.hash != this.data.hash) {
					this.call(l.hash);
					this.data.hash = l.hash;
				}
			}.bind(this), 50);
		}
	}.bind(this);

	var mode = 'online';
	if (this._cfg.db_name && window.openDatabase !== undefined) {
		mode = 'offline';

		var createStateTable = function () {
			this.db.transaction(function (tx) {
				tx.executeSql("CREATE TABLE [_state] ([key], [value])", [],
					function (tx) {
						tx.executeSql("INSERT INTO [_state] ([key], [value]) VALUES (?, ?)", ['last_migration', -1], function (tx, result) {
							this._dbMigrate(-1, startup);
						}.bind(this));
					}.bind(this),
					function (tx, error) {
						throw error;
					}
				);
			}.bind(this));
		}.bind(this);

		this.db = window.openDatabase(this._cfg.db_name, '1.0', this._cfg.db_title, this._cfg.db_size);

		this.db.transaction(function (tx) {
			tx.executeSql("SELECT [value] FROM [_state] WHERE [key] = ?", ['last_migration'], function (tx, result) {
				if (result.rows.length === 0) {
					// this should never happen
					tx.executeSql("INSERT INTO [_state] ([key], [value]) VALUES (?, ?)", ['last_migration', -1], function () {
						app._dbMigrate(-1, startup);
					});
				} else {
					app._dbMigrate(parseInt(result.rows.item(0).value), startup);
				}
			}, function (tx, error) {
				createStateTable();
			});
		});
	}
	this.MODE = mode;

	if (mode == 'online') {
		startup();
	}

	this.data.booted = true;
};

/* Google Analytics */
FlowOff.track = function () {
	if (this.cfg.gaTracker) {
		this.cfg.gaTracker.push(['_trackPageview', l.hash.substring(1)]);
	}
};

FlowOff.loadStyle = function (path) {
	var head = $$('head')[0];
	var link = new Element('link', {
		'rel': 'stylesheet',
		'type': 'text/css',
		'href': this._cfg.root + 'css/' + path
	});
	head.insert(link);
};

/* CALL */
FlowOff.call = function (uri) {
	/* 1) Get the hash */
	var hash = (uri.search('#') > -1) ? uri.split('#')[1] : uri;
	this.data.hash = '#' + hash;

	if (l.hash != '#' + hash && hash != '/') {
		l.hash = hash;
	}

	var qs = hash.split('?')[1];
	hash = hash.split('?')[0];

	/* 2) Route */
	var route = this._router.match(hash, qs);
	if (route === null) {
		throw '404 Page Not Found (No route)';
	}

	var Controller = this._controllers[route.controller];
	if (Controller === undefined) {
		throw '404 Page Not Found (Controller file missing)';
	}
	var controller = new Controller;

	this.data.params = route.params;
	route.params._c = route.controller;
	route.params._v = route.view;

	/* STARTUP */
	if (!this.data.started) {
		var startup_mode;
		if (controller.startup !== undefined) {
			startup_mode = controller.startup(route.params);
		}
		if (startup_mode !== false) {
			this.data.started = true;
		}
	}

	if (this.data.started) {
		if (controller[route.view] === undefined) {
			throw '404 Page Not Found (Missing view)';
		}

		Event.fire(document, 'flowoff:callstart', route);
		controller[route.view](route.params);
	}
};

FlowOff.redirect = function (cv, params) {	
	this.call(this.link(cv.replace(/:$/, ':default'), params));
};

FlowOff.link = function (cv, params) {
	if (cv === undefined) {
		return this.data.hash;
	}

	var abs = (cv.substring(0, 2) == '//');
	if (abs) {
		cv = cv.substring(2);
	}
	cv = cv.replace(/:$/, ':default').split(':');

	var uri = this._router.resolve({
		'namespace': null,
		'controller': cv[0],
		'view': cv[1],
		'params': params
	}, abs);

	return '#' + (uri !== null ? uri : '/error/s404');
};

FlowOff.registerController = function (key, Controller) {
	this._controllers[key] = Controller;
	return Controller;
};

FlowOff.registerModel = function () {
	return ModelFactory.create.apply(ModelFactory, arguments);
};

FlowOff.registerComponent = function (key, Component) {
	this._components[key] = Component;
	return Component;
};

FlowOff.component = function (key, vars) {
	if (this._components[key] === undefined) {
		throw 'Undefined component "' + key + '"';
	}

	var component = new this._components[key]();	
	if (component instanceof Component !== true) {
		throw 'The registered object is not a component (' + key + ')';
	}
	Object.extend(component.data, vars || {});

	return component;
};

/* LANG */
FlowOff.lang = function (key, params) {
	if (typeof this._lang[key] == 'undefined') {
		console.warn('Unknown lang key: ' + key);
		return '';
	}
	
	var lang = this._lang[key];
	if (typeof params != 'undefined') {
		for (var i = 0, ii = params.length; i < ii; ++i) {
			lang = lang.replace('{$'+i+'}',params[i]);
		}
	}
	return lang;
};
FlowOff.registerLang = function (lang) {
	Object.extend(this._lang, lang);
};

FlowOff._dbMigrate = function (last_migration, callback) {
	if (this._migrations === undefined) {
		throw 'No migration file provided';
	}

	var m = last_migration + 1,
		mm = app._migrations.length,
		migrations = app._migrations,
		q, qq, queries, query;
	
	var throw_error = function (tx, error) {
		throw Error('Migrating the database failed at migration: ' + m + ', query: ' + q + ' of ' + qq + "\n" + error.message);
	};
	var m_iter = function () {		
		if (m < mm) {
			queries = migrations[m];
			queries.push(["UPDATE [_state] SET [value] = ? WHERE [key] = ?", [m, 'last_migration']]);
			q = 0, qq = queries.length;

			this.db.transaction(function (tx) {
				var q_iter = function (tx) {
					query = queries[q];
					tx.executeSql(
						query instanceof Array ? query[0] : query,
						query instanceof Array ? query[1] : null,
						q < qq - 1 ? q_iter : m_iter,
						throw_error
					);
					++q;
				};
				q_iter(tx);
			});
		} else {
			callback();
		}
		++m;
	}.bind(this);
	m_iter();
};


window.app = FlowOff;
window.Observable = Observable;

})(window);