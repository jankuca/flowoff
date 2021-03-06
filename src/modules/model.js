/*global app*/
/*global mongo2sql_parametric*/

(function () {
"use strict";


var upper,
	SQLStatement,
	Model;

upper = function (a) {
	return a.toUpperCase();
};

SQLStatement = Function.inherit(function (operation, collection) {
	var _sort = {},
		_data = {};

	Object.defineProperties(this, {
		'operation': {
			get: function () {
				return operation;
			}
		},
		'collection': {
			get: function () {
				return collection;
			}
		},
		'sort': {
			get: function () {
				return _sort;
			},
			set: function (value) {
				if (typeof value === 'object') {
					_sort = value;
				} else if (typeof value === 'string') {
					_sort = {};
					_sort[value] = 1;
				}
			}
		},
		'data': {
			get: function () {
				return _data;
			},
			set: function (value) {
				if (typeof value === 'object') {
					_data = value;
				}
			}
		}
	});
});
Object.defineProperty(SQLStatement.prototype, 'sql', {
	get: function () {
		var selector = this.selector,
			data = this.data,
			out = "",
			fields = [],
			params = [],
			i,
			ii,
			res,
			sort;

		switch (this.operation) {
		case 'read':
			out += "SELECT ";
			if (this.fields === undefined || this.fields.length === 0) {
				this.fields = ['*'];
			}
			out += this.fields.join(", ") + " ";

			out += "FROM [" + this.collection + "] ";

			if (selector && JSON.stringify(selector) !== '{}') {
				res = mongo2sql_parametric(selector);
				params = params.concat(res[1]);
				out += "WHERE " + res[0] + " ";
			}

			sort = this.sort;
			if (JSON.stringify(sort) !== '{}') {
				out += "ORDER BY ";
				Object.getOwnPropertyNames(sort).forEach(function (field) {
					out += "lower([" + field.replace(':', '__') + "]) " + (sort[field] > 0 ? "ASC " : "DESC ");
				});
			}

			if (this.limit) {
				out += "LIMIT " + this.limit + " ";
			}
			break;

		case 'create':
			out += "INSERT INTO [" + this.collection + "] ";

			if (data === undefined) {
				throw new Error('No data');
			}
			for (i in data) {
				if (data.hasOwnProperty(i)) {
					fields.push("[" + i.replace(':', '__') + "]");
					params.push(data[i]);
				}
			}
			if (fields.length === 0) {
				throw new Error('No data');
			}
			out += "(" + fields.join(", ") + ") VALUES (";

			params.forEach(function (param) {
				out += "?, ";
			});
			out = out.substr(0, out.length - 2);
			out += ")";
			break;

		case 'update':
			out += "UPDATE [" + this.collection + "] SET ";

			if (data === undefined) {
				throw new Error('No data');
			}
			for (i in data) {
				if (data.hasOwnProperty(i)) {
					params.push(data[i]);

					out += "[" + i.replace(':', '__') + "] = ?";
					out += ", ";
				}
			}
			out = out.substring(0, out.length - 2) + " ";

			if (selector && JSON.stringify(selector) !== '{}') {
				res = mongo2sql_parametric(selector);
				params = params.concat(res[1]);
				out += "WHERE " + res[0] + " ";
			}
			break;

		case 'delete':
			out += "DELETE FROM [" + this.collection + "] ";

			if (selector && JSON.stringify(selector) !== '{}') {
				res = mongo2sql_parametric(selector);
				params = params.concat(res[1]);
				out += "WHERE " + res[0] + " ";
			}
			break;
		}

		return [out, params];
	}
});


/**
 * @param String method
 * @param String uri
 * @param mixed doc
 */
window.ApiOperation = Operation.inherit({
	'toString': function () {
		return '[object ApiOperation]';
	},
	'startup': function (method, uri, data) {
		var op = this;
		Model.api(method, uri, {}, data, function (status, response) {
			var dumbass = (status === 403 && response && response.dumbass);
			if (dumbass) {
				window.document.fire('flowoff:dumbass'); // cool event huh?
			}

			if ((status && status < 300) || app.MODE !== 'offline') {
				op.output = [status, response];
				op.shutdown();
			} else if (status !== 404 && status !== 403) { // unknown error
				op.retry(5000);
			} else { // items does not exist on the server or the user does not have required permissions anymore; trash the operation
				op.shutdown();
			}
		});
	}
});


Model = Function.inherit(function (doc) {
	var d = doc || {};
	doc = {};
	var skip_props = ['url'];
	Object.getOwnPropertyNames(d).forEach(function (key) {
		if (skip_props.indexOf(key) !== -1) {
			return;
		}
		Object.defineProperty(doc, key, Object.getOwnPropertyDescriptor(d, key));
	});

	var _stored = !!doc._id,
		_changed = false,
		fieldGetter,
		fieldSetter,
		fields = this.constructor.fields || [];

	Object.defineProperties(this, {
		'stored': {
			get: function () {
				return _stored;
			},
			set: function (value) {
				_stored = !!value;
			}
		},
		'changed': {
			get: function () {
				return _changed;
			},
			set: function (value) {
				_changed = !!value;
			}
		},
		'doc': {
			value: doc,
			writable: false
		},
		'id': {
			get: function () {
				return doc._id || null;
			},
			set: function (value) {
				if (doc._id !== value) {
					if (doc._id && console && console.warn) {
						console.warn('Rewriting an UUID');
					}

					doc._id = value;
					_changed = true;
					if (app.MODE === 'offline') {
						_stored = false;
					}
				}
			}
		},
		'parent': {
			get: function () {
				if (typeof this.getParent !== 'function') {
					throw new Error('No parent association');
				}
				var api_field = window[this.constructor.parent_constructor].api_field || 'id';
				return doc._parent[api_field] || doc._parent || null;
			},
			set: function (value) {
				if (typeof this.getParent !== 'function') {
					throw new Error('No parent association');
				}
				var orig = doc._parent;
				doc._parent = (value instanceof Model) ? value[app.MODE === 'offline' ? 'id' : value.constructor.api_field] : value;
				if (app.MODE !== 'offline') {
					this._cache.parent = (value instanceof Model) ? value : undefined;
				}
				_changed = _changed || orig !== doc._parent;
			}
		}
	});

	if (app.MODE !== 'offline') {
		this._cache = {};
	}

	fieldGetter = function (key) {
		if (fields.indexOf(key) === -1) {
			throw new Error('Unknown field: ' + key);
		}
		return this.doc[key];
	};
	fieldSetter = function (key, value) {
		if (fields.indexOf(key) === -1) {
			throw new Error('Unknown field: ' + key);
		}
		this.doc[key] = value;
		_changed = true;
	};
	fields.forEach(function (key) {
		if (key.search(':') === -1) {
			throw new Error('Invalid field name: a namespace required');
		}
		Object.defineProperty(this, key, {
			get: fieldGetter.bind(this, key),
			set: fieldSetter.bind(this, key),
			enumerable: true
		});
	}, this);

	// parent
	if (typeof doc._parent === 'object' && doc._parent !== null) {
		if (app.MODE !== 'offline') {
			this._cache.parent = new window[this.constructor.parent_constructor](doc._parent);
		}
	}

	// children
	Object.getOwnPropertyNames(doc).forEach(function (key) {
		if (key.indexOf(':') !== -1 || key[0] === '_') {
			return;
		}
		var name = key.replace(/^\w/, upper);
		if (typeof this['get' + name] === 'function') {
			name = name.replace(/ies$/, 'y').replace(/s$/, '');
			var cache,
				model = window[name];
			if (key[key.length - 1] === 's') {
				cache = [];
				doc[key].forEach(function (doc) {
					var m = new model(doc);
					if (app.MODE !== 'offline' && !doc._parent) {
						m._cache._parent = this;
						m.doc._parent = this.id;
					}
					cache.push(m);
				}, this);
			} else {
				cache = new model(doc[key]);
				if (app.MODE !== 'offline' && !doc[key]._parent) {
					cache._cache.parent = this;
					m.doc._parent = this.id;
				}
			}
			if (app.MODE !== 'offline') {
				this._cache[key] = cache;
			}
			delete doc[key];
		}
	}, this);
}, {
	'toString': function () {
		return '[object Model]';
	},
	'save': function (options, callback) {
		if (arguments.length === 1) {
			callback = arguments[0];
			options = {};
		} else if (arguments.length === 0) {
			options = {};
		}

		if (!this.changed) {
			if (typeof callback === 'function') {
				callback(null);
			}
			return;
		}
		if (typeof this.beforeSave === 'function') {
			this.beforeSave();
		}

		var api_uri;
		if (options.fallback) {
			api_uri = options.fallback;
		} else if (this.stored || !this.constructor._has_api_parent) {
			api_uri = this.constructor.getApiUri(this.stored ? this[this.constructor.api_field] : undefined);
		} else {
			api_uri = window[this.constructor.parent_constructor].getApiUri(this.parent, this.key);
		}
		var op = new ApiOperation(
			this.stored ? 'PUT' : 'POST',
			api_uri,
			this.doc
		);

		var model = this;

		if (app.MODE === 'online') {
			app.queue(op, function (status, response) {
				if (status < 300) {
					model.stored = true;
					if (typeof callback === 'function') {
						callback(response);
					}
				} else {
					if (typeof callback === 'function') {
						callback(new Error('Failed to save the resource'));
					}
				}
			});
			return;
		}

		var st = new SQLStatement(this.stored ? 'update' : 'create', this.collection),
			selector = { _id: this.id },
			data = {};
		if (this.constructor.namespace !== null) {
			if (!app.namespace) {
				throw new Error('Global namespace is not defined');
			}
			selector._ns = app.namespace;
			this.doc._ns = app.namespace;
		}
		st.selector = selector;
		st.data = this.doc;

		var sql = st.sql;
		var after_upsert = (options.upsert === true);
		var execute = function (tx) {
			tx.executeSql(sql[0], sql[1], function (tx, result) {
				if (result.rowsAffected > 0) {
					model.stored = true;
					model.changed = false;

					if (typeof callback === 'function') {
						callback(null);
					}
					if (model.constructor.online !== false && options.online !== false) {
						app.queue(op);
					}
				} else if (!after_upsert) { // upsert
					after_upsert = true;

					var st = new SQLStatement('create', model.collection);
					st.selector = selector;
					st.data = model.doc;
					sql = st.sql;

					if (options.tx) {
						execute(options.tx);
					} else {
						app.db.transaction(execute);
					}
				} else {
					if (model.constructor.online !== false && options.online !== false) {
						app.queue(op);
					}
				}
			}, function (tx, err) {
				if (console) {
					console.error('SQL Error: ' + err.message + '; ' + JSON.stringify(err));
					console.log('The SQL query was:', sql[0], sql[1]);
				}
				if (typeof callback === 'function') {
					callback(err);
				}
			});
		};

		if (options.tx) {
			execute(options.tx);
		} else {
			app.db.transaction(execute);
		}
	},

	'remove': function (options, callback) {
		if (arguments.length === 1) {
			callback = arguments[0];
			options = {};
		} else if (arguments.length === 0) {
			options = {};
		}

		if (!this.stored) {
			return callback(null);
		}
		if (typeof this.beforeDelete === 'function') {
			this.beforeDelete();
		}

		var api_uri;
		if (options.fallback) {
			api_uri = options.fallback;
		} else if (this.stored || !this.constructor._has_api_parent) {
			api_uri = this.constructor.getApiUri(this.stored ? this[this.constructor.api_field] : undefined);
		} else {
			api_uri = window[this.constructor.parent_constructor].getApiUri(this.parent, this.key);
		}
		var op = new ApiOperation('DELETE', api_uri);
		if (app.MODE === 'online') {
			app.queue(op, function (status, response) {
				if (typeof callback === 'function') {
					callback(status < 300 ? response : new Error('Failed to delete the resource'));
				}
			});
			return;
		}

		var st = new SQLStatement('delete', this.collection),
			model = this,
			selector = { _id: this.id };
		if (this.constructor.namespace !== null) {
			if (!app.namespace) {
				throw new Error('Global namespace is not defined');
			}
			selector._ns = app.namespace;
		}
		st.selector = selector;

		var sql = st.sql;
		var execute = function (tx) {
			tx.executeSql(sql[0], sql[1], function (tx, result) {
				model.stored = false;
				model.changed = true;

				if (typeof callback === 'function') {
					callback(null);
				}
				if (model.constructor.online !== false && options.online !== false) {
					app.queue(op);
				}
			}, function (tx, err) {
				if (console) {
					console.error('SQL Error: ' + err.message + '; ' + JSON.stringify(err));
					console.log('The SQL query was:', sql[0], sql[1]);
				}
				if (typeof callback === 'function') {
					callback(err);
				}
			});
		};

		if (options.tx) {
			execute(options.tx);
		} else {
			app.db.transaction(execute);
		}
	},

	'generateId': function () {
		this.id = uuid().replace(/\-/g, '');
	},

	'update': function (fields) {
		Object.keys(fields).forEach(function (key) {
			this[key] = fields[key];
		}, this);
		return this;
	},

	'updateTimestamp': function (key) {
		var desc = Object.getOwnPropertyDescriptor(this, key);
		if (desc === undefined) {
			throw new Error('Unknown field (' + key + ')');
		}
		this[key] = Math.round(new Date().getTime() / 1000);
	}
});

Object.defineProperties(Model.prototype, {
	'collection': {
		get: function () {
			return this.constructor.collection;
		},
		set: function () {
		}
	},
	'key': {
		get: function () {
			return this.constructor.collection.replace(/ies$/, 'y').replace(/s$/, '');
		},
		set: function () {
		}
	}
});

Model.one = function (selector, options, callback) {
	if (arguments.length === 1) {
		callback = arguments[0];
		options = {};
		selector = {};
	} else if (arguments.length === 2) {
		callback = arguments[1];
		options = {};
	}
	selector = selector || {};
	options = options || {};

	options.limit = 1;
	this.all(selector, options, callback);
};
Model.all = function (selector, options, callback) {
	if (arguments.length === 1) {
		callback = arguments[0];
		options = {};
		selector = {};
	} else if (arguments.length === 2) {
		callback = arguments[1];
		options = {};
	}
	selector = selector || {};
	options = options || {};
	if (typeof callback !== 'function') {
		throw new Error('Missing callback');
	}

	var M = this;

	if (typeof selector !== 'object') {
		selector = { _id: selector };
	}

	var fallback = function () {
		var uri = options.fallback;
		if (!uri) {
			var api_field = M.api_field.replace(/^id$/, '_id');
			uri = (options.limit === 1) ? M.getApiUri(selector[api_field]) : M.getApiUri();
			var query = [];
			Object.keys(selector).forEach(function (key) {
				if (key === '_ns') {
					return;
				}
				var k = key.replace(/^_id$/, 'id')
				if (key !== api_field) {
					query.push(k + '=' + encodeURIComponent(selector[key]));
				}
			});
			if (query.length) {
				uri += '?' + query.join('&');
			}
		}
		M.api('GET', uri, function (status, response) {
			if (status !== 200) {
				return callback(options.limit !== 1 ? [] : new M(), status);
			}
			if (options.limit === 1) {
				var m = new M(response instanceof Array ? response[0] : response);
				m.remote = true;
				callback(m);
			} else {
				var models = [];
				if (response instanceof Array === false) {
					response = [response];
				}
				response.forEach(function (item) {
					var m = new M(item);
					m.remote = true;
					models.push(m);
				});
				callback(models, status);
			}
		});
	};
	if (options.online === true || app.MODE === 'online') {
		fallback();
		return;
	}

	var st = new SQLStatement('read', this.collection);

	if (this.namespace !== null) {
		if (!app.namespace) {
			throw new Error('Global namespace is not defined');
		}
		selector._ns = app.namespace;
	}

	st.selector = selector;
	if (options.limit) {
		st.limit = options.limit;
	}
	if (options.fields) {
		st.fields = options.fields;
	}
	if (options.sort) {
		st.sort = options.sort;
	} else if (this.sort) {
		st.sort = this.sort;
	}

	var sql = st.sql;
	var execute = function (tx) {
		tx.executeSql(sql[0], sql[1], function (tx, result) {
			var rows = result.rows,
				r,
				rr = rows.length,
				models = [],
				doc,
				row;
			if (rr !== 0 || options.online === false) {
				for (r = 0; r < rr; ++r) {
					doc = {};
					row = rows.item(r);
					Object.getOwnPropertyNames(row).forEach(function (key) {
						doc[key.replace('__', ':')] = row[key];
					});
					models.push(new M(doc));
				}
				callback(options.limit !== 1 ? models : models[0] || new M(), 0);
			} else if (M.online !== false) {
				// fallback to online
				fallback();
			} else {
				callback(options.limit !== 1 ? [] : new M(), 0);
			}
		}, function (tx, err) {
			if (console) {
				console.error('SQL Error: ' + err.message + '; ' + JSON.stringify(err));
				console.log('The SQL query was:', sql[0], sql[1]);
			}
			callback(err);
		});
	};

	if (options.tx) {
		execute(options.tx);
	} else {
		app.db.transaction(execute);
	}
};
Model.has_one = function (has_one) {
	if (has_one instanceof Array !== true) {
		has_one = Array.prototype.slice.call(arguments);
	}

	var createGetter = function (name, proto, sel) {
		var key = name;
		name = name.replace(/^\w/, upper);
		sel = sel || {};
		proto['get' + name] = function (selector, options, callback) {
			if (arguments.length === 2) {
				callback = arguments[1];
				options = arguments[0];
				selector = {};
			}
			if (arguments.length === 1) {
				callback = arguments[0];
				options = {};
				selector = {};
			}

			var model = window[name];
			if (model === undefined) {
				throw new Error('Invalid association: ' + name + ' is not defined');
			}
			Object.getOwnPropertyNames(sel).forEach(function (key) {
				selector[key] = sel[key];
			});

			if (!options.fallback) {
				options.fallback = this.constructor.getApiUri(this[this.constructor.api_field], key);
			}

			if (app.MODE === 'offline') {
				selector._parent = this.id;
				options.online = options.online || (this.remote ? true : null);
				return model.one(selector, options, callback);
			} else {
				if (this._cache[key]) {
					callback(this._cache[key]);
					return;
				}
				model.api('GET', options.fallback, function (status, response) {
					if (status !== 200) {
						callback(new model());
						return;
					}
					var m = new model(response);
					m.remote = true;
					this._cache[key] = m;
					callback(m);
				}.bind(this));
			}
		};
	},
		skip = false;
	has_one.forEach(function (key, i) {
		if (skip) {
			skip = false;
			return;
		}

		skip = (typeof has_one[i + 1] === 'string');
		createGetter(key, this.prototype, skip ? has_one[i + 1] : null);
	}, this);
};
Model.has_many = function (has_many) {
	if (has_many instanceof Array !== true) {
		has_many = Array.prototype.slice.call(arguments);
	}

	var createGetter = function (name, proto, sel) {
		var key = name;
		name = name.replace(/^\w/, upper);
		sel = sel || {};
		proto['get' + name] = function (selector, options, callback) {
			if (arguments.length === 2) {
				callback = arguments[1];
				options = arguments[0];
				selector = {};
			}
			if (arguments.length === 1) {
				callback = arguments[0];
				options = {};
				selector = {};
			}
			name = name.replace(/ies$/, 'y').replace(/s$/, '');

			var model = window[name];
			if (model === undefined) {
				throw new Error('Invalid association: ' + name + ' is not defined');
			}
			Object.getOwnPropertyNames(sel).forEach(function (key) {
				selector[key] = sel[key];
			});

			if (!options.fallback) {
				options.fallback = this.constructor.getApiUri(this[this.constructor.api_field], name);
			}

			if (app.MODE === 'offline') {
				selector._parent = this.id;
				options.online = options.online || (this.remote ? true : null);
				return model.all(selector, options, callback);
			} else {
				if (this._cache[key]) {
					callback(this._cache[key]);
					return;
				}
				model.api('GET', options.fallback, function (status, response) {
					if (status !== 200) {
						alert('Failed to fetch ' + name);
						return;
					}
					var models = [];
					response.forEach(function (item) {
						var m = new model(item);
						m.remote = true;
						models.push(m);
					});
					this._cache[key] = models;
					callback(models);
				}.bind(this));
			}
		};
	},
		skip = false;
	has_many.forEach(function (key, i) {
		if (skip) {
			skip = false;
			return;
		}

		skip = (typeof has_many[i + 1] !== 'string');
		createGetter(key, this.prototype, skip ? has_many[i + 1] : null);
	}, this);
};
Model.belongs_to = function (belongs_to, is_api_parent) {
	if (belongs_to instanceof Array === true || (arguments.length > 1 && typeof is_api_parent !== 'boolean')) {
		throw new Error('belongs_to: Multiple parents are not implemented');
	}

	var name = belongs_to.replace(/^\w/, upper);
	this.parent_constructor = name;
	this._has_api_parent = !!is_api_parent;
	this.prototype.getParent = function (selector, options, callback) {
		if (arguments.length === 2) {
			callback = arguments[1];
			options = arguments[0];
			selector = {};
		}
		if (arguments.length === 1) {
			callback = arguments[0];
			options = {};
			selector = {};
		}

		var model = window[name];
		if (model === undefined) {
			throw new Error('Invalid association: ' + name + ' is not defined');
		}

		if (!options.fallback) {
			options.fallback = model.getApiUri(this.parent);
		}

		if (app.MODE === 'offline') {
			var api_field = window[this.constructor.parent_constructor].api_field;
			selector[!this.remote ? '_id' : api_field] = this.parent;
			options.online = options.online || !!this.remote;
			return model.one(selector, options, callback);
		} else {
			if (this._cache.parent) {
				callback(this._cache.parent);
				return;
			}
			model.api('GET', options.fallback, function (status, response) {
				if (status !== 200) {
					callback(new model());
					return;
				}
				var m = new model(response);
				m.remote = true;
				this._cache.parent = m;
				callback(m);
			}.bind(this));
		}
	};
};

Model.search = function (field, q, options, callback) {
	if (arguments.length === 3 && typeof arguments[2] === 'function') {
		callback = arguments[2];
		options = {};
	}

	field = 'lower([' + field.replace(':', '__') + '])';
	var sql = this._getSearchSQL(field, q);
	var M = this;
	var execute = function (tx) {
		tx.executeSql(sql[0], sql[1], function (tx, result) {
			var rows = result.rows, row;
			var r, rr = rows.length;
			var models = [];
			var doc;
			if (rr !== 0) {
				for (r = 0; r < rr; ++r) {
					doc = {};
					row = rows.item(r);
					Object.getOwnPropertyNames(row).forEach(function (key) {
						doc[key.replace('__', ':')] = row[key];
					});
					models.push(new M(doc));
				}
				callback(options.limit !== 1 ? models : models[0] || new M());
			} else {
				callback(options.limit !== 1 ? [] : new M());
			}
		}, function (tx, err) {
			if (console) {
				console.error('SQL Error: ' + err.message + '; ' + JSON.stringify(err));
				console.log('The SQL query was:', sql[0], sql[1]);
			}
			callback(err);
		});
	};

	if (options.tx) {
		execute(options.tx);
	} else {
		app.db.transaction(execute);
	}
};

Model._getSearchSQL = function (field, q) {
	var sql =
		"SELECT * " +
		"FROM [" + this.collection + "] " +
		"WHERE [_ns] = ? ";
	var params = [
		app.namespace
	];
	q.forEach(function (word) {
		sql += "AND ( " +
			field + " LIKE ? OR " +
			field + " LIKE ? " +
		") ";
		params.push(word + "%");
		params.push("% " + word + "%");
	});

	return [sql, params];
};

/*arguments method, uri, [params, [data]], callback*/
Model.api = function (method, uri, params, data, callback) {
	if (arguments.length === 3) {
		callback = arguments[2];
		data = {};
		params = {};
	} else if (arguments.length === 4) {
		callback = arguments[3];
		data = {};
		params = arguments[2];
	}
	data = data || {}

	var data_str = '',
		xhr = new XMLHttpRequest(),
		headers = this.headers || {};

	uri = uri.replace(new RegExp('./+', 'g'), function (a) {
		return (a[0] === ':' && a.length > 2) ? '://' : a[0] + '/';
	});
	Object.keys(params).forEach(function (key, i) {
		uri += (i === 0) ? '?' : '&';
		uri += key + '=' + encodeURIComponent(params[key]);
	});

	Object.keys(data).forEach(function (key, i) {
		data_str += (i !== 0) ? '&' : '';
		data_str += key + '=' + encodeURIComponent(data[key]);
	});

	xhr.open(method, uri, true);
	Object.keys(headers).forEach(function (key) {
		xhr.setRequestHeader(key, headers[key]);
	});
	if ((method === 'POST' || method === 'PUT') && headers['content-type'] === undefined) {
		xhr.setRequestHeader('content-type', 'application/x-www-form-urlencoded');
	}
	xhr.onreadystatechange = function () {
		if (this.readyState === 4) {
			if (this.status === 401) {
				window.document.sessionexpired = true;
				window.document.fire('flowoff:sessionexpire');
			}

			var json;
			try {
				json = JSON.parse(this.responseText);
			} catch (exc) {
				callback(Model.getStdStatus(this.status), this.responseText ? { 'data': this.responseText } : null, this);
			}
			if (json) {
				callback(Model.getStdStatus(this.status), json, this);
			}
		}
	};
	xhr.send(data_str || null);

	return xhr;
};

Model.getStdStatus = function (status) {
	status = Number(status);
	switch (status) {
	case 1223: return 204;
	default: return status;
	}
};

Model.getApiUri = function (id, assoc) {
	var uri = app.get('api_root') + '/' + this.collection.toLowerCase();
	if (id !== undefined) {
		uri += '/' + id;
		if (assoc) {
			uri += '/' + assoc.replace(/y$/, 'ies').replace(/\w$/, function (a) {
				return a + 's';
			}).toLowerCase();
		}
	}
	return uri;
};


Model.headers = {
	'x-requested-with': 'XMLHttpRequest'
};
Model.api_field = 'id';
Model.parent_constructor = 'Model';


window.Model = Model;

}());
