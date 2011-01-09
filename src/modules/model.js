(function (window) {

var Model = Class.create({
	'initialize': function (doc, api_loaded) {
		if (!this.hasOwnProperty('__proto__')) {
			this.__proto__ = this.constructor.prototype;
		}

		doc = doc || {};

		this._exists = (api_loaded || doc._id !== undefined);
		this._api_loaded = api_loaded;
		this.doc = {};

		var fields = this.fields;
		for (var i = 0, ii = fields; i < ii; ++i) {
			this[fields[i]] = null;
			this.doc[fields[i]] = null;
		}

		for (var key in doc) {
			if (doc.hasOwnProperty(key)) {
				if (key.search(':') > -1 || key.search('__') > -1 || key[0] == '_') {
					this.doc[key.replace('__', ':')] = doc[key];
				}
				if (key[0] != '_') {
					this[key.replace('__', ':')] = doc[key];
				}
			}
		}
	},

	'exists': function () {
		return this._exists;
	},

	'getId': function () {
		return this.exists() ? this.doc._id : null;
	},

	'setId': function (id) {
		this.doc._id = id;
	},

	'getFields': function (keys) {
		var output = {};

		var fields = keys || this.fields;
		for (var i = 0, ii = fields.length; i < ii; ++i) {
			var key = fields[i],
				default_value = null;
			if (key instanceof Array) {
				default_value = key[1];
				key = key[0];
			}
			if (key.search(':') == -1) {
				throw 'Invalid field name "' + key + '"';
			}

			output[key] = (this[key] !== undefined) ? this[key] : default_value;
		}

		return output;
	},

	'giveTo': function (obj, key) {
		/*if (obj === undefined || obj.doc === undefined || key === undefined) {
			throw 'Invalid state';
		}
		if (!obj.exists()) {
			throw 'The document has not been saved yet.';
		}*/

		this.doc[key] = obj.getId();
		
		return this;
	},

	'get': function (key, type, selector, options, callback) {
		if (arguments[4] === undefined) {
			if (typeof arguments[3] == 'function') {
				callback = arguments[3];
				options = {};
			}
		}
		if (arguments[3] === undefined) {
			if (typeof arguments[2] == 'function') {
				callback = arguments[2];
				options = {};
				selector = {};
			}
		}
/*
		A[id]
		B[id, owner]

		a = { _id: owner }
		b = { owner: id }
*/
		var owner_id = this.getId();
		if (owner_id === null) {
			throw 'The parent document has not been saved yet (when trying to get its sub documents under the key "' + key + '"").';
		}
		selector.owner = owner_id;
		if (this.fields.indexOf('date:deleted') > -1) {
			selector.date__deleted = { $exists: false };
		}

		if (!this._api_loaded) {
			type.all(selector, options, callback);
		} else {
			var docs = this[key] || [],
				children = [];
			for (var i = 0, ii = docs.length; i < ii; ++i) {
				children.push(new type(docs[i], true));
			}
			callback(children);
		}
	},

	'getParent': function (key, type, selector, options, callback) {
		if (arguments[4] === undefined) {
			if (typeof arguments[3] == 'function') {
				callback = arguments[3];
				options = {};
			}
		}
		if (arguments[3] === undefined) {
			if (typeof arguments[2] == 'function') {
				callback = arguments[2];
				options = {};
				selector = {};
			}
		}

		if (this._api_loaded && typeof this[key] == 'object') {			
			callback(new type(this[key], true));
			return;
		}
		
		selector._id = this.doc[key];
		options.one = true;
		
		type.one(selector, options, callback);
	},

	'save': function (callback) {
		for (var key in this) {
			if (this.hasOwnProperty(key) && (key.search(':') > -1 || key[0] == '_')) {
				this.doc[key] = this[key];
			}
		}

		var sql = Model._getSQL(
			this.exists() ? 'update' : 'insert',
			this.collection_name,
			this.exists() ? { _id: this.getId() } : null,
			this.doc
		);

		var fn_success = function (tx, result) {
			this._exists = true;
			callback();
		}.bind(this);
		var fn_error = function (tx, error) {
			throw Error('Save operation failed: ' + error.message);
		};
		var execute_query = function (sql, params) {
			this.transaction.executeSql(sql, params, fn_success, fn_error);
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

	'remove': function (callback) {
		if (this.soft_delete) {
			this['date:deleted'] = Math.round(new Data().getTime() / 1000);
			this.save(callback);
		} else if (this.exists()) {
			var sql = Model._getSQL('delete', this.collection_name, { _id: this.getId() });

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
		}
	}
});

Model.one = function (selector, options, callback) {	
	if (arguments[2] === undefined) {
		if (typeof arguments[1] == 'function') {
			callback = arguments[1];
			options = {};
		}
	}
	if (options instanceof Array) {
		options = {
			'fields': options
		};
	}
	if (typeof selector == 'string') {
		selector = {
			_id: selector
		};
	}

	options.one = true;

	this.all(selector, options, callback);
};

Model.all = function (selector, options, callback) {
	if (arguments[2] === undefined) {
		if (typeof arguments[1] == 'function') {
			callback = arguments[1];
			options = {};
		}
	}
	if (options instanceof Array) {
		options = {
			'fields': options
		};
	}
	
	var one = !!options.one;
	if (one) {
		delete options.one;
	}
	if (options.sort === undefined) {
		options.sort = 'date:created';
	}
	
	var sql = this._getSQL('select', this.collection_name, selector, options);

	var fallback = function () {
		if (!options.fallback) {
			callback(one ? new this() : []);
			return;
		}

		this.api(options.fallback, function (status, response) {
			if (response instanceof Array) {
				var docs = [];
				for (var i = 0, ii = response.length; i < ii; ++i) {
					docs.push(new this(response[i], true));
				}
				callback(one ? (docs[0] || new this()) : docs);
			} else {
				var doc = new this(response, true);
				callback(one ? doc : [doc]);
			}
		}.bind(this));
	}.bind(this);

	var fn_success = function (tx, result) {
		var rows = result.rows,
			docs = [],
			i, ii = rows.length;		
		if (ii > 0) {
			for (i = 0; i < ii; ++i) {
				docs.push(new this(rows.item(i)));
				if (one) {
					break;
				}
			}
		} else {
			fallback();
			return;
		}

		callback(one ? (docs[0] || new this()) : docs);
	}.bind(this);
	var fn_error = function (tx, error) {
		throw Error('Select operation failed: ' + error.message);
	};
	var execute_query = function (sql, params) {
		try {
			this.transaction.executeSql(sql, params, fn_success, fn_error);
		} catch (exc) {
			// old transaction used (DOM Invalid State Exception 11)
			// try with a new transaction
			app.db.transaction(function (tx) {
				this.transaction = tx;
				execute_query(sql, params);
			}.bind(this));
			// kind of a messy solution; should be improved eventually
		}
	}.bind(this);
	
	if (app.MODE == 'online' || options.online) {
		fallback();
		return;
	}

	if (!this.transaction) {
		app.db.transaction(function (tx) {
			this.transaction = tx;
			execute_query(sql[0], sql[1]);
		}.bind(this));
	} else {
		execute_query(sql[0], sql[1]);
	}
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

Model.api = function (uri, params, callback) {
	if (typeof arguments[1] == 'function') {
		callback = arguments[1];
		params = {};
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
	xhr.open('GET', url, true);

	var headers = Model._headers || {};
	for (var h in headers) {
		if (headers.hasOwnProperty(h)) {
			xhr.setRequestHeader(h, headers[h]);
		}
	}

	xhr.onreadystatechange = function () {
		if (this.readyState == 4) {
			try {
				var json = this.responseText.evalJSON();
				callback(this.status, json, this);
			} catch (exc) {
				console.log(JSON.stringify(exc));
				callback(this.status, null, this);				
			}			
		}
	};
	xhr.send(null);
};

Model._headers = {};
Model.setGlobalHeaders = function (headers) {
	Object.extend(this._headers, headers);
};



var Factory = {
	'models': {},

	'create': function (model_name, collection_name, spec) {
		if (model_name === undefined || collection_name === undefined) {
			throw 'Invalid state';
		}
		if (typeof collection_name != 'string') {
			if (typeof collection_name != 'object') {
				throw 'Invalid state';
			}
			spec = collection_name;
			collection_name = false;
		}

		spec.name = model_name;
		spec.collection_name = collection_name;

		var model = Class.create(Model, spec);
		model.collection_name = collection_name;

		// add the static methods as well
		for (var method in Model) {
			if (Model.hasOwnProperty(method) && typeof Model[method] == 'function') {
				model[method] = Model[method];
			}
		}
		
		Factory.models[model_name] = model;
		return model;
	}
};


window.Model = Model;
window.ModelFactory = Factory;

})(window);