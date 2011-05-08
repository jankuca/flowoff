/**
 * FlowOff Framework
 * --
 * @author Jan Kuča <jan@jankuca.com>, http://jankuca.com
 * @company Flow Media, http://flowmedia.cz
 */

/*global Component, Router */
/*global Element*/

(function () {
"use strict";

var app;

var l = window.location;

var upper = function (a) {
	return a.toUpperCase();
};


var BootErrorHandler = {
	'_errors': {
		'NOT_FOUND': {
			'title': 'Page Not Found',
			'content': 'The page you are trying to access does not exist.'
		},
		'MIGRATION_FAILED': {
			'title': 'Database Error',
			'content': 'There was a problem setting up your database. Please, try again later.'
		}
	},

	'handle': function (code) {
		var error = this._errors[code] || {
			'title': 'Unknown Error',
			'content': 'An unkown error has occured. Sorry for inconvenience.'
		};

		if (app._cfg.erase) {
			document.body
				.attr('class', 'bootError')
				.html('' +
					'<div class="box">' +
						'<h1>' + error.title + '</h1>' +
						'<p>' + error.content + '</p>' +
						'<hr />' +
						'<p>Powered by FlowOff Framework</p>' +
					'</div>'
				);
		} else {
			alert(error.title + "\n\n" + error.content);
		}
	}
};

app = {
	'set': function (key, value) {
		this._cfg[key] = value;
	},

	'get': function (key) {
		return this._cfg[key] || null;
	},

	'run': function (callback) {
		var app = this;

		/* 1) Detect pathname in the URL and redirect to the right page with the hash only (where cache manifest is set) */
		if (l.pathname !== this._cfg.root) {
			l.href = l.protocol + '//' + l.host + this._cfg.root + '#!' + l.pathname;
			return;
		}
		if (l.hash === '') {
			l.hash = '#!/';
		}
		
		window.addEventListener('flowoff:callend', function () {
			app.data.viewReady = true;
		});

		var startup = function () {
			if (typeof callback === 'function') {
				callback();
			}

			/* 3) Remove static content */
			if (app._cfg.erase) {
				document.body.html(null);
			}
			
			/* 4) CALL */
			app.call(l.hash);
			
			/* 5) Set up hashchange checking */
			app.data.hash = l.hash;
			if ('onhashchange' in window) {
				window.addEventListener('hashchange', function () {
					if (app.data.hash !== l.hash) {
						app.call(l.hash);
					}
				});
			} else {
				setInterval(function () {
					if (l.hash !== this.data.hash) {
						app.call(l.hash);
						app.data.hash = l.hash;
					}
				}, 50);
			}

			/* 6) Operation queue */
			app._queue = new OperationQueue('_queue');
		};

		var mode = 'online';
		if (this._cfg.db_name && window.openDatabase !== undefined) {
			mode = 'offline';

			var createStateTable = function () {
				app.db.transaction(function (tx) {
					tx.executeSql("CREATE TABLE [_state] ([key], [value])", [],
						function (tx) {
							tx.executeSql("INSERT INTO [_state] ([key], [value]) VALUES (?, ?)", ['last_migration', -1], function (tx, result) {
								app._dbMigrate(-1, startup);
							});
						},
						function (tx, error) {
							throw error;
						}
					);
				});
			};

			this.db = window.openDatabase(this._cfg.db_name, '1.0', this._cfg.db_title, this._cfg.db_size);

			this.db.transaction(function (tx) {
				tx.executeSql("SELECT [value] FROM [_state] WHERE [key] = ?", ['last_migration'], function (tx, result) {
					if (result.rows.length === 0) {
						// this should never happen
						tx.executeSql("INSERT INTO [_state] ([key], [value]) VALUES (?, ?)", ['last_migration', -1], function () {
							app._dbMigrate(-1, startup);
						});
					} else {
						app._dbMigrate(parseInt(result.rows.item(0).value, 10), startup);
					}
				}, function (tx, error) {
					createStateTable();
				});
			});
		}
		this.MODE = mode;
		this.ORIGINAL_MODE = mode;

		if (mode === 'online') {
			startup();
		}

		this.data.booted = true;
	},

	/* Google Analytics */
	'track': function () {
		if (this.cfg.gaTracker) {
			this.cfg.gaTracker.push(['_trackPageview', l.hash.substring(2)]);
		}
	},

	'loadStyle': function (path, callback) {
		var head = document.documentElement.find('head')[0];
		var link = new Element('link', {
			'rel': 'stylesheet',
			'type': 'text/css',
			'href': this._cfg.root + 'css/' + path
		});
		head.insert(link);

		if (typeof callback === 'function') {
			// wait for the stylesheet to load
			(function () {
				try {
					if ((link.sheet && link.sheet.cssRules.length > 0)
					|| (link.styleSheet && link.styleSheet.cssText.length > 0)
					|| (link.innerHTML && link.innerHTML.length > 0)) {
						callback();
					} else {
						throw new Error();
					}
				} catch (exc) {
					setTimeout(arguments.callee, 50);
				}
			}());
		}
	},

	/* CALL */
	'call': function (uri) {
		/* 1) Get the hash */
		var hash = (uri.search('#!') > -1) ? uri.split('#!')[1] : uri,
			qs = hash.split('?')[1],
			route,
			Controller,
			controller;
		
		this.data.hash = '#!' + hash;
		if (l.hash !== '#!' + hash && hash !== '/') {
			l.hash = '#!' + hash;
		}
		hash = hash.split('?')[0];

		try {
			/* 2) Route */
			route = this.router.match(hash, qs);
			if (route === null) {
				throw new Error('404 Page Not Found (No route)');
			}

			Controller = window[route.controller.replace(/^\w/, upper) + 'Controller'];
			if (Controller === undefined) {
				throw new Error('404 Page Not Found (Controller file missing)');
			}
			controller = new Controller(route);

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

				document.fire('flowoff:callstart', route);
				controller[route.view](route.params);
			}
		} catch (exc) {
			if (!this.data.started) {
				this._boot_error_handler.handle(exc.message.substr(0, 3) === '404' ? 'NOT_FOUND' : 'UNKNOWN');
			}
			throw exc;
		}
	},

	'redirect': function (cv, params) {	
		this.call(this.link(cv.replace(/:$/, ':default'), params));
	},

	'link': function (cv, params, options) {
		if (cv === undefined) {
			return this.data.hash;
		}
		if (options === undefined) {
			options = {};
		}

		var abs = (cv.substring(0, 2) === '//'),
			uri;
		if (abs) {
			cv = cv.substring(2);
		}
		cv = cv.replace(/:$/, ':default').split(':');

		if (abs && !app._cfg.domain) {
			throw 'Invalid state: No domain set';
		}

		uri = this.router.resolve({
			'namespace': null,
			'controller': cv[0],
			'view': cv[1],
			'params': params
		});

		return (abs ? 'http://' + app._cfg.domain + (!options.no_port ? ':' + app._cfg.port : '') : '#!') + (uri !== null ? uri : '/error/s404');
	},

	'registerComponent': function (key, Component) {
		this._components[key] = Component;
		return Component;
	},
	'getComponent': function (key) {
		return this._components[key] || null;
	},

	'component': function (key, vars) {
		if (this._components[key] === undefined) {
			throw new Error('Undefined component "' + key + '"');
		}

		var component = new this._components[key]();
		component.name = key;
		if (component instanceof Component !== true) {
			throw new Error('The registered object is not a component (' + key + ')');
		}
		if (vars !== undefined) {
			Object.getOwnPropertyNames(vars).forEach(function (key) {
				Object.defineProperty(this, key, Object.getOwnPropertyDescriptor(vars, key));
			}, component.data);
		}

		return component;
	},

	/* LANG */
	'lang': function (key, params) {
		if (this._lang[key] === undefined) {
			console.warn('Unknown lang key: ' + key);
			return '';
		}
		
		var lang = this._lang[key];
		if (params !== undefined) {
			Object.getOwnPropertyNames(params).forEach(function (key) {
				lang = lang.replace('{$' + key + '}', params[key]);
			});
		}
		return lang;
	},
	'registerLang': function (lang) {
		var _lang = this._lang;
		Object.getOwnPropertyNames(lang).forEach(function (key) {
			_lang[key] = lang[key];
		});
	},

	'getState': function (callback) {
		if (this.MODE !== 'offline') {
			callback(null);
			return;
		}
		if (!app.namespace) {
			throw new Error('Global namespace is not defined.');
		}

		this.db.transaction(function (tx) {
			tx.executeSql("SELECT [key], [value] FROM [_state]", [], function (tx, result) {
				var rows = result.rows,
					state = {},
					r,
					rr = rows.length;

				for (r = 0; r < rr; ++r) {
					var row = rows.item(r),
						val = row.value.toString(),
						key = row.key;
					var ns;
					if (key.search('.') !== -1) {
						ns = key.split('.')[0];
						if (ns !== app.namespace) {
							continue;
						}
						key = row.key.split('.')[1];
					}
					state[key] = val.match(/^[0-9]+$/) ? Number(val) : val;
				}

				callback(state);
			});
		});
	},

	'setState': function (key, value, callback) {
		if (this.MODE !== 'offline') {
			callback();
			return;
		}
		if (!app.namespace) {
			throw new Error('Global namespace is not defined');
		}
		key = app.namespace + '.' + key;

		this.db.transaction(function (tx) {
			tx.executeSql("UPDATE [_state] SET [value] = ? WHERE [key] = ?", [value, key], function (tx, result) {
				if (result.rowsAffected !== 0) {
					callback();
				} else {
					tx.executeSql("INSERT INTO [_state] ([key], [value]) VALUES (?, ?)", [key, value], function (tx, result) {
						callback();
					});
				}
			});
		});
	},

	'queue': function (op, callback) {
		this._queue.push(op, callback);
	},

	'getQueue': function () {
		return this._queue;
	},

	'_dbMigrate': function (last_migration, callback) {
		if (this._migrations === undefined) {
			app._boot_error_handler.handle('MIGRATION_FAILED');
			throw new Error('No migration file provided');
		}

		var app = this,
			m = last_migration + 1,
			migrations = app._migrations,
			mm = migrations.length,
			q = 0,
			qq = 0;
		
		var throw_error = function (tx, error) {
			app._boot_error_handler.handle('MIGRATION_FAILED');
			throw new Error('Migrating the database failed at migration: ' + m + ', query: ' + q + ' of ' + qq + "\n" + error.message);
		};
		var m_iter = function () {		
			if (m < mm) {
				var queries = migrations[m];
				queries.push(["UPDATE [_state] SET [value] = ? WHERE [key] = ?", [m, 'last_migration']]);
				q = 0;
				qq = queries.length;

				app.db.transaction(function (tx) {
					var q_iter = function (tx) {
						var query = queries[q];
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
		};
		m_iter();
	}
};
Object.defineProperties(app, {
	'data': {
		'value': {
			'booted': false,
			'hash': '',
			'viewReady': false,
		},
		'enumerable': true,
	},
	'namespace': {
		'value': null,
		'writable': true,
	},
	'router': {
		'value': new Router(),
	},
	'_cfg': {
		'value': {
			'root': '/',
			'api_root': '',
			'erase': true,
			'domain': window.location.hostname,
			'port': window.location.port
		},
	},
	'_components': {
		'value': {},
	},
	'_lang': {
		'value': {},
	},
	'_boot_error_handler': {
		'value': BootErrorHandler,
	},
});


Object.defineProperty(window, 'app', {
	'value': app,
	'writable': false
});

})();