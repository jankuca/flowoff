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
			},
		},
		'collection': {
			get: function () {
				return collection;
			},
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
			},
		},
		'data': {
			get: function () {
				return _data;
			},
			set: function (value) {
				if (typeof value === 'object') {
					_data = value;
				}
			},
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
					out += "[" + field.replace(':', '__') + "] " + (sort[field] > 0 ? "ASC " : "DESC ");
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
	},
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
			if (status < 300 || app.MODE !== 'offline') {
				op.output = [status, response];
				op.shutdown();
			} else {
				op.retry(5000);
			}
		});
	}
});


Model = Function.inherit(function (doc) {
	var d = doc || {};
	doc = {};
	Object.getOwnPropertyNames(d).forEach(function (key) {
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
			},
		},
		'changed': {
			get: function () {
				return _changed;
			},
			set: function (value) {
				_changed = !!value;
			},
		},
		'doc': {
			value: doc,
			writable: false,
		},
		'id': {
			get: function () {
				return doc._id || null;
			},
			set: function (value) {
				if (doc._id !== value) {
					if (doc._id) {
						console.warn('Rewriting an UUID');
					}

					doc._id = value;
					_changed = true;
					if (app.MODE === 'offline') {
						_stored = false;
					}
				}
			},
		},
		'parent': {
			get: function () {
				if (typeof this.getParent !== 'function') {
					throw new Error('No parent association');
				}
				return doc._parent || null;
			},
			set: function (value) {
				if (typeof this.getParent !== 'function') {
					throw new Error('No parent association');
				}
				doc._parent = (value instanceof Model) ? value[app.MODE === 'offline' ? 'id' : value.constructor.api_field] : value;
				this._cache.parent = (value instanceof Model) ? value : undefined;
				_changed = true;
			},
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
		});
	}, this);

	// parent
	if (typeof doc._parent === 'object') {
		if (app.MODE !== 'offline') {
			this._cache.parent = new window[this.constructor.parent_constructor](doc._parent);
		}
		this.parent = this._cache.parent;
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
					if (app.MODE !== 'offline') {
						m._cache.parent = this;
					}
					cache.push(m);
				}, this);
			} else {
				cache = new model(doc[key]);
				if (app.MODE !== 'offline') {
					cache._cache.parent = this;
				}
			}
			this._cache[key] = cache;
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
		if (!this.isValid()) {
			throw new Error('Item is not valid');
		}

		var op = new ApiOperation(
			this.stored ? 'PUT' : 'POST',
			this.constructor.getApiUri(this.stored ? this[this.constructor.api_field] : undefined),
			this.doc
		);

		if (app.MODE === 'online') {
			app.queue(op, function (status, response) {
				callback(status < 300 ? null : new Error('Failed to save the resource'));
			});
			return;
		}

		var st = new SQLStatement(this.stored ? 'update' : 'create', this.collection),
			model = this,
			selector = { _id: this.id },
			data = {},
			sql;
		if (this.constructor.namespace !== null) {
			if (!app.namespace) {
				throw new Error('Global namespace is not defined');
			}
			selector._ns = app.namespace;
			this.doc._ns = app.namespace;
		}
		st.selector = selector;
		st.data = this.doc;

		sql = st.sql;
		execute = function (tx) {
			tx.executeSql(sql[0], sql[1], function (tx, result) {
				model.stored = true;
				model.changed = false;

				callback(null);
				if (options.online !== false) {
					app.queue(op);
				}
			}, function (tx, err) {
				console.error('SQL Error: ' + err.message + '; ' + JSON.stringify(err));
				console.log('The SQL query was:', sql[0], sql[1]);
				callback(err);
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
		}

		if (this.id === null) {
			throw new Error('Error: Object has no ID');
		}
		if (typeof this.beforeDelete === 'function') {
			this.beforeDelete();
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

		sql = st.sql;
		execute = function (tx) {
			tx.executeSql(sql[0], sql[1], function (tx, result) {
				model.stored = false;
				model.changed = true;

				callback(null);
			}, function (tx, err) {
				console.error('SQL Error: ' + err.message + '; ' + JSON.stringify(err));
				console.log('The SQL query was:', sql[0], sql[1]);
				callback(err);
			});
		};

		if (options.tx) {
			execute(options.tx);
		} else {
			app.db.transaction(execute);
		}
	},

	'isValid': function () {
		var errors = {},
			errors_json,
			rules;

		rules = this.constructor.prototype.validates_presence_of || [];
		rules.forEach(function (key) {
			if (!this[key]) {
				if (errors[key] === undefined) {
					errors[key] = [];
				}
				errors[key].push('presence');
			}
		}, this);

		rules = this.constructor.prototype.validates_format_of || {};
		Object.getOwnPropertyNames(rules).forEach(function () {
			if (!rules[key].test(this[key])) {
				if (errors[key] === undefined) {
					errors[key] = [];
				}
				errors[key].push('format');
			}
		}, this);

		errors_json = JSON.stringify(errors);
		this.errors = (errors_json !== '{}') ? errors : null;
		return !this.errors;
	},

	'generateId': function () {
		this.id = uuid().replace(/\-/g, '');
	},

	'updateTimestamp': function (key) {
		var desc = Object.getOwnPropertyDescriptor(this, key);
		if (desc === undefined) {
			throw new Error('Unknown field (' + key + ')');
		}
		this[key] = Math.round(new Date().getTime() / 1000);
	},
});

Object.defineProperties(Model.prototype, {
	'collection': {
		get: function () {
			return this.constructor.collection;
		},
	},
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
		selector = {};
		options = {};
		callback = arguments[0];
	} else if (arguments.length === 2) {
		options = {};
		callback = arguments[1];
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

	if (options.online === true || app.MODE === 'online') {
		var uri = (options.limit === 1) ? this.getApiUri(selector[M.api_field.replace(/^id$/, '_id')]) : this.getApiUri();
		this.api('GET', uri, function (status, response) {
			if (status !== 200) {
				if (options.limit === 1) {
					callback(new M());
				} else {
					alert('Failed to fetch ' + M.collection);
				}
				return;
			}
			if (options.limit === 1) {
				callback(new M(response));
			} else {
				var models = [];
				response.forEach(function (item) {
					models.push(new M(item));
				});
				callback(models);
			}
		});
		return;
	}

	var st = new SQLStatement('read', this.collection),
		sql,
		execute;

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
	}

	sql = st.sql;
	execute = function (tx) {
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
				callback(options.limit !== 1 ? models : models[0] || new M());
			} else {
				// fallback to online
				callback([]);
			}
		}, function (tx, err) {
			console.error('SQL Error: ' + err.message + '; ' + JSON.stringify(err));
			console.log('The SQL query was:', sql[0], sql[1]);
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
		proto['get' + name] = function (options, callback) {
			if (arguments.length === 1) {
				options = {};
				callback = arguments[0];
			}

			var model = window[name],
				selector = {};
			if (model === undefined) {
				throw new Error('Invalid association: ' + name + ' is not defined');
			}
			Object.getOwnPropertyNames(sel).forEach(function (key) {
				selector[key] = sel[key];
			});

			if (app.MODE === 'offline') {
				selector._parent = this.id;
				return model.one(selector, options, callback);
			} else {
				if (this._cache[key]) {
					callback(this._cache[key]);
					return;
				}
				var uri = this.constructor.getApiUri(this[this.constructor.api_field], key);
				model.api('GET', uri, function (status, response) {
					if (status !== 200) {
						callback(new model());
						return;
					}
					var m = new model(response);
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
		proto['get' + name] = function (options, callback) {
			if (arguments.length === 1) {
				callback = arguments[0];
				options = {};
			}
			name = name.replace(/ies$/, 'y').replace(/s$/, '');

			var model = window[name],
				selector = {};
			if (model === undefined) {
				throw new Error('Invalid association: ' + name + ' is not defined');
			}
			Object.getOwnPropertyNames(sel).forEach(function (key) {
				selector[key] = sel[key];
			});

			if (app.MODE === 'offline') {
				selector._parent = this.id;
				return model.all(selector, options, callback);
			} else {
				if (this._cache[key]) {
					callback(this._cache[key]);
					return;
				}
				var uri = this.constructor.getApiUri(this[this.constructor.api_field], name);
				model.api('GET', uri, function (status, response) {
					if (status !== 200) {
						alert('Failed to fetch ' + name);
						return;
					}
					var models = [];
					response.forEach(function (item) {
						models.push(new model(item));
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
Model.belongs_to = function (belongs_to) {
	if (belongs_to instanceof Array === true || arguments.length > 1) {
		throw new Error('belongs_to: Multiple parents are not implemented');
	}

	var name = belongs_to.replace(/^\w/, upper);
	this.parent_constructor = name;
	this.prototype.getParent = function (options, callback) {
		if (arguments.length === 1) {
			callback = arguments[0];
			options = {};
		}

		var model = window[name],
			selector = {};
		if (model === undefined) {
			throw new Error('Invalid association: ' + name + ' is not defined');
		}

		if (app.MODE === 'offline') {
			selector._id = this.doc._parent;
			return model.one(selector, options, callback);
		} else {
			if (this._cache.parent) {
				callback(this._cache.parent);
				return;
			}			
			model.api('GET', model.getApiUri(this.parent), function (status, response) { // possible fail (.parent in online)
				if (status !== 200) {
					callback(new model());
					return;
				}
				var m = new model(response);
				this._cache.parent = m;
				callback(m);
			}.bind(this));
		}
	};
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

	var data_str = '',
		xhr = new XMLHttpRequest(),
		headers = this.headers || {};

	uri = app._cfg.api_root + '/' + uri;
	uri = uri.replace(new RegExp('./+', 'g'), function (a) {
		return (a[0] === ':' && a.length > 2) ? '://' : a[0] + '/';
	});
	Object.getOwnPropertyNames(params).forEach(function (key, i) {
		uri += (i === 0) ? '?' : '&';
		uri += key + '=' + encodeURIComponent(params[key]);
	});

	Object.getOwnPropertyNames(data).forEach(function (key, i) {
		data += (i !== 0) ? '&' : '';
		data += key + '=' + encodeURIComponent(data[key]);
	});

	xhr.open(method, uri, true);
	Object.getOwnPropertyNames(headers).forEach(function (key) {
		xhr.setRequestHeader(key, headers[key]);
	});
	if ((method === 'POST' || method === 'PUT') && headers['content-type'] === undefined) {
		xhr.setRequestHeader('content-type', 'application/x-www-form-urlencoded');
	}
	xhr.onreadystatechange = function () {
		if (this.readyState === 4) {
			var json;
			try {
				json = JSON.parse(this.responseText);
			} catch (exc) {
				callback(this.status, this.responseText ? { 'data': this.responseText } : null, this);
			}
			if (json) {
				callback(this.status, json, this);
			}
		}
	};
	xhr.send(data_str || null);
};

Model.getApiUri = function (id, assoc) {
	var uri = '/' + this.collection.toLowerCase();
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