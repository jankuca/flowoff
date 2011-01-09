(function (window) {

var fn_or = function (opts, placeholders, outer, return_params) {
	var out = !return_params ? " AND ( " : [],
		opts_processed = [],
		i, ii;
	for (i = 0, ii = opts.length; i < ii; ++i) {
		if (!return_params) {
			opts_processed.push(process_selector(opts[i], placeholders, outer, return_params));
		} else {
			out = out.concat(process_selector(opts[i], placeholders, outer, return_params));
		}
	}
	if (!return_params) {
		for (i = 0, ii = opts_processed.length; i < ii; ++i) {
			out += "( " + opts_processed[i] + " ) OR ";
		}
	}
	return !return_params ? out.substring(0, out.length - 4) + " )" : out;
};

var process_selector = function (selector, placeholders, outer, return_params) {
	var out = !return_params ? '' : [];
	for (var key in selector) {
		if (selector.hasOwnProperty(key)) {
			if (key[0] != '$') {
				var value = selector[key];
				key = key.replace(/:/g, '__').replace(/\./g, '___');
				if (typeof value != 'object') {
					if (!return_params) {
						out += " AND [" + (outer !== undefined ? outer + "___" : "") + key + "] = ";
						out += (!placeholders) ? "'" + value.toString().replace(/'/g, "\\'") + "'" : "?";
					} else {
						out.push(value);
					}
				} else {
					for (var mod in value) {
						if (value.hasOwnProperty(mod)) {
							if (mod[0] == '$') {
								switch (mod.substring(1)) {
								case 'gt':
									if (!return_params) {
										out += " AND [" + (outer !== undefined ? outer + "___" : "") + key + "] > " + (!placeholders ? value[mod] : "?");
									} else {
										out.push(value[mod]);
									}
									break;
								case 'gte':
									if (!return_params) {
										out += " AND [" + (outer !== undefined ? outer + "___" : "") + key + "] >= " + (!placeholders ? value[mod] : "?");
									} else {
										out.push(value[mod]);
									}
									break;
								case 'lt':
								if (!return_params) {
										out += " AND [" + (outer !== undefined ? outer + "___" : "") + key + "] < " + (!placeholders ? value[mod] : "?");
									} else {
										out.push(value[mod]);
									}
									break;
								case 'lte':
									if (!return_params) {
										out += " AND [" + (outer !== undefined ? outer + "___" : "") + key + "] <= " + (!placeholders ? value[mod] : "?");
									} else {
										out.push(value[mod]);
									}
									break;
								case 'ne':
									if (!return_params) {
										out += " AND [" + (outer !== undefined ? outer + "___" : "") + key + "] != " + (!placeholders ? "'" + value[mod].toString().replace(/'/g, "\\'") + "'" : "?");
									} else {
										out.push(value[mod]);
									}
									break;
								case 'in':
									if (!value[mod].length) {
										throw 'Invalid state: No items for the IN operator';
									}
									if (!return_params) {
										out += " AND [" + (outer !== undefined ? outer + "___" : "") + key + "] IN (";
										if (!placeholders) {										
											out += "'" + value[mod].join("', '") + "')";
										} else {
											var arr = value[mod];
											for (var i = 0, ii = arr.length; i < ii; ++i) {
												arr[i] = "?";
											}
											out += arr.join(", ");
										}
										out += ")";
									} else {
										out = out.concat(value[mod]);
									}
									break;
								case 'nin':
									if (!value[mod].length) {
										throw 'Invalid state: No items for the NOT IN operator';
									}
									if (!return_params) {
										out += " AND [" + (outer !== undefined ? outer + "___" : "") + key + "] NOT IN (";
										if (!placeholders) {
											out += "'" + value[mod].join("', '") + "')";
										} else {
											var arr = value[mod];
											for (var i = 0, ii = arr.length; i < ii; ++i) {
												arr[i] = "?";
											}
											out += arr.join(", ");
										}
										out += ")";
									} else {
										out = out.concat(value[mod]);
									}
									break;
								case 'exists':
									if (!return_params) {
										out += " AND [" + (outer !== undefined ? outer + "___" : "") + key + "] IS " + (value[mod] ? "NOT NULL" : "NULL");
									}
									break;
								case 'or':
									if (!return_params) {
										out += fn_or(value[mod], placeholders, key);
									} else {
										out = out.concat(fn_or(value[mod], placeholders, key, true));
									}
									break;
								}
							} else {
								if (typeof value[mod] == 'object') {
									if (!return_params) {
										out += " AND " + process_selector(value, placeholders, key);
									}
								} else {
									if (!return_params) {
										out += " AND [" + key + "___" + mod + "] = ";
										out += (!placeholders) ? "'" + value[mod].toString().replace(/'/g, "\\'") + "'" : "?";
									} else {
										out.push(value[mod]);
									}
								}
							}
						}
					}
				}
			} else {
				switch (key.substring(1)) {
				case 'or':
					if (!return_params) {
						out += fn_or(selector[key], placeholders, outer);
					} else {
						out = out.concat(fn_or(selector[key], placeholders, outer, true));
					}
					break;
				}
			}
		}
	}

	return !return_params ? out.substring(5) : out;
};

window.mongo2sql = process_selector;
window.mongo2sql_params = function (selector, placeholders, outer) {
	return process_selector(selector, placeholders, outer, true);
};

})(window);