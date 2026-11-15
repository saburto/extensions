# pi-notify-fullscreen

Fullscreen notifications for [pi coding agent](https://github.com/earendil-works/pi), powered by
[notify-fullscreen](https://github.com/saburto/notify-fullscreen) — a dimmed
full-screen overlay that stays until you dismiss it, so you notice when pi needs
you even from another app.

## Demo

<video src="./docs/demo.mp4" controls muted width="720"></video>

[▶ Watch the demo (31s)](./docs/demo.mp4)

## Requirements

- Linux with X11/Xwayland (`$DISPLAY` set)
- [`notify-fullscreen`](https://github.com/saburto/notify-fullscreen) installed —
  `make install` puts it in `~/.local/bin` (found automatically) or set
  `NOTIFY_FULLSCREEN_BIN`.

## Install

```bash
pi install ./extensions/pi-notify-fullscreen          # permanent
pi -e ./extensions/pi-notify-fullscreen/src/index.ts  # one-off session
```

## Usage

**Automatic** — a fullscreen `Pi needs your input (confirm — Deploy to prod?)`
overlay appears whenever the agent blocks on user interaction, and dismissing it
refocuses the terminal.

**`notify` tool** (the agent alerts you):

| You said | Agent passes |
|---|---|
| "Tell me when you're done" | `after_task: true` |
| "Remind me in 10 minutes" | `delay_seconds: 600` |
| "Deploy to prod?" | `ask: true` → returns "User answered YES/NO." |
| — | `message` only |

Also `opacity`, `font_size`, `ok_label`, `no_label`, `refocus` (on by default).

**`/notify-fullscreen` command** (you alert yourself):

```
/notify-fullscreen Coffee's ready
/notify-fullscreen --in 5m Check the oven
/notify-fullscreen --after-task Review the diff
/notify-fullscreen --confirm Dinner at Zoka?     # blocking yes/no
/notify-fullscreen --no-refocus Heads up only
```

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `NOTIFY_FULLSCREEN_BIN` | auto | Binary path override (`~/.local/bin`, then `$PATH`) |
| `PI_NOTIFY_ON_PROMPT` | `1` | `1` confirm/input/editor prompts · `all` every prompt · `0` off |
| `PI_NOTIFY_PROMPT_REFOCUS` | `1` | Refocus terminal after prompt alerts |
| `PI_NOTIFY_ON_SETTLED` | `0` | `1` also notify "Pi has finished." whenever pi idles |
| `PI_NOTIFY_COOLDOWN_MS` | `3000` | Min gap between automatic alerts (not tool/command use) |
| `PI_NOTIFY_FORCE` | `0` | `1` skips Linux/`$DISPLAY` checks (testing) |

## Notes

- Scheduled notifications are in-process timers: they die with pi, so in
  one-shot `-p` mode they only fire if due before exit.
- Overlays are modal — pi waits for dismissal. Quitting pi leaves a shown
  overlay until you click it away.
- Yes/No answers come back to the agent via the binary's exit code (0/1).

## Development

```bash
bun run typecheck
```

Test with a fake binary (no screen takeover):

```sh
printf '#!/bin/sh\necho "$*" >> /tmp/fake-notify.log\nsed "s/^/  /" >> /tmp/fake-notify.log\nexit 0\n' > /tmp/fake-notify && chmod +x /tmp/fake-notify

NOTIFY_FULLSCREEN_BIN=/tmp/fake-notify PI_NOTIFY_FORCE=1 \
  pi --no-extensions -e ./extensions/pi-notify-fullscreen/src/index.ts \
  -p "Call the notify tool with message 'hello from test'"
```