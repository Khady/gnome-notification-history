import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const MAX_MENU_ENTRIES = 10;
const MAX_FIELD_LENGTH = 160;
const MAX_LABEL_WIDTH = '38em';
const TRUNCATED_SUFFIX = '...';

export default class NotificationHistoryExtension extends Extension {
    enable() {
        this._sourceConnections = new Map();

        const dataDir = GLib.build_filenamev([
            GLib.get_user_data_dir(), 'gnome-notification-history',
        ]);
        GLib.mkdir_with_parents(dataDir, 0o755);
        this._logPath = GLib.build_filenamev([dataDir, 'notifications.jsonl']);

        this._sourceAddedId = Main.messageTray.connect(
            'source-added', (_tray, source) => this._connectSource(source),
        );
        this._sourceRemovedId = Main.messageTray.connect(
            'source-removed', (_tray, source) => this._disconnectSource(source),
        );

        for (const source of Main.messageTray.getSources())
            this._connectSource(source);

        this._indicator = new PanelMenu.Button(0.0, 'Notification History', false);
        this._indicator.add_child(new St.Icon({
            icon_name: 'preferences-system-notifications-symbolic',
            style_class: 'system-status-icon',
        }));
        this._populateMenu();
        this._indicator.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._populateMenu();
        });
        Main.panel.addToStatusArea('notification-history', this._indicator);
    }

    disable() {
        if (this._sourceAddedId) {
            Main.messageTray.disconnect(this._sourceAddedId);
            this._sourceAddedId = null;
        }
        if (this._sourceRemovedId) {
            Main.messageTray.disconnect(this._sourceRemovedId);
            this._sourceRemovedId = null;
        }

        for (const [source, id] of this._sourceConnections)
            source.disconnect(id);
        this._sourceConnections.clear();

        this._indicator?.destroy();
        this._indicator = null;
    }

    _connectSource(source) {
        const id = source.connect('notification-added', (_source, notification) => {
            this._log(source, notification);
        });
        this._sourceConnections.set(source, id);
    }

    _disconnectSource(source) {
        const id = this._sourceConnections.get(source);
        if (id !== undefined) {
            source.disconnect(id);
            this._sourceConnections.delete(source);
        }
    }

    _log(source, notification) {
        const entry = {
            time: notification.datetime
                ? notification.datetime.format_iso8601()
                : new Date().toISOString(),
            app: source.title,
            title: notification.title,
            body: notification.body || '',
        };

        try {
            const file = Gio.File.new_for_path(this._logPath);
            const stream = file.append_to(Gio.FileCreateFlags.NONE, null);
            stream.write_all(
                new TextEncoder().encode(JSON.stringify(entry) + '\n'), null,
            );
            stream.close(null);
        } catch (e) {
            console.error(`notification-history: failed to write log: ${e.message}`);
        }
    }

    _populateMenu() {
        this._indicator.menu.removeAll();

        const entries = this._readLog();
        if (entries.length === 0) {
            this._indicator.menu.addMenuItem(
                new PopupMenu.PopupMenuItem('No notifications', {reactive: false}),
            );
            return;
        }

        const visibleEntries = entries.slice(0, MAX_MENU_ENTRIES);
        let currentDate = null;
        for (const entry of visibleEntries) {
            const date = entry.time.substring(0, 10);
            if (date !== currentDate) {
                currentDate = date;
                this._indicator.menu.addMenuItem(
                    new PopupMenu.PopupSeparatorMenuItem(date),
                );
            }

            const time = entry.time.substring(11, 16);
            const app = this._truncate(entry.app);
            const title = this._truncate(entry.title);
            const body = this._truncate(entry.body);
            let label = `${time}  ${app}: ${title}`;
            if (body)
                label += `\n${body}`;
            const item = new PopupMenu.PopupMenuItem(label, {reactive: false});
            item.label.style = `max-width: ${MAX_LABEL_WIDTH};`;
            item.label.clutter_text.line_wrap = false;
            item.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            this._indicator.menu.addMenuItem(item);
        }

        if (entries.length > visibleEntries.length) {
            this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._indicator.menu.addMenuItem(
                new PopupMenu.PopupMenuItem(
                    `Showing ${visibleEntries.length} of ${entries.length} notifications`,
                    {reactive: false},
                ),
            );
        }
    }

    _readLog() {
        try {
            const [ok, contents] = GLib.file_get_contents(this._logPath);
            if (!ok)
                return [];
            const text = new TextDecoder().decode(contents);
            const lines = text.trim().split('\n').filter(l => l);
            const entries = [];
            for (const line of lines) {
                try {
                    entries.push(JSON.parse(line));
                } catch {
                    // skip malformed lines
                }
            }
            return entries.reverse();
        } catch {
            return [];
        }
    }

    _truncate(value) {
        if (!value)
            return '';

        const text = String(value).replace(/\s+/g, ' ').trim();
        if (text.length <= MAX_FIELD_LENGTH)
            return text;

        return `${text.substring(
            0, MAX_FIELD_LENGTH - TRUNCATED_SUFFIX.length,
        )}${TRUNCATED_SUFFIX}`;
    }
}
