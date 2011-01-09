# FlowOff JavaScript Framework #

FlowOff is a very simple but powerful MVC framework for building RIAs.

## Directory structure ##

Following examples will work with this directory structure:

	[domain root]
	 |- css/
	 |- images/
	 |- js/
	 |	 |- app/
	 |	 |	 |- controllers/
	 |	 |	 |- lang/
	 |	 |	 |- models/
	 |	 |	 `- migrations.js
	 |	 |- lib/
	 |	 |	 |- flowoff/
	 |	 |	 |	 |- lib/
	 |	 |	 |	 |- src/
	 |	 |	 |	 	 |- modules/
	 |	 |	 |	 	 `- flowoff.js
	 |	 |	 |- prototype/
	 |	 |	 |	 `- prototype.js
	 |	 |	 `- require.js
	 |	 `- boot.js
	 `- index.html

## Bootstrapping ##

There is no strict way to prepare the evnironment and run the app, but the following approach is recommended. The entire app is built using JavaScript; therefore, the initial markup (HTML) is extremely straightforward.

	// index.html:

	<!DOCTYPE html>
	<html>
	<head>
		<meta charset="UTF-8" />
		<title>FlowOff framework app</title>
		<script type="text/javascript" src="/js/lib/require.js"></script>
		<script type="text/javascript" src="/js/boot.js"></script>
	</head>
	<body>
		Loading...
	</body>
	</html>

The boot sequence can be embedded in the HTML of course. In the example, an external script is loaded. It loads all required libraries and modules, configures the app, loads all app-specific files (controllers, models, lang) and starts the app.

	// app/boot.js:

	// A simple JavaScript file loading library is provided.
	require.ROOT = '/js/';
	// Currently, you have to manually require all modules.
	require.js(
		'lib/prototype/prototype.js',
		'lib/flowoff/src/flowoff.js',
		'lib/flowoff/lib/ejs/ejs.js',
		'lib/flowoff/lib/mongo2sql/mongo2sql.js',
		'lib/flowoff/src/modules/model.js',
		'lib/flowoff/src/modules/controller.js',
		'lib/flowoff/src/modules/component.js',
		'lib/flowoff/src/modules/form.js',
		function () {
			// Set paths
			app.set('root', '/');
			app.set('api_root', '/api/');

			// Set database info
			// (Web SQL Database will be used; it will eventually be possible to use IndexedDB as well.)
			app.set('db_name', 'desktop-app');
			app.set('db_size', 10 * 1024 * 1024);
			app.set('db_title', 'Školní sešit.cz');

			// Set up routes
			var router = app.getRouter();
			// Root route
			router.push('/', {
				'controller': 'default',
				'view': 'default'
			});
			// A general route
			router.push('/session', {
				'controller': 'session',
				'view': 'signin'
			});
			// Route with a parameter
			router.push('/user/:username', {
				'controller': 'user',
				'view': 'default',
				'params': {
					// RegExp parameter filter
					'username': /^[a-z0-9][\w\-\.]*$/i
				}
			});
			// Route with a numeric parameter and expected (optional) query string parameter (compare_with)
			router.push('/user/:id', {
				'controller': 'book',
				'view': 'default',
				'params': {
					'id': router.PARAM_HEX,
					'compare_with': /^[a-f0-9;]*$/i
				}
			});
			// Routes with wildcard parameters; recommended
			router.push('/:_c', {
				'controller': ':_c',
				'view': 'default',
				'params': /^[a-z][a-z0-9\-]+$/
			});
			router.push('/:_c/:_v', {
				'controller': ':_c',
				'view': ':_v',
				'params': /^[a-z][a-z0-9\-]+$/
			});

			// Load app-specific files and run the app afterwards
			// (It is recommended to load the files in this order: migration file, models, controllers, lang file)
			require(
				'app/migrations.js',
				'app/models/user.js',
				'app/controllers/default.js',
				'app/controllers/user.js',
				'app/lang/en.js',

				function () {
					// Run the app when everything is loaded
					app.run();
				}
			);
		}
	);

## Migration file ##

If you provide the framework with database info, it will try to connect to the (in-browser client-side) Web SQL database. The database scheme is controlled with a so-called migration file in which are defined database migrations (sequence of SQL queries to be executed).

	// app/migrations.js:

	var migrations = app._migrations = [];

	migrations.push([
		"CREATE TABLE [users] ( [_id], [users__username], [users__realname], [date__created] )"
	]);
	migrations.push([
		"ALTER TABLE [users] ADD COLUMN [facebook__id]"
	]);

The framework knows, which migration was executed last. Therefore, you can be sure that when you push a new migration at any point in the future, the database scheme will always be correct.

> Note that you can never delete a published migration from this file! Your application would break down in most cases.

If you push a migration with an error in it, you database will not get corrupted because each transaction is executed as a transaction. Therefore, if a single query in the migration fails, the whole migration is rolled back and the application throws an exception and exits. You can fix the migration and safely publish the change. (Don't make changes to previously executed migrations; create a new migration instead. This approach is known from RoR app development.)

## Controllers ##

	// app/controllers/default.js

	app.registerController('default', Class.create(Controller, {

		// Startup method - called when the app starts
		// Note that only one controller#startup will be called. This usually contains a sequence to build the app UI layout and determine the current user.
		// It is recommended that there is an abstract controller defined from which all other controllers inherit this method.
		'startup': function (params) {
			
			var layout = app.component('layout', {
				'title': 'Example FlowOff App'
			});
			document.body.update();
			document.body.insert(layout.render());

			window.layout = layout;

		},
		
		// define a view
		'default': function (params) {
					
			var content = app.component('content');

			var box = app.component('content.box', {
				'data': 'Lorem ipsum'
			});
			content.attach('boxes', box);
			
			var box = app.component('content.box', {
				'data': 'Dolor sit amet'
			});
			content.attach('boxes', box);

			window.layout.replace('content', content);

		}
	
	}));

	
	// define components
	// (Globally needed components should be defined in the abstract controller file mentioned before.)
	app.registerComponent('layout', Class.create(Component, {
	
		'_template': '<div id="layout">' +
			'<div id="header"><%= title %></div>' +
			'<div id="content" components="content"></div>' +
		'</div>'

	}));

	app.registerComponent('content', Class.create(Component, {

		'_template': '<div id="content" components="boxes"></div>'

	}));

	app.registerComponent('content.box', Class.create(Component, {

		'_template': '<div class="box"><%= data %></div>'

	}));

## Components (UI) ##

Component is any logical part of the application UI. It can be the whole layout, a breadcrumb, list, list item, flash message or anything else.

Components are defined within controller files and registered via `app.registerComponent`. It takes two arguments -- `key` under which will the component be instantiable using `app.component` (as shown above in the controller) and the component class.

Each component has its markup stored in its `_template` property. The markup can contain Embedded JavaScript (see [EmbeddedJS](http://embeddedjs.com)). The object passed to `app.component` as the second arguments is distributed to the template.

Components are meant to be structured in a tree using the `component#attach` method.

	app.registerComponent('list', Class.create(Component, {
		'_template': '<ul components="items"></ul>',

		'afterRender': function () {
			console.log('Rendered a list')
		}
	}));

	app.registerComponent('list.item', Class.create(Component, {
		'_template': '<li>' +
			'<% if (typeof link != "undefined") { %>' +
			'<a href="<%= link %>"><%= label %></a>' +
			'<% } else { %>' +
			'<%= label %>' +
		'</li>',

		'afterRender': function () {
			console.log('Rendered an item')
		}
	}));


	// Let's say we have the layout component from the above example code stored in window.layout.

	var list = app.component('list');

	var item = app.component('list.item', {
		'label': 'Item 1'
	});
	list.attach('items', item); // 'items' is a placeholder string from the list's template

	var item = app.component('list.item', {
		'label': 'Item 2',
		'link': 'http://jankuca.com'
	});
	list.attach('items', item);

	window.layout.replace('content', list);

	
	// This code would put the following HTML to the layout.

	<ul components="items"> // The components attribute is preserved so that we can eventually rerender the section.
		<li>Item 1</li>
		<li><a href="http://jankuca.com">Item 2</a></li>
	</ul>

	// ...and output the following in the console:

	Rendered an item
	Rendered an item
	Rendered a list

## Models ##

Models are currently under heavy development. A lot of features are missing.

Each model definition is created using the model factory accessible via the `app.registerModel` method.

	window.User = app.registerModel('User', 'users', {

		// define the model scheme
		// Each field has to be namespaced (NS:KEY, or :KEY with an empty namespace).
		'fields': ['users:username', 'users:realname', 'date:created'],

		// define a model-specific method
		'getFriends': function (callback) {
			var selector = {};
			// Get all users from the database other than the one this model instance represents.
			selector._id = { $ne: this.getId() };

			User.all(selector, callback);
		}
	
	});

	
	// Usage in a controller:

	User.one({ '_id': '...' }, function (user) {
		if (!user.exists()) {
			alert('No such user!');
			return;
		}

		alert('Viewing the user ' + user['users:realname']);
	});

More info will be provided later.