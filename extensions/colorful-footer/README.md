# Colorful Footer

Replaces the default pi footer with a vibrant, icon-rich status bar using emoji icons and theme-colored backgrounds. No Nerd Fonts required.

```
🤖 claude-sonnet-4 │ 📁 extensions │ 🌱 main │ ↑1.2k↓3k │ 💾500 45% │ 📊 8.5k/200k (4%) │ 💰$0.042 │ 🧠 ● xhigh
```

## Features

- **Emoji icons** — works in any modern terminal without Nerd Fonts
- **Theme-aware** — each section uses a themed background color from your pi theme
- **Responsive pruning** — sections drop progressively as the terminal narrows
- **Working indicator** — replaces the default spinner and "Working..." message with themed variants
- **Thinking level display** — shows current thinking level with a colored circle indicator
- **Current folder** — shows repo root name (if in a git repo) or the working directory without `$HOME`
- **Configurable** — customize icons, colors, hide sections, and set per-model style rules via JSON config files

### Footer Sections

| Section | Icon | Description |
|---------|------|-------------|
| Model | 🤖 | Current model ID |
| Folder | 📁 | Git repo root folder name, or cwd without $HOME |
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
- `/colorful-config` — **Chat-based configuration.** Feeds the full config guide into the conversation so the LLM can read your current config, ask you questions, and edit the JSON file for you. Follow it up with `/reload` to apply.

## Configuration

Place a JSON file in one of these locations:

| Path | Scope |
|------|-------|
| `~/.pi/agent/colorful-footer.json` | Global (all projects) |
| `.pi/colorful-footer.json` | Project-local (overrides global) |

Configs are deep-merged: project-local values override global values, which override built-in defaults.

### Quick Example

```json
{
  "icons": {
    "model": "🧠",
    "git": "🔀"
  },
  "sections": {
    "cost": {
      "hidden": true
    },
    "model": {
      "bgColor": "toolSuccessBg",
      "fgColor": "text"
    }
  },
  "separator": " ║ ",
  "separatorColor": "accent"
}
```

### Full Schema

```typescript
interface ColorfulFooterConfig {
  /** Override any section icon (standard emoji). */
  icons?: {
    model?: string;
    folder?: string;
    git?: string;
    tokensIn?: string;
    tokensOut?: string;
    cache?: string;
    context?: string;
    cost?: string;
    thinking?: string;
  };

  /** Per-section visibility, colors, and ordering. */
  sections?: {
    model?: SectionConfig;
    folder?: SectionConfig;
    git?: SectionConfig;
    tokens?: SectionConfig;
    cache?: SectionConfig;
    context?: SectionConfig;
    cost?: SectionConfig;
    thinking?: SectionConfig;
  };

  /** Override thinking-level icons and colors. */
  thinking?: {
    off?:     { icon?: string; color?: string };
    minimal?: { icon?: string; color?: string };
    low?:     { icon?: string; color?: string };
    medium?:  { icon?: string; color?: string };
    high?:    { icon?: string; color?: string };
    xhigh?:   { icon?: string; color?: string };
  };

  /** Separator between sections. */
  separator?: string;

  /** Foreground color of the separator — theme name or hex RGB. */
  separatorColor?: string;

  /** Conditional style rules — applied when a model ID matches. */
  rules?: ConditionalRule[];
}

interface SectionConfig {
  hidden?: boolean;        // Hide this section entirely
  bgColor?: string;        // ThemeBg name or hex RGB (#rrggbb)
  fgColor?: string;        // ThemeColor name or hex RGB
  labelColor?: string;     // ThemeColor name or hex RGB
  order?: number;          // Sort position (lower = further left)
}

interface ConditionalRule {
  models?: string[];    // Model IDs or glob patterns (e.g. "claude-opus*", "deepseek*")
  priority?: number;    // Higher wins when multiple rules match
  icons?: IconOverrides;
  sections?: Partial<Record<string, SectionConfig>>;
  thinking?: Record<string, ThinkingLevelConfig>;
  separator?: string;
  separatorColor?: ThemeColor;
}
```

### Available Colors

**Foreground (`ThemeColor`):**
`accent`, `border`, `borderAccent`, `borderMuted`, `success`, `error`, `warning`, `muted`, `dim`, `text`, `thinkingText`, `userMessageText`, `customMessageText`, `customMessageLabel`, `toolTitle`, `toolOutput`, `mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet`, `toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext`, `syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation`, `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`, `bashMode`

**Background (`ThemeBg`):**
`selectedBg`, `userMessageBg`, `customMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`

> **Hex RGB colors** are also accepted anywhere a theme color name is expected.
> Use `#rrggbb` format (e.g. `"#ff4444"`, `"#2e7d32"`). Short `#rgb` works too.

### Hex Color Example

```json
{
  "sections": {
    "model": {
      "bgColor": "#1a1a2e",
      "fgColor": "#e94560"
    },
    "cost": {
      "bgColor": "#0f3460",
      "fgColor": "#16c79a"
    }
  },
  "separatorColor": "#555555"
}
```

### Conditional Rules Example

Different colors per model — red for Opus, green for DeepSeek:

```json
{
  "rules": [
    {
      "models": ["claude-opus-4*", "claude-opus-4-5*"],
      "priority": 10,
      "sections": {
        "model": {
          "bgColor": "toolErrorBg",
          "fgColor": "error"
        }
      }
    },
    {
      "models": ["deepseek*"],
      "priority": 10,
      "sections": {
        "model": {
          "bgColor": "toolSuccessBg",
          "fgColor": "success"
        }
      }
    },
    {
      "models": ["*sonnet*"],
      "priority": 5,
      "sections": {
        "model": {
          "bgColor": "toolPendingBg",
          "fgColor": "warning"
        }
      }
    }
  ]
}
```

### Hide Sections Example

Hide the cost and cache sections to save space:

```json
{
  "sections": {
    "cost": { "hidden": true },
    "cache": { "hidden": true }
  }
}
```

### Custom Icons Example

Replace emoji icons with Nerd Font characters (if your terminal supports them):

```json
{
  "icons": {
    "model": "",
    "folder": "",
    "git": "",
    "tokensIn": "",
    "tokensOut": "",
    "cache": "",
    "context": "",
    "cost": "",
    "thinking": "�11"
  }
}
```
