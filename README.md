# Notification History

GNOME Shell extension that logs all desktop notifications to disk and provides a panel menu to browse them.

## Features

- Logs every notification (app, title, body, timestamp) to a JSONL file
- Panel indicator to browse the latest notifications, grouped by date
- No rotation — the log grows indefinitely

## Requirements

- GNOME Shell 49 or 50

## Install

```bash
ln -s /path/to/gnome-notification-history ~/.local/share/gnome-shell/extensions/notification-history@khady
```

Log out and back in, then:

```bash
gnome-extensions enable notification-history@khady
```

## Log location

```
~/.local/share/gnome-notification-history/notifications.jsonl
```

Each line is a JSON object:

```json
{"time":"2026-04-13T10:30:00+0200","app":"Slack","title":"New message","body":"Hello"}
```

## License

MIT
