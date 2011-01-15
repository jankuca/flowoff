(function (window) {

var Model = Class.create({
	'initialize': function (doc, api_loaded) {
		if (typeof doc === 'boolean') {
			api_loaded = doc;
			doc = {};
		} else {
			doc = doc || {};
		}
		
		if (!doc._ns && !this.no_namespace) {
			doc._ns = null;
		}
		this._api_loaded = !!api_loaded;
		this._exists = !!doc._id;
		if (!this._exists) {
			doc._id = null;
		}
		this.doc = {};
		for (var key in doc) {
			if (doc.hasOwnProperty(key)) {
				this.doc[key.replace('__', ':')] = doc[key];
				if (key.search('__') > -1 || key.search(':') > -1) {
					this[key.replace('__', ':')] = doc[key];
				}
			}
		}
		var fields = this.fields;
		for (var f = 0, ff = fields.length; f < ff; ++f) {
			var field = fields[f];
			if (doc[field] === undefined) {
				doc[field] = null;
			}
		}
	},

	'exists': function () {
		return this._exists;
	},
	'isValid': function () {
		var rules, r, rr, key;
		var errors = {};

		rules = this.constructor.prototype.validates_presence_of || [];
		for (r = 0, rr = rules.length; r < rr; ++r) {
			key = rules[r];
			if (!this[key]) {
				if (errors[key] === undefined) {
					errors[key] = [];
				}
				errors[key].push('presence');
			}
		}

		rules = this.constructor.prototype.validates_format_of || {};
		for (key in rules) {
			if (rules.hasOwnProperty(key) && !rules[key].test(this[key])) {
				if (errors[key] === undefined) {
					errors[key] = [];
				}
				errors[key].push('format');
			}
		}

		var errors_json = Object.toJSON(errors);
		if (errors_json != '{}') {
			this.errors = errors;
		}
		return (errors_json == '{}');
	},

	'getId': function () {
		if (!this.doc._id) {
			throw 'Invalid state: Document not saved';
		}
		return this.doc._id;
	},
	'setId': function (id) {
		this.doc._id = id;
		this._exists = true;
	},
	'generateId': function () {
		if (this.doc._id) {
			console.warn('Rewriting an UUID');
		}

		this.doc._id = Math.uuid(24, 16).toLowerCase().replace(/\-/g, '');
		this._exists = false;
	},

	'getNS': function () {
		return this.doc._ns || null;
	},
	'setNS': function (ns) {
		this.doc._ns = ns;
	},

	'set': function (key, obj) {
		if (!this._api_loaded) {
			this.doc[key] = obj.doc ? obj.getId() : obj;
		} else {
			this.doc[key] = obj;
		}
	},
	'add': function (key, obj) {
		if (this.doc[key] === undefined || this.doc[key] instanceof Array !== true) {
			this.doc[key] = [];
		}

		if (!this._api_loaded) {
			this.doc[key].push(obj.doc ? obj.getId() : obj);
		} else {
			this.doc[key].push(obj);
		}
	},

	'get': function (key, type, options, callback) {
		if (arguments.length === 3) {
			callback = options;
			options = {};
		}

		var selector = {};
		if (this.getNS()) {
			selector._ns = this.getNS();
		}

		var assoc_ids = this.doc[key];
		if (assoc_ids instanceof Array) {
			if (assoc_ids.length === 0) {
				callback([]);
			} else if (typeof assoc_ids[0] == 'object') {
				var docs = [];
				for (var i = 0, ii = assoc_ids.length; i < ii; ++i) {
					if (this.doc._ns) {
						assoc_ids[i].setNS(this.getNS());
					}
					docs.push(new type(assoc_ids[i], this._api_loaded));
				}
				callback(options._one ? docs[0] : docs);
			} else {
				selector._id = { $in: assoc_ids };
				type.all(selector, options, callback);
			}
		} else if (typeof assoc_ids == 'object') {
			if (this.doc._ns) {
				assoc_ids.setNS(this.getNS());
			}
			var doc = assoc_ids;
			if (doc.doc === undefined) {
				doc = new type(doc);
			}
			callback(options._one ? doc : [doc]);
		} else if (typeof assoc_ids == 'string') {
			selector._id = assoc_ids;
			type.all(selector, options, callback);
		} else {
			selector[key] = this.getId();
			type.all(selector, options, callback);
		}
	},
	'getOne': function (key, type, options, callback) {
		if (arguments.length === 3) {
			callback = options;
			options = {};
		}
		if (!options) {
			options = {};
		}

		options._one = true;
		this.get(key, type, options, callback);
	},

	'save': function (options, callback) {
		if (typeof options === 'function') {
			callback = options;
			options = {};
		}

		if (typeof this.beforeSave === 'function') {
			this.beforeSave();
		}

		for (var key in this) {
			if (this.hasOwnProperty(key) && key.search(':') > -1) {
				this.doc[key] = this[key];
			}
		}

		var fallback = function () {
			if (options.fallback === undefined) {
				throw 'Invalid state: No fallback URI specified';
			}
			if (options.method === undefined) {
				options.method = !this._exists ? 'POST' : 'PUT';
			}

			var data = {};
			var doc = this.doc;
			for (var key in doc) {
				if (doc.hasOwnProperty(key) && (key === '_id' || key.search(':') > -1)) {
					data[key] = doc[key];
				}
			}

			Model.api(options.method, options.fallback, {}, data, function (status, response) {
				if (status === 204) {
					callback();
				}
			}.bind(this));
		}.bind(this);

		if (app.MODE === 'online' || options.online) {
			fallback();
			return;
		}

		var sql = Model._getSQL(
			this.exists() ? 'update' : 'insert',
			this.collection,
			this.exists() ? { _id: this.getId() } : null,
			this.doc
		);

		var fn_success = function (tx, result) {
			this._exists = true;

			if (typeof this.afterSave === 'function') {
				this.afterSave();
			}

			callback();
		}.bind(this);
		var fn_error = function (tx, error) {
			throw Error('Save operation failed: ' + error.message);
		};
		var execute_query = function (sql, params) {
			try {
				this.transaction.executeSql(sql, params, fn_success, fn_error);
			} catch (exc) {
				app.db.transaction(function (tx) {
					this.transaction = tx;
					execute_query(sql, params);
				}.bind(this));	
			}
		}.bind(this);

		if (!this.transaction) {
			app.db.transaction(function (tx) {
				this.transaction = tx;
				execute_query(sql[0], sql[1]);
			}.bind(this));
		} else {
			execute_query(sql[0], sql[1]);
		}
	},

	'update': function (data) {
		for (var key in data) {
			if (data.hasOwnProperty(key) && key.search(':') > -1) {
				this[key] = data[key];
			}
		}
		return this;
	},
	'updateTimestamp': function (key) {
		this[key] = Math.round(new Date().getTime() / 1000);
	},

	'remove': function (callback) {
		if (this.soft_delete) {
			this.updateTimestamp('date:deleted');
			this.save(callback);
		} else if (this.exists()) {
			if (this._api_loaded) {
				throw 'Not implemented yet';
			}

			(this.beforeDelete || function (callback) { callback(); })(function () {
				var sql = Model._getSQL('delete', this.collection, { _id: this.getId() });

				var fn_success = function (tx, result) {
					callback();
				};
				var fn_error = function (tx, error) {
					throw Error('Delete operation failed: ' + error.message);
				};
				var execute_query = function (sql, params) {
					this.transaction.executeSql(sql, params, fn_success, fn_error);
				}.bind(this);

				if (!this.transaction) {
					app.db.transaction(function (tx) {
						this.transaction = tx;
						execute_query(sql[0], sql[1]);
					});
				} else {
					execute_query(sql[0], sql[1]);
				}
			}.bind(this));
		} else {
			throw 'Invalid state: Cannot delete a document that either does not exist or has not been saved yet.';
		}
	}
});

Model.one = function (selector, options, callback) {	
	if (arguments.length === 2) {
		callback = options;
		options = {};		
	} else if (arguments.length === 1) {
		callback = selector;
		selector = {};
		options = {};		
	}

	options._one = true;
	this.all(selector, options, callback);
};

Model.all = function (selector, options, callback) {
	if (arguments.length === 2) {
		callback = options;
		options = {};
	} else if (arguments.length === 1) {
		callback = selector;
		selector = {};
		options = {};
	}

	var online = (options.online || app.MODE == 'online');
	if (online && !options.fallback) {
		throw 'Invalid state: No fallback URI specified.';
	}

	var fallback = function () {
		this.api('GET', options.fallback, function (status, response) {
			if (response instanceof Array) {
				var docs = [];
				for (var i = 0, ii = response.length; i < ii; ++i) {
					docs.push(new this(response[i], true));
				}
				callback(options._one ? (docs[0] || new this(true)) : docs);
			} else if (typeof response === 'object' && response !== null) {
				var doc = new this(response, true);
				callback(options._one ? doc : [doc]);
			} else {
				callback(options._one ? new this(true) : []);
			}
		}.bind(this));
	}.bind(this);

	if (online) {
		fallback();
		return;
	}

	// begin OFFLINE MODE

	if (this.prototype.soft_delete && !options.deleted && this.prototype.fields.indexOf('date:deleted') > -1) {
		selector['date:deleted'] = { $exists: false };
	}

	var sql = this._getSQL('select', this.collection, selector, options);
	
	var transaction;
	var execute = function () {
		transaction.executeSql(sql[0], sql[1], function (tx, results) {
			var docs = [];
			var rows = results.rows;
			if (rows.length === 0 && options.fallback) {
				fallback();
				return;
			}
			for (var r = 0, rr = rows.length; r < rr; ++r) {
				docs.push(new this(rows.item(r)));
			}

			callback(options._one ? docs.first() || new this() : docs);
		}.bind(this), function (tx, error) {
			console.error('SQLERROR: ' + error.message + '; ' + JSON.stringify(error));			
		});
	}.bind(this);
	if (options.transaction) {
		transaction = options.transaction;
		try {
			execute();
		} catch (exc) {
			app.db.transaction(function (tx) {
				transaction = tx;
				execute();
			});
		}
	} else {
		app.db.transaction(function (tx) {
			transaction = tx;
			execute();
		});
	}
};

Model.api = function (method, uri, params, data, callback) {
	if (typeof arguments[2] == 'function') {
		callback = arguments[2];
		params = {};
		data = {};
	}
	if (typeof arguments[3] == 'function') {
		callback = arguments[3];
		data = {};
	}

	var api_root = app._cfg.api_root;

	var qs = null;
	if (Object.toJSON(params) != '{}') {
		var e = [];
		for (var key in params) {
			if (params.hasOwnProperty(key)) {
				e.push(key + '=' + encodeURIComponent(params[key]));
			}
		}
		qs = e.join('&');
	}
	var url = api_root.substring(0, api_root.length - 1) + uri + (qs !== null ? '?' + qs : '');

	var xhr = new XMLHttpRequest();
	xhr.open(method, url, true);

	var headers = Model._headers || {};
	for (var h in headers) {
		if (headers.hasOwnProperty(h)) {
			xhr.setRequestHeader(h, headers[h]);
		}
	}

	xhr.onreadystatechange = function () {
		if (this.readyState == 4) {
			var json;
			try {
				json = this.responseText.evalJSON();
			} catch (exc) {
				callback(this.status, null, this);				
			}
			if (json) {
				callback(this.status, json, this);
			}
		}
	};
	xhr.send(Object.toQueryString(data));
};


Model._headers = {};
Model.setGlobalHeaders = function (headers) {
	Object.extend(this._headers, headers);
};


/**
 * Universal SQL factory
 * --
 * @('select', table, selector, options)
 * @('insert', table, null, data)
 * @('update', table, selector, data)
 * @('delete', table, selector)
 */
Model._getSQL = function (operation, table, selector, options) {
	var sql = "";
	var params = [];
	var key;
	switch (operation) {
	case 'select':
		sql += "SELECT ";
		if (options.fields === undefined) {
			options.fields = ['*'];
		}
		sql += options.fields.join(", ") + " ";

		sql += "FROM [" + table + "] ";

		if (selector && Object.toJSON(selector) != '{}') {
			params = params.concat(mongo2sql_params(selector));
			sql += "WHERE " + mongo2sql(selector, true) + " ";
		}

		var sort = options.sort;
		if (sort !== undefined) {
			if (typeof sort != 'object') {
				options.sort = {};
				options.sort[sort] = 1;
				sort = options.sort;
			}
			sql += "ORDER BY ";
			for (key in sort) {
				if (sort.hasOwnProperty(key)) {
					sql += "[" + key.replace(':', '__') + "] " + (sort[key] > 0 ? "ASC " : "DESC ");
				}
			}
		}

		if (options._one) {
			sql += "LIMIT 1 ";
		}
		break;

	case 'insert':
		sql += "INSERT INTO [" + table + "] ";

		var fields = [];			
		for (key in options) {
			if (options.hasOwnProperty(key)) {
				fields.push("[" + key.replace(':', '__') + "]");
				params.push(options[key]);
			}
		}
		if (fields.length === 0) {
			throw 'Invalid state';
		}
		sql += "(" + fields.join(", ") + ") VALUES (";
		for (var i = 0, ii = params.length; i < ii; ++i) {
			sql += "?";
			if (i < ii - 1) {
				sql += ", ";
			}
		}
		sql += ")";
		break;

	case 'update':
		sql += "UPDATE [" + table + "] SET ";

		for (key in options) {
			if (options.hasOwnProperty(key)) {
				params.push(options[key]);

				sql += "[" + key.replace(':', '__') + "] = ?";
				sql += ", ";				
			}
		}
		sql = sql.substring(0, sql.length - 2) + " ";

		for (key in selector) {
			if (selector.hasOwnProperty(key)) {
				params.push(selector[key]);
			}
		}
		sql += "WHERE " + mongo2sql(selector, true);
		break;

	case 'delete':
		sql += "DELETE FROM [" + table + "] ";
		
		for (key in selector) {
			if (selector.hasOwnProperty(key)) {
				params.push(selector[key]);
			}
		}
		sql += "WHERE " + mongo2sql(selector, true);
		break;
	}

	return [sql, params];
};


var Factory = {
	'create': function (spec) {
		if (spec.fields instanceof Array !== true) {
			throw 'Invalid model definition: Fields not specified';
		}

		var model = Class.create(Model, spec);
		model.collection = spec.collection;

		// add the static methods as well
		for (var method in Model) {
			if (Model.hasOwnProperty(method) && typeof Model[method] == 'function') {
				model[method] = Model[method];
			}
		}

		return model;
	}
};


window.Model = Model;
window.ModelFactory = Factory;

})(window);