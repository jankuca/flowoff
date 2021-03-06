window.FlowOff = {
	'load': function (path, callback) {
		var old_root = require.ROOT;
		require.ROOT += path;

		var _load = function () {
			require.js(
				'lib/json/json2.js',
				'lib/ejs/ejs.js',
				'lib/mongo2sql/mongo2sql.js',
				'lib/uuid/uuid.js',
				'src/modules/router.js',
				'src/modules/operation.js',
				'src/modules/model.js',
				'src/modules/controller.js',
				'src/modules/component.js',
				'src/modules/form.js',
				'src/flowoff.js',
				function () {
					require.ROOT = old_root;
					if (typeof callback === 'function') {
						callback();
					}
				}
			);
		}

		if (Function.prototype.inherit === void 0) {
			require.js('lib/utils/utils.js', _load);
		} else {
			_load();
		}
	}
};