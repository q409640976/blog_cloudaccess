jQuery(document).ready(function($){
(function( $, wp, settings ) {
	var $document = $( document );

	wp = wp || {};

	/**
	 * The WP Updates object.
	 *
	 * @since 4.2.0
	 *
	 * @type {object}
	 */
	wp.updates = {};

	/**
	 * User nonce for ajax calls.
	 *
	 * @since 4.2.0
	 *
	 * @type {string}
	 */
	wp.updates.ajaxNonce = window._wpUpdatesSettings.ajax_nonce;

	/**
	 * Localized strings.
	 *
	 * @since 4.2.0
	 *
	 * @type {object}
	 */
	wp.updates.l10n = window._wpUpdatesSettings.l10n;

	/**
	 * Current search term.
	 *
	 * @since 4.6.0
	 *
	 * @type {string}
	 */
	wp.updates.searchTerm = '';

	/**
	 * Whether filesystem credentials need to be requested from the user.
	 *
	 * @since 4.2.0
	 *
	 * @type {bool}
	 */
	wp.updates.shouldRequestFilesystemCredentials = false;

	/**
	 * Filesystem credentials to be packaged along with the request.
	 *
	 * @since 4.2.0
	 * @since 4.6.0 Added `available` property to indicate whether credentials have been provided.
	 *
	 * @type {object} filesystemCredentials                    Holds filesystem credentials.
	 * @type {object} filesystemCredentials.ftp                Holds FTP credentials.
	 * @type {string} filesystemCredentials.ftp.host           FTP host. Default empty string.
	 * @type {string} filesystemCredentials.ftp.username       FTP user name. Default empty string.
	 * @type {string} filesystemCredentials.ftp.password       FTP password. Default empty string.
	 * @type {string} filesystemCredentials.ftp.connectionType Type of FTP connection. 'ssh', 'ftp', or 'ftps'.
	 *                                                         Default empty string.
	 * @type {object} filesystemCredentials.ssh                Holds SSH credentials.
	 * @type {string} filesystemCredentials.ssh.publicKey      The public key. Default empty string.
	 * @type {string} filesystemCredentials.ssh.privateKey     The private key. Default empty string.
	 * @type {string} filesystemCredentials.fsNonce            Filesystem credentials form nonce.
	 * @type {bool}   filesystemCredentials.available          Whether filesystem credentials have been provided.
	 *                                                         Default 'false'.
	 */
	wp.updates.filesystemCredentials = {
		ftp:       {
			host:           '',
			username:       '',
			password:       '',
			connectionType: ''
		},
		ssh:       {
			publicKey:  '',
			privateKey: ''
		},
		fsNonce: '',
		available: false
	};

	/**
	 * Whether we're waiting for an Ajax request to complete.
	 *
	 * @since 4.2.0
	 * @since 4.6.0 More accurately named `ajaxLocked`.
	 *
	 * @type {bool}
	 */
	wp.updates.ajaxLocked = false;

	/**
	 * Admin notice template.
	 *
	 * @since 4.6.0
	 *
	 * @type {function} A function that lazily-compiles the template requested.
	 */
	wp.updates.adminNotice = wp.template( 'wp-updates-admin-notice' );

	/**
	 * Update queue.
	 *
	 * If the user tries to update a plugin while an update is
	 * already happening, it can be placed in this queue to perform later.
	 *
	 * @since 4.2.0
	 * @since 4.6.0 More accurately named `queue`.
	 *
	 * @type {Array.object}
	 */
	wp.updates.queue = [];

	/**
	 * Holds a jQuery reference to return focus to when exiting the request credentials modal.
	 *
	 * @since 4.2.0
	 *
	 * @type {jQuery}
	 */
	wp.updates.$elToReturnFocusToFromCredentialsModal = undefined;

	/**
	 * Adds or updates an admin notice.
	 *
	 * @since 4.6.0
	 *
	 * @param {object}  data
	 * @param {*=}      data.selector      Optional. Selector of an element to be replaced with the admin notice.
	 * @param {string=} data.id            Optional. Unique id that will be used as the notice's id attribute.
	 * @param {string=} data.className     Optional. Class names that will be used in the admin notice.
	 * @param {string=} data.message       Optional. The message displayed in the notice.
	 * @param {number=} data.successes     Optional. The amount of successful operations.
	 * @param {number=} data.errors        Optional. The amount of failed operations.
	 * @param {Array=}  data.errorMessages Optional. Error messages of failed operations.
	 *
	 */
	wp.updates.addAdminNotice = function( data ) {
		debugger;
		var $notice = $( data.selector ), $adminNotice;

		delete data.selector;
		$adminNotice = wp.updates.adminNotice( data );

		// Check if this admin notice already exists.
		if ( ! $notice.length ) {
			$notice = $( '#' + data.id );
		}

		if ( $notice.length ) {
			$notice.replaceWith( $adminNotice );
		} else {
			$( '.wrap' ).find( '> h1' ).after( $adminNotice );
		}

		$document.trigger( 'wp-updates-notice-added' );
	};

	/**
	 * Handles Ajax requests to WordPress.
	 *
	 * @since 4.6.0
	 *
	 * @param {string} action The type of Ajax request ('update-plugin', 'install-theme', etc).
	 * @param {object} data   Data that needs to be passed to the ajax callback.
	 * @return {$.promise}    A jQuery promise that represents the request,
	 *                        decorated with an abort() method.
	 */
	wp.updates.ajax = function( action, data ) {
		debugger;
		var options = {};

		if ( wp.updates.ajaxLocked ) {
			wp.updates.queue.push( {
				action: action,
				data:   data
			} );

			// Return a Deferred object so callbacks can always be registered.
			return $.Deferred();
		}

		wp.updates.ajaxLocked = true;

		if ( data.success ) {
			options.success = data.success;
			delete data.success;
		}

		if ( data.error ) {
			options.error = data.error;
			delete data.error;
		}

		options.data = _.extend( data, {
			action:          action,
			_ajax_nonce:     wp.updates.ajaxNonce,
			_fs_nonce:       wp.updates.filesystemCredentials.fsNonce,
			username:        wp.updates.filesystemCredentials.ftp.username,
			password:        wp.updates.filesystemCredentials.ftp.password,
			hostname:        wp.updates.filesystemCredentials.ftp.hostname,
			connection_type: wp.updates.filesystemCredentials.ftp.connectionType,
			public_key:      wp.updates.filesystemCredentials.ssh.publicKey,
			private_key:     wp.updates.filesystemCredentials.ssh.privateKey
		} );

		return wp.ajax.send( options ).always( wp.updates.ajaxAlways );
	};

	/**
	 * Actions performed after every Ajax request.
	 *
	 * @since 4.6.0
	 *
	 * @param {object}  response
	 * @param {array=}  response.debug     Optional. Debug information.
	 * @param {string=} response.errorCode Optional. Error code for an error that occurred.
	 */
	wp.updates.ajaxAlways = function( response ) {
		debugger;
		if ( ! response.errorCode || 'unable_to_connect_to_filesystem' !== response.errorCode ) {
			wp.updates.ajaxLocked = false;
			wp.updates.queueChecker();
		}

		if ( 'undefined' !== typeof response.debug && window.console && window.console.log ) {
			_.map( response.debug, function( message ) {
				window.console.log( $( '<p />' ).html( message ).text() );
			} );
		}
	};

	/**
	 * Refreshes update counts everywhere on the screen.
	 *
	 * @since 4.7.0
	 */
	wp.updates.refreshCount = function() {
		debugger;
		var $adminBarUpdates              = $( '#wp-admin-bar-updates' ),
			$dashboardNavMenuUpdateCount  = $( 'a[href="update-core.php"] .update-plugins' ),
			$pluginsNavMenuUpdateCount    = $( 'a[href="plugins.php"] .update-plugins' ),
			$appearanceNavMenuUpdateCount = $( 'a[href="themes.php"] .update-plugins' ),
			itemCount;

		$adminBarUpdates.find( '.ab-item' ).removeAttr( 'title' );
		$adminBarUpdates.find( '.ab-label' ).text( settings.totals.counts.total );

		// Remove the update count from the toolbar if it's zero.
		if ( 0 === settings.totals.counts.total ) {
			$adminBarUpdates.find( '.ab-label' ).parents( 'li' ).remove();
		}

		// Update the "Updates" menu item.
		$dashboardNavMenuUpdateCount.each( function( index, element ) {
			element.className = element.className.replace( /count-\d+/, 'count-' + settings.totals.counts.total );
		} );
		if ( settings.totals.counts.total > 0 ) {
			$dashboardNavMenuUpdateCount.find( '.update-count' ).text( settings.totals.counts.total );
		} else {
			$dashboardNavMenuUpdateCount.remove();
		}

		// Update the "Plugins" menu item.
		$pluginsNavMenuUpdateCount.each( function( index, element ) {
			element.className = element.className.replace( /count-\d+/, 'count-' + settings.totals.counts.plugins );
		} );
		if ( settings.totals.counts.total > 0 ) {
			$pluginsNavMenuUpdateCount.find( '.plugin-count' ).text( settings.totals.counts.plugins );
		} else {
			$pluginsNavMenuUpdateCount.remove();
		}

		// Update the "Appearance" menu item.
		$appearanceNavMenuUpdateCount.each( function( index, element ) {
			element.className = element.className.replace( /count-\d+/, 'count-' + settings.totals.counts.themes );
		} );
		if ( settings.totals.counts.total > 0 ) {
			$appearanceNavMenuUpdateCount.find( '.theme-count' ).text( settings.totals.counts.themes );
		} else {
			$appearanceNavMenuUpdateCount.remove();
		}

		// Update list table filter navigation.
		if ( 'plugins' === pagenow || 'plugins-network' === pagenow ) {
			itemCount = settings.totals.counts.plugins;
		} else if ( 'themes' === pagenow || 'themes-network' === pagenow ) {
			itemCount = settings.totals.counts.themes;
		}

		if ( itemCount > 0 ) {
			$( '.subsubsub .upgrade .count' ).text( '(' + itemCount + ')' );
		} else {
			$( '.subsubsub .upgrade' ).remove();
			$( '.subsubsub li:last' ).html( function() { return $( this ).children(); } );
		}
	};

	/**
	 * Decrements the update counts throughout the various menus.
	 *
	 * This includes the toolbar, the "Updates" menu item and the menu items
	 * for plugins and themes.
	 *
	 * @since 3.9.0
	 *
	 * @param {string} type The type of item that was updated or deleted.
	 *                      Can be 'plugin', 'theme'.
	 */
	wp.updates.decrementCount = function( type ) {
		debugger;
		settings.totals.counts.total = Math.max( --settings.totals.counts.total, 0 );

		if ( 'plugin' === type ) {
			settings.totals.counts.plugins = Math.max( --settings.totals.counts.plugins, 0 );
		} else if ( 'theme' === type ) {
			settings.totals.counts.themes = Math.max( --settings.totals.counts.themes, 0 );
		}

		wp.updates.refreshCount( type );
	};

	/**
	 * Sends an Ajax request to the server to update a plugin.
	 *
	 * @since 4.2.0
	 * @since 4.6.0 More accurately named `updatePlugin`.
	 *
	 * @param {object}               args         Arguments.
	 * @param {string}               args.plugin  Plugin basename.
	 * @param {string}               args.slug    Plugin slug.
	 * @param {updatePluginSuccess=} args.success Optional. Success callback. Default: wp.updates.updatePluginSuccess
	 * @param {updatePluginError=}   args.error   Optional. Error callback. Default: wp.updates.updatePluginError
	 * @return {$.promise} A jQuery promise that represents the request,
	 *                     decorated with an abort() method.
	 */
	wp.updates.updatePlugin = function( args ) {
		debugger;
		var $updateRow, $card, $message, message;

		args = _.extend( {
			success: wp.updates.updatePluginSuccess,
			error: wp.updates.updatePluginError
		}, args );

		if ( 'plugins' === pagenow || 'plugins-network' === pagenow || pagenow === 'plugins_page_wpemaddons' ) {
			$updateRow = $( 'tr[data-plugin="' + args.plugin + '"]' );
			$message   = $updateRow.find( '.update-message' ).removeClass( 'notice-error' ).addClass( 'updating-message notice-warning' ).find( 'p' );
			message    = wp.updates.l10n.pluginUpdatingLabel.replace( '%s', $updateRow.find( '.plugin-title strong' ).text() );
		} else if ( 'plugin-install' === pagenow || 'plugin-install-network' === pagenow ) {
			$card    = $( '.plugin-card-' + args.slug );
			$message = $card.find( '.update-now' ).addClass( 'updating-message' );
			message  = wp.updates.l10n.pluginUpdatingLabel.replace( '%s', $message.data( 'name' ) );

			// Remove previous error messages, if any.
			$card.removeClass( 'plugin-card-update-failed' ).find( '.notice.notice-error' ).remove();
		}

		if ( $message.html() !== wp.updates.l10n.updating ) {
			$message.data( 'originaltext', $message.html() );
		}

		$message
			.attr( 'aria-label', message )
			.text( wp.updates.l10n.updating );

		$document.trigger( 'wp-plugin-updating', args );

		return wp.updates.ajax( 'update-plugin', args );
	};

	/**
	 * Updates the UI appropriately after a successful plugin update.
	 *
	 * @since 4.2.0
	 * @since 4.6.0 More accurately named `updatePluginSuccess`.
	 *
	 * @typedef {object} updatePluginSuccess
	 * @param {object} response            Response from the server.
	 * @param {string} response.slug       Slug of the plugin to be updated.
	 * @param {string} response.plugin     Basename of the plugin to be updated.
	 * @param {string} response.pluginName Name of the plugin to be updated.
	 * @param {string} response.oldVersion Old version of the plugin.
	 * @param {string} response.newVersion New version of the plugin.
	 */
	wp.updates.updatePluginSuccess = function( response ) {
		debugger;
		var $pluginRow, $updateMessage, newText;

		if ( 'plugins' === pagenow || 'plugins-network' === pagenow || pagenow === 'plugins_page_wpemaddons') {
			$pluginRow     = $( 'tr[data-plugin="' + response.plugin + '"]' )
				.removeClass( 'update' )
				.addClass( 'updated' );
			$updateMessage = $pluginRow.find( '.update-message' )
				.removeClass( 'updating-message notice-warning' )
				.addClass( 'updated-message notice-success' ).find( 'p' );

			// Update the version number in the row.
			newText = $pluginRow.find( '.plugin-version-author-uri' ).html().replace( response.oldVersion, response.newVersion );
			$pluginRow.find( '.plugin-version-author-uri' ).html( newText );
		} else if ( 'plugin-install' === pagenow || 'plugin-install-network' === pagenow ) {
			$updateMessage = $( '.plugin-card-' + response.slug ).find( '.update-now' )
				.removeClass( 'updating-message' )
				.addClass( 'button-disabled updated-message' );
		}

		$updateMessage
			.attr( 'aria-label', wp.updates.l10n.pluginUpdatedLabel.replace( '%s', response.pluginName ) )
			.text( wp.updates.l10n.pluginUpdated );

		wp.a11y.speak( wp.updates.l10n.updatedMsg, 'polite' );

		wp.updates.decrementCount( 'plugin' );

		$document.trigger( 'wp-plugin-update-success', response );
	};

	/**
	 * Updates the UI appropriately after a failed plugin update.
	 *
	 * @since 4.2.0
	 * @since 4.6.0 More accurately named `updatePluginError`.
	 *
	 * @typedef {object} updatePluginError
	 * @param {object}  response              Response from the server.
	 * @param {string}  response.slug         Slug of the plugin to be updated.
	 * @param {string}  response.plugin       Basename of the plugin to be updated.
	 * @param {string=} response.pluginName   Optional. Name of the plugin to be updated.
	 * @param {string}  response.errorCode    Error code for the error that occurred.
	 * @param {string}  response.errorMessage The error that occurred.
	 */
	wp.updates.updatePluginError = function( response ) {
		debugger;
		var $card, $message, errorMessage;

		if ( ! wp.updates.isValidResponse( response, 'update' ) ) {
			return;
		}

		if ( wp.updates.maybeHandleCredentialError( response, 'update-plugin' ) ) {
			return;
		}

		errorMessage = wp.updates.l10n.updateFailed.replace( '%s', response.errorMessage );

		if ( 'plugins' === pagenow || 'plugins-network' === pagenow || pagenow === 'plugins_page_wpemaddons') {
			if ( response.plugin ) {
				$message = $( 'tr[data-plugin="' + response.plugin + '"]' ).find( '.update-message' );
			} else {
				$message = $( 'tr[data-slug="' + response.slug + '"]' ).find( '.update-message' );
			}
			$message.removeClass( 'updating-message notice-warning' ).addClass( 'notice-error' ).find( 'p' ).html( errorMessage );

			if ( response.pluginName ) {
				$message.find( 'p' )
					.attr( 'aria-label', wp.updates.l10n.pluginUpdateFailedLabel.replace( '%s', response.pluginName ) );
			} else {
				$message.find( 'p' ).removeAttr( 'aria-label' );
			}
		} else if ( 'plugin-install' === pagenow || 'plugin-install-network' === pagenow ) {
			$card = $( '.plugin-card-' + response.slug )
				.addClass( 'plugin-card-update-failed' )
				.append( wp.updates.adminNotice( {
					className: 'update-message notice-error notice-alt is-dismissible',
					message:   errorMessage
				} ) );

			$card.find( '.update-now' )
				.text( wp.updates.l10n.updateFailedShort ).removeClass( 'updating-message' );

			if ( response.pluginName ) {
				$card.find( '.update-now' )
					.attr( 'aria-label', wp.updates.l10n.pluginUpdateFailedLabel.replace( '%s', response.pluginName ) );
			} else {
				$card.find( '.update-now' ).removeAttr( 'aria-label' );
			}

			$card.on( 'click', '.notice.is-dismissible .notice-dismiss', function() {

				// Use same delay as the total duration of the notice fadeTo + slideUp animation.
				setTimeout( function() {
					$card
						.removeClass( 'plugin-card-update-failed' )
						.find( '.column-name a' ).focus();

					$card.find( '.update-now' )
						.attr( 'aria-label', false )
						.text( wp.updates.l10n.updateNow );
				}, 200 );
			} );
		}

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-plugin-update-error', response );
	};

	/**
	 * Sends an Ajax request to the server to install a plugin.
	 *
	 * @since 4.6.0
	 *
	 * @param {object}                args         Arguments.
	 * @param {string}                args.slug    Plugin identifier in the WordPress.org Plugin repository.
	 * @param {installPluginSuccess=} args.success Optional. Success callback. Default: wp.updates.installPluginSuccess
	 * @param {installPluginError=}   args.error   Optional. Error callback. Default: wp.updates.installPluginError
	 * @return {$.promise} A jQuery promise that represents the request,
	 *                     decorated with an abort() method.
	 */
	wp.updates.installPlugin = function( args ) {
		debugger;
		var $card    = $( '.plugin-card-' + args.slug ),
			$message = $card.find( '.install-now' );

		args = _.extend( {
			success: wp.updates.installPluginSuccess,
			error: wp.updates.installPluginError
		}, args );

		if ( 'import' === pagenow ) {
			$message = $( '[data-slug="' + args.slug + '"]' );
		}

		if ( $message.html() !== wp.updates.l10n.installing ) {
			$message.data( 'originaltext', $message.html() );
		}

		$message
			.addClass( 'updating-message' )
			.attr( 'aria-label', wp.updates.l10n.pluginInstallingLabel.replace( '%s', $message.data( 'name' ) ) )
			.text( wp.updates.l10n.installing );

		wp.a11y.speak( wp.updates.l10n.installingMsg, 'polite' );

		// Remove previous error messages, if any.
		$card.removeClass( 'plugin-card-install-failed' ).find( '.notice.notice-error' ).remove();

		$document.trigger( 'wp-plugin-installing', args );

		return wp.updates.ajax( 'install-plugin', args );
	};

	/**
	 * Updates the UI appropriately after a successful plugin install.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} installPluginSuccess
	 * @param {object} response             Response from the server.
	 * @param {string} response.slug        Slug of the installed plugin.
	 * @param {string} response.pluginName  Name of the installed plugin.
	 * @param {string} response.activateUrl URL to activate the just installed plugin.
	 */
	wp.updates.installPluginSuccess = function( response ) {
		debugger;
		var $message = $( '.plugin-card-' + response.slug ).find( '.install-now' );

		$message
			.removeClass( 'updating-message' )
			.addClass( 'updated-message installed button-disabled' )
			.attr( 'aria-label', wp.updates.l10n.pluginInstalledLabel.replace( '%s', response.pluginName ) )
			.text( wp.updates.l10n.pluginInstalled );

		wp.a11y.speak( wp.updates.l10n.installedMsg, 'polite' );

		$document.trigger( 'wp-plugin-install-success', response );

		if ( response.activateUrl ) {
			setTimeout( function() {

				// Transform the 'Install' button into an 'Activate' button.
				$message.removeClass( 'install-now installed button-disabled updated-message' ).addClass( 'activate-now button-primary' )
					.attr( 'href', response.activateUrl )
					.attr( 'aria-label', wp.updates.l10n.activatePluginLabel.replace( '%s', response.pluginName ) )
					.text( wp.updates.l10n.activatePlugin );
			}, 1000 );
		}
	};

	/**
	 * Updates the UI appropriately after a failed plugin install.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} installPluginError
	 * @param {object}  response              Response from the server.
	 * @param {string}  response.slug         Slug of the plugin to be installed.
	 * @param {string=} response.pluginName   Optional. Name of the plugin to be installed.
	 * @param {string}  response.errorCode    Error code for the error that occurred.
	 * @param {string}  response.errorMessage The error that occurred.
	 */
	wp.updates.installPluginError = function( response ) {
		debugger;
		var $card   = $( '.plugin-card-' + response.slug ),
			$button = $card.find( '.install-now' ),
			errorMessage;

		if ( ! wp.updates.isValidResponse( response, 'install' ) ) {
			return;
		}

		if ( wp.updates.maybeHandleCredentialError( response, 'install-plugin' ) ) {
			return;
		}

		errorMessage = wp.updates.l10n.installFailed.replace( '%s', response.errorMessage );

		$card
			.addClass( 'plugin-card-update-failed' )
			.append( '<div class="notice notice-error notice-alt is-dismissible"><p>' + errorMessage + '</p></div>' );

		$card.on( 'click', '.notice.is-dismissible .notice-dismiss', function() {

			// Use same delay as the total duration of the notice fadeTo + slideUp animation.
			setTimeout( function() {
				$card
					.removeClass( 'plugin-card-update-failed' )
					.find( '.column-name a' ).focus();
			}, 200 );
		} );

		$button
			.removeClass( 'updating-message' ).addClass( 'button-disabled' )
			.attr( 'aria-label', wp.updates.l10n.pluginInstallFailedLabel.replace( '%s', $button.data( 'name' ) ) )
			.text( wp.updates.l10n.installFailedShort );

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-plugin-install-error', response );
	};

	/**
	 * Updates the UI appropriately after a successful importer install.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} installImporterSuccess
	 * @param {object} response             Response from the server.
	 * @param {string} response.slug        Slug of the installed plugin.
	 * @param {string} response.pluginName  Name of the installed plugin.
	 * @param {string} response.activateUrl URL to activate the just installed plugin.
	 */
	wp.updates.installImporterSuccess = function( response ) {
		debugger;
		wp.updates.addAdminNotice( {
			id:        'install-success',
			className: 'notice-success is-dismissible',
			message:   wp.updates.l10n.importerInstalledMsg.replace( '%s', response.activateUrl + '&from=import' )
		} );

		$( '[data-slug="' + response.slug + '"]' )
			.removeClass( 'install-now updating-message' )
			.addClass( 'activate-now' )
			.attr({
				'href': response.activateUrl + '&from=import',
				'aria-label': wp.updates.l10n.activateImporterLabel.replace( '%s', response.pluginName )
			})
			.text( wp.updates.l10n.activateImporter );

		wp.a11y.speak( wp.updates.l10n.installedMsg, 'polite' );

		$document.trigger( 'wp-importer-install-success', response );
	};

	/**
	 * Updates the UI appropriately after a failed importer install.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} installImporterError
	 * @param {object}  response              Response from the server.
	 * @param {string}  response.slug         Slug of the plugin to be installed.
	 * @param {string=} response.pluginName   Optional. Name of the plugin to be installed.
	 * @param {string}  response.errorCode    Error code for the error that occurred.
	 * @param {string}  response.errorMessage The error that occurred.
	 */
	wp.updates.installImporterError = function( response ) {
		debugger;
		var errorMessage = wp.updates.l10n.installFailed.replace( '%s', response.errorMessage ),
			$installLink = $( '[data-slug="' + response.slug + '"]' ),
			pluginName = $installLink.data( 'name' );

		if ( ! wp.updates.isValidResponse( response, 'install' ) ) {
			return;
		}

		if ( wp.updates.maybeHandleCredentialError( response, 'install-plugin' ) ) {
			return;
		}

		wp.updates.addAdminNotice( {
			id:        response.errorCode,
			className: 'notice-error is-dismissible',
			message:   errorMessage
		} );

		$installLink
			.removeClass( 'updating-message' )
			.text( wp.updates.l10n.installNow )
			.attr( 'aria-label', wp.updates.l10n.installNowLabel.replace( '%s', pluginName ) );

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-importer-install-error', response );
	};

	/**
	 * Sends an Ajax request to the server to delete a plugin.
	 *
	 * @since 4.6.0
	 *
	 * @param {object}               args         Arguments.
	 * @param {string}               args.plugin  Basename of the plugin to be deleted.
	 * @param {string}               args.slug    Slug of the plugin to be deleted.
	 * @param {deletePluginSuccess=} args.success Optional. Success callback. Default: wp.updates.deletePluginSuccess
	 * @param {deletePluginError=}   args.error   Optional. Error callback. Default: wp.updates.deletePluginError
	 * @return {$.promise} A jQuery promise that represents the request,
	 *                     decorated with an abort() method.
	 */
	wp.updates.deletePlugin = function( args ) {
		debugger;
		var $link = $( '[data-plugin="' + args.plugin + '"]' ).find( '.row-actions a.delete' );

		args = _.extend( {
			success: wp.updates.deletePluginSuccess,
			error: wp.updates.deletePluginError
		}, args );

		if ( $link.html() !== wp.updates.l10n.deleting ) {
			$link
				.data( 'originaltext', $link.html() )
				.text( wp.updates.l10n.deleting );
		}

		wp.a11y.speak( wp.updates.l10n.deleting, 'polite' );

		$document.trigger( 'wp-plugin-deleting', args );

		return wp.updates.ajax( 'delete-plugin', args );
	};

	/**
	 * Updates the UI appropriately after a successful plugin deletion.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} deletePluginSuccess
	 * @param {object} response            Response from the server.
	 * @param {string} response.slug       Slug of the plugin that was deleted.
	 * @param {string} response.plugin     Base name of the plugin that was deleted.
	 * @param {string} response.pluginName Name of the plugin that was deleted.
	 */
	wp.updates.deletePluginSuccess = function( response ) {
		debugger;
		// Removes the plugin and updates rows.
		$( '[data-plugin="' + response.plugin + '"]' ).css( { backgroundColor: '#faafaa' } ).fadeOut( 350, function() {
			var $form            = $( '#bulk-action-form' ),
				$views           = $( '.subsubsub' ),
				$pluginRow       = $( this ),
				columnCount      = $form.find( 'thead th:not(.hidden), thead td' ).length,
				pluginDeletedRow = wp.template( 'item-deleted-row' ),
				/** @type {object} plugins Base names of plugins in their different states. */
				plugins          = settings.plugins;

			// Add a success message after deleting a plugin.
			if ( ! $pluginRow.hasClass( 'plugin-update-tr' ) ) {
				$pluginRow.after(
					pluginDeletedRow( {
						slug:    response.slug,
						plugin:  response.plugin,
						colspan: columnCount,
						name:    response.pluginName
					} )
				);
			}

			$pluginRow.remove();

			// Remove plugin from update count.
			if ( -1 !== _.indexOf( plugins.upgrade, response.plugin ) ) {
				plugins.upgrade = _.without( plugins.upgrade, response.plugin );
				wp.updates.decrementCount( 'plugin' );
			}

			// Remove from views.
			if ( -1 !== _.indexOf( plugins.inactive, response.plugin ) ) {
				plugins.inactive = _.without( plugins.inactive, response.plugin );
				if ( plugins.inactive.length ) {
					$views.find( '.inactive .count' ).text( '(' + plugins.inactive.length + ')' );
				} else {
					$views.find( '.inactive' ).remove();
				}
			}

			if ( -1 !== _.indexOf( plugins.active, response.plugin ) ) {
				plugins.active = _.without( plugins.active, response.plugin );
				if ( plugins.active.length ) {
					$views.find( '.active .count' ).text( '(' + plugins.active.length + ')' );
				} else {
					$views.find( '.active' ).remove();
				}
			}

			if ( -1 !== _.indexOf( plugins.recently_activated, response.plugin ) ) {
				plugins.recently_activated = _.without( plugins.recently_activated, response.plugin );
				if ( plugins.recently_activated.length ) {
					$views.find( '.recently_activated .count' ).text( '(' + plugins.recently_activated.length + ')' );
				} else {
					$views.find( '.recently_activated' ).remove();
				}
			}

			plugins.all = _.without( plugins.all, response.plugin );

			if ( plugins.all.length ) {
				$views.find( '.all .count' ).text( '(' + plugins.all.length + ')' );
			} else {
				$form.find( '.tablenav' ).css( { visibility: 'hidden' } );
				$views.find( '.all' ).remove();

				if ( ! $form.find( 'tr.no-items' ).length ) {
					$form.find( '#the-list' ).append( '<tr class="no-items"><td class="colspanchange" colspan="' + columnCount + '">' + wp.updates.l10n.noPlugins + '</td></tr>' );
				}
			}
		} );

		wp.a11y.speak( wp.updates.l10n.pluginDeleted, 'polite' );

		$document.trigger( 'wp-plugin-delete-success', response );
	};

	/**
	 * Updates the UI appropriately after a failed plugin deletion.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} deletePluginError
	 * @param {object}  response              Response from the server.
	 * @param {string}  response.slug         Slug of the plugin to be deleted.
	 * @param {string}  response.plugin       Base name of the plugin to be deleted
	 * @param {string=} response.pluginName   Optional. Name of the plugin to be deleted.
	 * @param {string}  response.errorCode    Error code for the error that occurred.
	 * @param {string}  response.errorMessage The error that occurred.
	 */
	wp.updates.deletePluginError = function( response ) {
		debugger;
		var $plugin, $pluginUpdateRow,
			pluginUpdateRow  = wp.template( 'item-update-row' ),
			noticeContent    = wp.updates.adminNotice( {
				className: 'update-message notice-error notice-alt',
				message:   response.errorMessage
			} );

		if ( response.plugin ) {
			$plugin          = $( 'tr.inactive[data-plugin="' + response.plugin + '"]' );
			$pluginUpdateRow = $plugin.siblings( '[data-plugin="' + response.plugin + '"]' );
		} else {
			$plugin          = $( 'tr.inactive[data-slug="' + response.slug + '"]' );
			$pluginUpdateRow = $plugin.siblings( '[data-slug="' + response.slug + '"]' );
		}

		if ( ! wp.updates.isValidResponse( response, 'delete' ) ) {
			return;
		}

		if ( wp.updates.maybeHandleCredentialError( response, 'delete-plugin' ) ) {
			return;
		}

		// Add a plugin update row if it doesn't exist yet.
		if ( ! $pluginUpdateRow.length ) {
			$plugin.addClass( 'update' ).after(
				pluginUpdateRow( {
					slug:    response.slug,
					plugin:  response.plugin || response.slug,
					colspan: $( '#bulk-action-form' ).find( 'thead th:not(.hidden), thead td' ).length,
					content: noticeContent
				} )
			);
		} else {

			// Remove previous error messages, if any.
			$pluginUpdateRow.find( '.notice-error' ).remove();

			$pluginUpdateRow.find( '.plugin-update' ).append( noticeContent );
		}

		$document.trigger( 'wp-plugin-delete-error', response );
	};

	/**
	 * Sends an Ajax request to the server to update a theme.
	 *
	 * @since 4.6.0
	 *
	 * @param {object}              args         Arguments.
	 * @param {string}              args.slug    Theme stylesheet.
	 * @param {updateThemeSuccess=} args.success Optional. Success callback. Default: wp.updates.updateThemeSuccess
	 * @param {updateThemeError=}   args.error   Optional. Error callback. Default: wp.updates.updateThemeError
	 * @return {$.promise} A jQuery promise that represents the request,
	 *                     decorated with an abort() method.
	 */
	wp.updates.updateTheme = function( args ) {
		debugger;
		var $notice;

		args = _.extend( {
			success: wp.updates.updateThemeSuccess,
			error: wp.updates.updateThemeError
		}, args );

		if ( 'themes-network' === pagenow ) {
			$notice = $( '[data-slug="' + args.slug + '"]' ).find( '.update-message' ).removeClass( 'notice-error' ).addClass( 'updating-message notice-warning' ).find( 'p' );

		} else {
			$notice = $( '#update-theme' ).closest( '.notice' ).removeClass( 'notice-large' );

			$notice.find( 'h3' ).remove();

			$notice = $notice.add( $( '[data-slug="' + args.slug + '"]' ).find( '.update-message' ) );
			$notice = $notice.addClass( 'updating-message' ).find( 'p' );
		}

		if ( $notice.html() !== wp.updates.l10n.updating ) {
			$notice.data( 'originaltext', $notice.html() );
		}

		wp.a11y.speak( wp.updates.l10n.updatingMsg, 'polite' );
		$notice.text( wp.updates.l10n.updating );

		$document.trigger( 'wp-theme-updating', args );

		return wp.updates.ajax( 'update-theme', args );
	};

	/**
	 * Updates the UI appropriately after a successful theme update.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} updateThemeSuccess
	 * @param {object} response
	 * @param {string} response.slug       Slug of the theme to be updated.
	 * @param {object} response.theme      Updated theme.
	 * @param {string} response.oldVersion Old version of the theme.
	 * @param {string} response.newVersion New version of the theme.
	 */
	wp.updates.updateThemeSuccess = function( response ) {
		debugger;
		var isModalOpen    = $( 'body.modal-open' ).length,
			$theme         = $( '[data-slug="' + response.slug + '"]' ),
			updatedMessage = {
				className: 'updated-message notice-success notice-alt',
				message:   wp.updates.l10n.themeUpdated
			},
			$notice, newText;

		if ( 'themes-network' === pagenow ) {
			$notice = $theme.find( '.update-message' );

			// Update the version number in the row.
			newText = $theme.find( '.theme-version-author-uri' ).html().replace( response.oldVersion, response.newVersion );
			$theme.find( '.theme-version-author-uri' ).html( newText );
		} else {
			$notice = $( '.theme-info .notice' ).add( $theme.find( '.update-message' ) );

			// Focus on Customize button after updating.
			if ( isModalOpen ) {
				$( '.load-customize:visible' ).focus();
			} else {
				$theme.find( '.load-customize' ).focus();
			}
		}

		wp.updates.addAdminNotice( _.extend( { selector: $notice }, updatedMessage ) );
		wp.a11y.speak( wp.updates.l10n.updatedMsg, 'polite' );

		wp.updates.decrementCount( 'theme' );

		$document.trigger( 'wp-theme-update-success', response );

		// Show updated message after modal re-rendered.
		if ( isModalOpen ) {
			$( '.theme-info .theme-author' ).after( wp.updates.adminNotice( updatedMessage ) );
		}
	};

	/**
	 * Updates the UI appropriately after a failed theme update.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} updateThemeError
	 * @param {object} response              Response from the server.
	 * @param {string} response.slug         Slug of the theme to be updated.
	 * @param {string} response.errorCode    Error code for the error that occurred.
	 * @param {string} response.errorMessage The error that occurred.
	 */
	wp.updates.updateThemeError = function( response ) {
		debugger;
		var $theme       = $( '[data-slug="' + response.slug + '"]' ),
			errorMessage = wp.updates.l10n.updateFailed.replace( '%s', response.errorMessage ),
			$notice;

		if ( ! wp.updates.isValidResponse( response, 'update' ) ) {
			return;
		}

		if ( wp.updates.maybeHandleCredentialError( response, 'update-theme' ) ) {
			return;
		}

		if ( 'themes-network' === pagenow ) {
			$notice = $theme.find( '.update-message ' );
		} else {
			$notice = $( '.theme-info .notice' ).add( $theme.find( '.notice' ) );

			$( 'body.modal-open' ).length ? $( '.load-customize:visible' ).focus() : $theme.find( '.load-customize' ).focus();
		}

		wp.updates.addAdminNotice( {
			selector:  $notice,
			className: 'update-message notice-error notice-alt is-dismissible',
			message:   errorMessage
		} );

		wp.a11y.speak( errorMessage, 'polite' );

		$document.trigger( 'wp-theme-update-error', response );
	};

	/**
	 * Sends an Ajax request to the server to install a theme.
	 *
	 * @since 4.6.0
	 *
	 * @param {object}               args
	 * @param {string}               args.slug    Theme stylesheet.
	 * @param {installThemeSuccess=} args.success Optional. Success callback. Default: wp.updates.installThemeSuccess
	 * @param {installThemeError=}   args.error   Optional. Error callback. Default: wp.updates.installThemeError
	 * @return {$.promise} A jQuery promise that represents the request,
	 *                     decorated with an abort() method.
	 */
	wp.updates.installTheme = function( args ) {
		debugger;
		var $message = $( '.theme-install[data-slug="' + args.slug + '"]' );

		args = _.extend( {
			success: wp.updates.installThemeSuccess,
			error: wp.updates.installThemeError
		}, args );

		$message.addClass( 'updating-message' );
		$message.parents( '.theme' ).addClass( 'focus' );
		if ( $message.html() !== wp.updates.l10n.installing ) {
			$message.data( 'originaltext', $message.html() );
		}

		$message
			.text( wp.updates.l10n.installing )
			.attr( 'aria-label', wp.updates.l10n.themeInstallingLabel.replace( '%s', $message.data( 'name' ) ) );
		wp.a11y.speak( wp.updates.l10n.installingMsg, 'polite' );

		// Remove previous error messages, if any.
		$( '.install-theme-info, [data-slug="' + args.slug + '"]' ).removeClass( 'theme-install-failed' ).find( '.notice.notice-error' ).remove();

		$document.trigger( 'wp-theme-installing', args );

		return wp.updates.ajax( 'install-theme', args );
	};

	/**
	 * Updates the UI appropriately after a successful theme install.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} installThemeSuccess
	 * @param {object} response              Response from the server.
	 * @param {string} response.slug         Slug of the theme to be installed.
	 * @param {string} response.customizeUrl URL to the Customizer for the just installed theme.
	 * @param {string} response.activateUrl  URL to activate the just installed theme.
	 */
	wp.updates.installThemeSuccess = function( response ) {
		debugger;
		var $card = $( '.wp-full-overlay-header, [data-slug=' + response.slug + ']' ),
			$message;

		$document.trigger( 'wp-theme-install-success', response );

		$message = $card.find( '.button-primary' )
			.removeClass( 'updating-message' )
			.addClass( 'updated-message disabled' )
			.attr( 'aria-label', wp.updates.l10n.themeInstalledLabel.replace( '%s', response.themeName ) )
			.text( wp.updates.l10n.themeInstalled );

		wp.a11y.speak( wp.updates.l10n.installedMsg, 'polite' );

		setTimeout( function() {

			if ( response.activateUrl ) {

				// Transform the 'Install' button into an 'Activate' button.
				$message
					.attr( 'href', response.activateUrl )
					.removeClass( 'theme-install updated-message disabled' )
					.addClass( 'activate' )
					.attr( 'aria-label', wp.updates.l10n.activateThemeLabel.replace( '%s', response.themeName ) )
					.text( wp.updates.l10n.activateTheme );
			}

			if ( response.customizeUrl ) {

				// Transform the 'Preview' button into a 'Live Preview' button.
				$message.siblings( '.preview' ).replaceWith( function () {
					return $( '<a>' )
						.attr( 'href', response.customizeUrl )
						.addClass( 'button load-customize' )
						.text( wp.updates.l10n.livePreview );
				} );
			}
		}, 1000 );
	};

	/**
	 * Updates the UI appropriately after a failed theme install.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} installThemeError
	 * @param {object} response              Response from the server.
	 * @param {string} response.slug         Slug of the theme to be installed.
	 * @param {string} response.errorCode    Error code for the error that occurred.
	 * @param {string} response.errorMessage The error that occurred.
	 */
	wp.updates.installThemeError = function( response ) {
		debugger;
		var $card, $button,
			errorMessage = wp.updates.l10n.installFailed.replace( '%s', response.errorMessage ),
			$message     = wp.updates.adminNotice( {
				className: 'update-message notice-error notice-alt',
				message:   errorMessage
			} );

		if ( ! wp.updates.isValidResponse( response, 'install' ) ) {
			return;
		}

		if ( wp.updates.maybeHandleCredentialError( response, 'install-theme' ) ) {
			return;
		}

		if ( $document.find( 'body' ).hasClass( 'full-overlay-active' ) ) {
			$button = $( '.theme-install[data-slug="' + response.slug + '"]' );
			$card   = $( '.install-theme-info' ).prepend( $message );
		} else {
			$card   = $( '[data-slug="' + response.slug + '"]' ).removeClass( 'focus' ).addClass( 'theme-install-failed' ).append( $message );
			$button = $card.find( '.theme-install' );
		}

		$button
			.removeClass( 'updating-message' )
			.attr( 'aria-label', wp.updates.l10n.themeInstallFailedLabel.replace( '%s', $button.data( 'name' ) ) )
			.text( wp.updates.l10n.installFailedShort );

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-theme-install-error', response );
	};

	/**
	 * Sends an Ajax request to the server to delete a theme.
	 *
	 * @since 4.6.0
	 *
	 * @param {object}              args
	 * @param {string}              args.slug    Theme stylesheet.
	 * @param {deleteThemeSuccess=} args.success Optional. Success callback. Default: wp.updates.deleteThemeSuccess
	 * @param {deleteThemeError=}   args.error   Optional. Error callback. Default: wp.updates.deleteThemeError
	 * @return {$.promise} A jQuery promise that represents the request,
	 *                     decorated with an abort() method.
	 */
	wp.updates.deleteTheme = function( args ) {
		debugger;
		var $button;

		if ( 'themes' === pagenow ) {
			$button = $( '.theme-actions .delete-theme' );
		} else if ( 'themes-network' === pagenow ) {
			$button = $( '[data-slug="' + args.slug + '"]' ).find( '.row-actions a.delete' );
		}

		args = _.extend( {
			success: wp.updates.deleteThemeSuccess,
			error: wp.updates.deleteThemeError
		}, args );

		if ( $button && $button.html() !== wp.updates.l10n.deleting ) {
			$button
				.data( 'originaltext', $button.html() )
				.text( wp.updates.l10n.deleting );
		}

		wp.a11y.speak( wp.updates.l10n.deleting, 'polite' );

		// Remove previous error messages, if any.
		$( '.theme-info .update-message' ).remove();

		$document.trigger( 'wp-theme-deleting', args );

		return wp.updates.ajax( 'delete-theme', args );
	};

	/**
	 * Updates the UI appropriately after a successful theme deletion.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} deleteThemeSuccess
	 * @param {object} response      Response from the server.
	 * @param {string} response.slug Slug of the theme that was deleted.
	 */
	wp.updates.deleteThemeSuccess = function( response ) {
		debugger;
		var $themeRows = $( '[data-slug="' + response.slug + '"]' );

		if ( 'themes-network' === pagenow ) {

			// Removes the theme and updates rows.
			$themeRows.css( { backgroundColor: '#faafaa' } ).fadeOut( 350, function() {
				var $views     = $( '.subsubsub' ),
					$themeRow  = $( this ),
					totals     = settings.themes,
					deletedRow = wp.template( 'item-deleted-row' );

				if ( ! $themeRow.hasClass( 'plugin-update-tr' ) ) {
					$themeRow.after(
						deletedRow( {
							slug:    response.slug,
							colspan: $( '#bulk-action-form' ).find( 'thead th:not(.hidden), thead td' ).length,
							name:    $themeRow.find( '.theme-title strong' ).text()
						} )
					);
				}

				$themeRow.remove();

				// Remove theme from update count.
				if ( $themeRow.hasClass( 'update' ) ) {
					totals.upgrade--;
					wp.updates.decrementCount( 'theme' );
				}

				// Remove from views.
				if ( $themeRow.hasClass( 'inactive' ) ) {
					totals.disabled--;
					if ( totals.disabled ) {
						$views.find( '.disabled .count' ).text( '(' + totals.disabled + ')' );
					} else {
						$views.find( '.disabled' ).remove();
					}
				}

				// There is always at least one theme available.
				$views.find( '.all .count' ).text( '(' + --totals.all + ')' );
			} );
		}

		wp.a11y.speak( wp.updates.l10n.themeDeleted, 'polite' );

		$document.trigger( 'wp-theme-delete-success', response );
	};

	/**
	 * Updates the UI appropriately after a failed theme deletion.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} deleteThemeError
	 * @param {object} response              Response from the server.
	 * @param {string} response.slug         Slug of the theme to be deleted.
	 * @param {string} response.errorCode    Error code for the error that occurred.
	 * @param {string} response.errorMessage The error that occurred.
	 */
	wp.updates.deleteThemeError = function( response ) {
		debugger;
		var $themeRow    = $( 'tr.inactive[data-slug="' + response.slug + '"]' ),
			$button      = $( '.theme-actions .delete-theme' ),
			updateRow    = wp.template( 'item-update-row' ),
			$updateRow   = $themeRow.siblings( '#' + response.slug + '-update' ),
			errorMessage = wp.updates.l10n.deleteFailed.replace( '%s', response.errorMessage ),
			$message     = wp.updates.adminNotice( {
				className: 'update-message notice-error notice-alt',
				message:   errorMessage
			} );

		if ( wp.updates.maybeHandleCredentialError( response, 'delete-theme' ) ) {
			return;
		}

		if ( 'themes-network' === pagenow ) {
			if ( ! $updateRow.length ) {
				$themeRow.addClass( 'update' ).after(
					updateRow( {
						slug: response.slug,
						colspan: $( '#bulk-action-form' ).find( 'thead th:not(.hidden), thead td' ).length,
						content: $message
					} )
				);
			} else {
				// Remove previous error messages, if any.
				$updateRow.find( '.notice-error' ).remove();
				$updateRow.find( '.plugin-update' ).append( $message );
			}
		} else {
			$( '.theme-info .theme-description' ).before( $message );
		}

		$button.html( $button.data( 'originaltext' ) );

		wp.a11y.speak( errorMessage, 'assertive' );

		$document.trigger( 'wp-theme-delete-error', response );
	};

	/**
	 * Adds the appropriate callback based on the type of action and the current page.
	 *
	 * @since 4.6.0
	 * @private
	 *
	 * @param {object} data   AJAX payload.
	 * @param {string} action The type of request to perform.
	 * @return {object} The AJAX payload with the appropriate callbacks.
	 */
	wp.updates._addCallbacks = function( data, action ) {
		debugger;
		if ( 'import' === pagenow && 'install-plugin' === action ) {
			data.success = wp.updates.installImporterSuccess;
			data.error   = wp.updates.installImporterError;
		}

		return data;
	};

	/**
	 * Pulls available jobs from the queue and runs them.
	 *
	 * @since 4.2.0
	 * @since 4.6.0 Can handle multiple job types.
	 */
	wp.updates.queueChecker = function() {
		debugger;
		var job;

		if ( wp.updates.ajaxLocked || ! wp.updates.queue.length ) {
			return;
		}

		job = wp.updates.queue.shift();

		// Handle a queue job.
		switch ( job.action ) {
			case 'install-plugin':
				wp.updates.installPlugin( job.data );
				break;

			case 'update-plugin':
				wp.updates.updatePlugin( job.data );
				break;

			case 'delete-plugin':
				wp.updates.deletePlugin( job.data );
				break;

			case 'install-theme':
				wp.updates.installTheme( job.data );
				break;

			case 'update-theme':
				wp.updates.updateTheme( job.data );
				break;

			case 'delete-theme':
				wp.updates.deleteTheme( job.data );
				break;

			default:
				break;
		}
	};

	/**
	 * Requests the users filesystem credentials if they aren't already known.
	 *
	 * @since 4.2.0
	 *
	 * @param {Event=} event Optional. Event interface.
	 */
	wp.updates.requestFilesystemCredentials = function( event ) {
		debugger;
		if ( false === wp.updates.filesystemCredentials.available ) {
			/*
			 * After exiting the credentials request modal,
			 * return the focus to the element triggering the request.
			 */
			if ( event && ! wp.updates.$elToReturnFocusToFromCredentialsModal ) {
				wp.updates.$elToReturnFocusToFromCredentialsModal = $( event.target );
			}

			wp.updates.ajaxLocked = true;
			wp.updates.requestForCredentialsModalOpen();
		}
	};

	/**
	 * Requests the users filesystem credentials if needed and there is no lock.
	 *
	 * @since 4.6.0
	 *
	 * @param {Event=} event Optional. Event interface.
	 */
	wp.updates.maybeRequestFilesystemCredentials = function( event ) {
		debugger;
		if ( wp.updates.shouldRequestFilesystemCredentials && ! wp.updates.ajaxLocked ) {
			wp.updates.requestFilesystemCredentials( event );
		}
	};

	/**
	 * Keydown handler for the request for credentials modal.
	 *
	 * Closes the modal when the escape key is pressed and
	 * constrains keyboard navigation to inside the modal.
	 *
	 * @since 4.2.0
	 *
	 * @param {Event} event Event interface.
	 */
	wp.updates.keydown = function( event ) {
		debugger;
		if ( 27 === event.keyCode ) {
			wp.updates.requestForCredentialsModalCancel();
		} else if ( 9 === event.keyCode ) {

			// #upgrade button must always be the last focus-able element in the dialog.
			if ( 'upgrade' === event.target.id && ! event.shiftKey ) {
				$( '#hostname' ).focus();

				event.preventDefault();
			} else if ( 'hostname' === event.target.id && event.shiftKey ) {
				$( '#upgrade' ).focus();

				event.preventDefault();
			}
		}
	};

	/**
	 * Opens the request for credentials modal.
	 *
	 * @since 4.2.0
	 */
	wp.updates.requestForCredentialsModalOpen = function() {
		debugger;
		var $modal = $( '#request-filesystem-credentials-dialog' );

		$( 'body' ).addClass( 'modal-open' );
		$modal.show();
		$modal.find( 'input:enabled:first' ).focus();
		$modal.on( 'keydown', wp.updates.keydown );
	};

	/**
	 * Closes the request for credentials modal.
	 *
	 * @since 4.2.0
	 */
	wp.updates.requestForCredentialsModalClose = function() {
		debugger;
		$( '#request-filesystem-credentials-dialog' ).hide();
		$( 'body' ).removeClass( 'modal-open' );

		if ( wp.updates.$elToReturnFocusToFromCredentialsModal ) {
			wp.updates.$elToReturnFocusToFromCredentialsModal.focus();
		}
	};

	/**
	 * Takes care of the steps that need to happen when the modal is canceled out.
	 *
	 * @since 4.2.0
	 * @since 4.6.0 Triggers an event for callbacks to listen to and add their actions.
	 */
	wp.updates.requestForCredentialsModalCancel = function() {
		debugger;
		// Not ajaxLocked and no queue means we already have cleared things up.
		if ( ! wp.updates.ajaxLocked && ! wp.updates.queue.length ) {
			return;
		}

		_.each( wp.updates.queue, function( job ) {
			$document.trigger( 'credential-modal-cancel', job );
		} );

		// Remove the lock, and clear the queue.
		wp.updates.ajaxLocked = false;
		wp.updates.queue = [];

		wp.updates.requestForCredentialsModalClose();
	};

	/**
	 * Displays an error message in the request for credentials form.
	 *
	 * @since 4.2.0
	 *
	 * @param {string} message Error message.
	 */
	wp.updates.showErrorInCredentialsForm = function( message ) {
		debugger;
		var $filesystemForm = $( '#request-filesystem-credentials-form' );

		// Remove any existing error.
		$filesystemForm.find( '.notice' ).remove();
		$filesystemForm.find( '#request-filesystem-credentials-title' ).after( '<div class="notice notice-alt notice-error"><p>' + message + '</p></div>' );
	};

	/**
	 * Handles credential errors and runs events that need to happen in that case.
	 *
	 * @since 4.2.0
	 *
	 * @param {object} response Ajax response.
	 * @param {string} action   The type of request to perform.
	 */
	wp.updates.credentialError = function( response, action ) {
		debugger;
		// Restore callbacks.
		response = wp.updates._addCallbacks( response, action );

		wp.updates.queue.unshift( {
			action: action,

			/*
			 * Not cool that we're depending on response for this data.
			 * This would feel more whole in a view all tied together.
			 */
			data: response
		} );

		wp.updates.filesystemCredentials.available = false;
		wp.updates.showErrorInCredentialsForm( response.errorMessage );
		wp.updates.requestFilesystemCredentials();
	};

	/**
	 * Handles credentials errors if it could not connect to the filesystem.
	 *
	 * @since 4.6.0
	 *
	 * @typedef {object} maybeHandleCredentialError
	 * @param {object} response              Response from the server.
	 * @param {string} response.errorCode    Error code for the error that occurred.
	 * @param {string} response.errorMessage The error that occurred.
	 * @param {string} action                The type of request to perform.
	 * @returns {boolean} Whether there is an error that needs to be handled or not.
	 */
	wp.updates.maybeHandleCredentialError = function( response, action ) {debugger;
		if ( wp.updates.shouldRequestFilesystemCredentials && response.errorCode && 'unable_to_connect_to_filesystem' === response.errorCode ) {
			wp.updates.credentialError( response, action );
			return true;
		}

		return false;
	};

	/**
	 * Validates an AJAX response to ensure it's a proper object.
	 *
	 * If the response deems to be invalid, an admin notice is being displayed.
	 *
	 * @param {(object|string)} response              Response from the server.
	 * @param {function=}       response.always       Optional. Callback for when the Deferred is resolved or rejected.
	 * @param {string=}         response.statusText   Optional. Status message corresponding to the status code.
	 * @param {string=}         response.responseText Optional. Request response as text.
	 * @param {string}          action                Type of action the response is referring to. Can be 'delete',
	 *                                                'update' or 'install'.
	 */
	wp.updates.isValidResponse = function( response, action ) {debugger;
		var error = wp.updates.l10n.unknownError,
		    errorMessage;

		// Make sure the response is a valid data object and not a Promise object.
		if ( _.isObject( response ) && ! _.isFunction( response.always ) ) {
			return true;
		}

		if ( _.isString( response ) && '-1' === response ) {
			error = wp.updates.l10n.nonceError;
		} else if ( _.isString( response ) ) {
			error = response;
		} else if ( 'undefined' !== typeof response.readyState && 0 === response.readyState ) {
			error = wp.updates.l10n.connectionError;
		} else if ( _.isString( response.responseText ) && '' !== response.responseText ) {
			error = response.responseText;
		} else if ( _.isString( response.statusText ) ) {
			error = response.statusText;
		}

		switch ( action ) {
			case 'update':
				errorMessage = wp.updates.l10n.updateFailed;
				break;

			case 'install':
				errorMessage = wp.updates.l10n.installFailed;
				break;

			case 'delete':
				errorMessage = wp.updates.l10n.deleteFailed;
				break;
		}

		// Messages are escaped, remove HTML tags to make them more readable.
		error = error.replace( /<[\/a-z][^<>]*>/gi, '' );
		errorMessage = errorMessage.replace( '%s', error );

		// Add admin notice.
		wp.updates.addAdminNotice( {
			id:        'unknown_error',
			className: 'notice-error is-dismissible',
			message:   _.escape( errorMessage )
		} );

		// Remove the lock, and clear the queue.
		wp.updates.ajaxLocked = false;
		wp.updates.queue      = [];

		// Change buttons of all running updates.
		$( '.button.updating-message' )
			.removeClass( 'updating-message' )
			.removeAttr( 'aria-label' )
			.prop( 'disabled', true )
			.text( wp.updates.l10n.updateFailedShort );

		$( '.updating-message:not(.button):not(.thickbox)' )
			.removeClass( 'updating-message notice-warning' )
			.addClass( 'notice-error' )
			.find( 'p' )
				.removeAttr( 'aria-label' )
				.text( errorMessage );

		wp.a11y.speak( errorMessage, 'assertive' );

		return false;
	};

	/**
	 * Potentially adds an AYS to a user attempting to leave the page.
	 *
	 * If an update is on-going and a user attempts to leave the page,
	 * opens an "Are you sure?" alert.
	 *
	 * @since 4.2.0
	 */
	wp.updates.beforeunload = function() {debugger;
		if ( wp.updates.ajaxLocked ) {
			return wp.updates.l10n.beforeunload;
		}
	};

	$( function() { debugger;
		var $pluginFilter        = $( '#plugin-filter' ),
			$bulkActionForm      = $( '#bulk-action-form' ),
			$filesystemForm      = $( '#request-filesystem-credentials-form' ),
			$filesystemModal     = $( '#request-filesystem-credentials-dialog' ),
			$pluginSearch        = $( '.plugins-php .wp-filter-search' ),
			$pluginInstallSearch = $( '.plugin-install-php .wp-filter-search' );

		settings = _.extend( settings, window._wpUpdatesItemCounts || {} );

		if ( settings.totals ) {
			wp.updates.refreshCount();
		}

		// Removed all events on this function to prevent double executions.
		
	} );
})( jQuery, window.wp, window._wpUpdatesSettings );


});