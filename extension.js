const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils
const Mainloop = imports.mainloop;
const Gettext = imports.gettext;
const REFRESH = 3;
const KnownStatus = ['available','away','busy','dnd','hidden','invisible','offline'];

var button = null;
var menu_actor = null;
var timer_start = null;
var timer_loop = null;
var messenger = null;

var Telepathy = {
	contactListCommand: "empathy",

	getStatus: function() {
		var AccListArr = Telepathy._getAccountsList();
		var inc = 0;
		var AccName = "";
		var LastStatus = "";

		for (inc = 0; inc < AccListArr.length - 1 ; inc++) {
			AccName = new String(AccListArr[inc]);

			if(Telepathy._is_managable_account(AccName)) {
				var AccStatus = new String(GLib.spawn_command_line_sync('mc-tool show ' + AccName.replace(/,/g,""))[1]);
				LastStatus = new String(AccStatus.match(/Current:.*/));
				LastStatus = LastStatus.replace(/Current:/,"");
				LastStatus = LastStatus.replace(/\".*\"/,"");
				LastStatus = LastStatus.replace(/\"/g, "");
				LastStatus = LastStatus.replace(/[()0-9]/g, "");
				LastStatus = LastStatus.trim();
			}
		}

		if (! _arr_contains(KnownStatus,LastStatus)) {
			LastStatus = "custom";
		}
		return LastStatus;
	},

	setStatus: function(requested_status) {
		var AccListArr = Telepathy._getAccountsList();
		var inc = 0;
		var AccName;

		for (inc = 0; inc < AccListArr.length - 1; inc++) {
			AccName = new String(AccListArr[inc]);
			AccName = AccName.replace(/,/g,"");

			if(Telepathy._is_managable_account(AccName)) {
				GLib.spawn_command_line_sync('mc-tool request ' + AccName + ' ' + requested_status);
			}
		}
	},

	_getAccountsList: function() {
		var MCToolListShell = GLib.spawn_command_line_sync('mc-tool list');
		var AccountListTxt = new String(MCToolListShell[1]);
		var Ret = new Array();

		Ret = AccountListTxt.split("\n");
		return Ret;
	},

	_is_managable_account: function(accid) {
		var is_managable = true;

		//Enabled account?
		var AccState = new String(GLib.spawn_command_line_sync('mc-tool show ' + accid.replace(/,/g,""))[1]);
		var AccEnabled = new String(AccState.match(/Enabled:.*/));
		AccEnabled = AccEnabled.replace(/Enabled: /,"");
		AccEnabled = AccEnabled.trim();

		if(accid.match(/\/irc\//) != null) {
			is_managable = false;
		}

		if(AccEnabled.match(/enabled/) == null) {
			is_managable = false;
		}

		return is_managable;
	}
}

var Gajim = {
	contactListCommand: "gajim",

	getStatus: function() {
		var AccListArr = Gajim._getAccountsList();
		var inc = 0;
		var AccName = "";
		var LastStatus = "";

		for (inc = 0; inc < AccListArr.length - 1 ; inc++) {
			AccName = new String(AccListArr[inc]);

			LastStatus = new String(GLib.spawn_command_line_sync('gajim-remote get_status ' + AccName)[1]).trim();
		}

		switch (LastStatus) {
			case 'online':
				LastStatus = 'available';
				break;
			case 'xa':
				LastStatus = 'busy';
				break;
		}

		if (! _arr_contains(KnownStatus,LastStatus)) {
			LastStatus = "custom";
		}
		return LastStatus;
	},

	setStatus: function(requested_status) {
		var AccListArr = Gajim._getAccountsList();
		var inc = 0;
		var AccName;

		switch (requested_status) {
			case 'available':
				requested_status = 'online';
				break;
			case 'busy':
				requested_status = 'xa';
				break;
		}

		for (inc = 0; inc < AccListArr.length - 1; inc++) {
			AccName = new String(AccListArr[inc]);

			GLib.spawn_command_line_sync('gajim-remote change_status ' + requested_status + ' ' + AccName);
		}
	},

	_getAccountsList: function() {
		var GajimListShell = GLib.spawn_command_line_sync('gajim-remote list_accounts');
		var AccountListTxt = new String(GajimListShell[1]);
		var Ret = new Array();

		Ret = AccountListTxt.split("\n");
		return Ret;
	}
}

function enable() {
	timer_start = Mainloop.timeout_add_seconds(REFRESH, function () {
		messenger = Gajim;
		button = new PanelMenu.Button(0.0);
		_set_panel_display(button);
		_build_menu(button);

		Main.panel.addToStatusArea("chatstatus", button, 0, "right");
		Mainloop.source_remove(timer_start);
		timer_start = null;
	});

	timer_loop = Mainloop.timeout_add_seconds(REFRESH*3, function () {
		_set_panel_display(button);
		return true;
	});

}

function disable() {
	if (button) button.destroy();
	button = null;
	menu_actor = null;
	timer_start = null;
	Mainloop.source_remove(timer_loop);
	timer_loop = null;
}

function init() {
	let user_locale_path = ExtensionUtils.getCurrentExtension().path + "/locale";
	Gettext.bindtextdomain("chatstatus", user_locale_path);

	let theme = imports.gi.Gtk.IconTheme.get_default();
	theme.append_search_path(ExtensionUtils.getCurrentExtension().path + "/icons");

}

function _set_panel_display(button,set_state = "") {
	if (menu_actor) button.actor.remove_actor(menu_actor);

	var final_status;

	if (set_state == "") {
		final_status = messenger.getStatus();
	}
	else {
		final_status = set_state;
	}

	let icon = new St.Icon({icon_name: 'cs-' + final_status, style_class: "system-status-icon"});
	button.actor.add_actor(icon);
	menu_actor = icon;

}

function _build_menu(button) {
	if(messenger.getStatus() != 'null') {
		_add_item(button, Gettext.domain("chatstatus").gettext("Available"), 'available');
		_add_item(button, Gettext.domain("chatstatus").gettext("Busy"), 'dnd');
		_add_item(button, Gettext.domain("chatstatus").gettext("Away"), 'away');
		_add_item(button, Gettext.domain("chatstatus").gettext("Invisible"), 'hidden');
		_add_item(button, Gettext.domain("chatstatus").gettext("Offline"), 'offline');
		_add_separator(button);
		_add_item_run(button, Gettext.domain("chatstatus").gettext("Show contact list"), messenger.contactListCommand);
	}
	else {
		_add_item_run(button, Gettext.domain("chatstatus").gettext("Add new account"),'gnome-control-center online-accounts');
	}
}

function _add_separator() {
	let item = new PopupMenu.PopupSeparatorMenuItem();
	button.menu.addMenuItem(item);
}

function _add_item(button, status_name, status_code) {
	let item = new PopupMenu.PopupBaseMenuItem;
	button.menu.addMenuItem(item);
	let box = new St.BoxLayout({vertical: false,
				pack_start: false,
				style_class: "chatstatus-menu-box"});
	item.actor.add_child(box);

	let label = new St.Label({text: status_name});
	box.add(label);
	item.connect("activate", function () {
		messenger.setStatus(status_code);
		_set_panel_display(button,status_code);
	});
}

function _add_item_run(button, label, command) {
	let item = new PopupMenu.PopupBaseMenuItem;
	button.menu.addMenuItem(item);
	let box = new St.BoxLayout({vertical: false,
				pack_start: false,
				style_class: "chatstatus-menu-box"});
	item.actor.add_child(box);

	let label = new St.Label({text: label});
	box.add(label);

	item.connect("activate", function () {
		GLib.spawn_command_line_async(command);
	});
}

function _arr_contains(a, obj) {
	for (var i = 0; i < a.length; i++) {
		if (a[i] === obj) {
			return true;
		}
	}
	return false;
}
