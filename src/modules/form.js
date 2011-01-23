if (window.Form === undefined) {
	window.Form = Class.create({
	});
}

window.Form.getValues = function (form) {
	var values = {};
	form.select('input', 'select', 'textarea').each(function (item) {
		var name = item.readAttribute('name');
		if (name) {
			values[name.replace('__', ':')] = item.getValue();
		}
	});
	
	return values;
};