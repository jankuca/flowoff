var Operation = Function.inherit(function () {
	this.input = Array.prototype.slice.call(arguments);
}, {
	'toString': function () {
		return '[object Operation]';
	},

	'execute': function (callback) {
		if (typeof callback === 'function') {
			this._callback = callback;
		}
		this.startup.apply(this, this.input);
	},

	'startup': function () {
	},

	'retry': function (delay) {
		console.log('retry in 5s');
		setTimeout(this.execute.bind(this), delay || 0);
	},

	'shutdown': function () {
		if (typeof this._callback === 'function') {
			this._callback();
		}
	},
});


var OperationQueue = Function.inherit(function (namespace) {
	this._namespace = namespace;
	this._items = [];
	this._items_simple = JSON.parse(window.localStorage[namespace] || '[]');

	this._items_simple.forEach(function (item) {
		var name = item[0].match(/^\[object ([A-Z]\w*)\]$/)[1],
			op = new window[name]();
		op.input = item.slice(1);
		this._items.push([op]);
	}, this);

	this._loop();
}, {
	'push': function (op, callback) {
		this._items.push(typeof callback === 'function' ? [op, callback] : [op]);
		if (this._namespace) {
			this._items_simple.push([op.toString()].concat(op.input));
			window.localStorage[this._namespace] = JSON.stringify(this._items_simple);
		}
		if (this.idle) {
			this._loop();
		}
	},
	'_loop': function () {
		var queue = this;
		this.idle = !this._items.length;
		if (this.idle) {
			return;
		}

		setTimeout(function () {
			var item = queue._items[0];
			queue._current_item = item;
			try {
				item[0].execute(function () {
					if (queue._namespace) {
						queue._items_simple.shift();
						window.localStorage[queue._namespace] = JSON.stringify(queue._items_simple);
					}
					queue._items.shift();
					if (typeof item[1] === 'function') {
						item[1].apply(this, queue.output || []);
					}
					queue._loop();
				});
			} catch (exc) {
				queue._loop();
			}
		}, 1000);
	},
});