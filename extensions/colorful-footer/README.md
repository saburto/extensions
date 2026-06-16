# Colorful Footer

Replaces the default pi footer with a vibrant, icon-rich status bar using emoji icons and theme-colored backgrounds. No Nerd Fonts required.

```
🤖 claude-sonnet-4 │ 🌱 main │ ↑1.2k↓3k │ 💾500 45% │ 📊 8.5k/200k (4%) │ 💰$0.042 │ 🧠 ● xhigh
```

## Features

- **Emoji icons** — works in any modern terminal without Nerd Fonts
- **Theme-aware** — each section uses a themed background color from your pi theme
- **Responsive pruning** — sections drop progressively as the terminal narrows
- **Working indicator** — replaces the default spinner and "Working..." message with themed variants
- **Thinking level display** — shows current thinking level with a colored circle indicator

### Footer Sections

| Section | Icon | Description |
|---------|------|-------------|
| Model | 🤖 | Current model ID |
| Git branch | 🌱 | Active git branch (hidden if not in a repo) |
| Tokens | ↑↓ | Input and output token counts |
| Cache | 💾 | Cache read count and hit rate (hidden when empty) |
| Context | 📊 | Context window usage fraction and percentage (hidden when unavailable) |
| Cost | 💰 | Total session cost in USD |
| Thinking | 🧠 | Current thinking level with circle indicator |

## Installation

### From npm

```bash
pi install npm:@saburto/pi-colorful-footer
```

### Quick test (no install)

```bash
pi -e npm:@saburto/pi-colorful-footer
```

## Usage

Once installed, the colorful footer replaces the default status bar automatically. No configuration needed.

### Commands

- `/colorful` — Toggle the colorful footer on/off. Use `/reload` to re-enable it after disabling.

