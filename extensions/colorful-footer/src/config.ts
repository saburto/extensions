/**
 * Configuration module for the Colorful Footer extension.
 *
 * Config lookup order (later sources deep-merge over earlier ones):
 *   1. Built-in defaults (this file)
 *   2. ~/.pi/agent/colorful-footer.json (global user config)
 *   3. .pi/colorful-footer.json (project-local config)
 *
 * Conditional "rules" match against the current model ID and apply further
 * overrides on top of the merged base config.  When multiple rules match,
 * higher `priority` wins; ties break in array order (later wins).
 */

import { Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";

/** pi config directory name (stable constant). */
const CONFIG_DIR_NAME = ".pi";

/** Theme background color — not exported by pi-coding-agent, so we redeclare. */
export type ThemeBg = "selectedBg" | "userMessageBg" | "customMessageBg" | "toolPendingBg" | "toolSuccessBg" | "toolErrorBg";

// ── RGB hex color utilities ────────────────────────────────────────────

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Check whether a color value is a hex RGB string (e.g. "#ff0000", "#f00", "#ff0000cc"). */
export function isHexColor(v: string): boolean {
  return HEX_RE.test(v);
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

/** Apply a foreground color. If it's a hex string, emit true-color ANSI; otherwise delegate to Theme. */
export function resolveFg(color: string | undefined, theme: Theme, fallback: string, text: string): string {
  if (color && isHexColor(color)) {
    const [r, g, b] = hexToRgb(color);
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
  }
  return theme.fg((color || fallback) as ThemeColor, text);
}

/** Apply a background color. If it's a hex string, emit true-color ANSI; otherwise delegate to Theme. */
export function resolveBg(color: string | undefined, theme: Theme, fallback: string, text: string): string {
  if (color && isHexColor(color)) {
    const [r, g, b] = hexToRgb(color);
    return `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
  }
  return theme.bg((color || fallback) as ThemeBg, text);
}
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Types ───────────────────────────────────────────────────────────────

export interface IconOverrides {
  model?: string;
  folder?: string;
  git?: string;
  tokensIn?: string;
  tokensOut?: string;
  cache?: string;
  context?: string;
  cost?: string;
  thinking?: string;
  statuses?: string;
}

export interface SectionConfig {
  /** Hide this section entirely. */
  hidden?: boolean;
  /** Background color of the pill — theme name or hex RGB (e.g. "#ff0000"). */
  bgColor?: string;
  /** Foreground color for the icon — theme name or hex RGB. */
  fgColor?: string;
  /** Foreground color for the label text — theme name or hex RGB. */
  labelColor?: string;
  /** Sort order (lower = further left). Defaults use the built-in order. */
  order?: number;
}

export interface ThinkingLevelConfig {
  icon?: string;
  /** Foreground color — theme name or hex RGB. */
  color?: string;
}

export interface ConditionalRule {
  /** Model IDs or glob-like patterns to match against ctx.model.id. */
  models?: string[];
  /** Priority — highest-priority matching rule wins when multiple match. */
  priority?: number;
  /** Overrides that apply when this rule matches. */
  icons?: IconOverrides;
  sections?: Partial<Record<string, SectionConfig>>;
  thinking?: Record<string, ThinkingLevelConfig>;
  separator?: string;
  separatorColor?: string;
}

export interface ColorfulFooterConfig {
  icons?: IconOverrides;
  sections?: Partial<Record<string, SectionConfig>>;
  thinking?: Record<string, ThinkingLevelConfig>;
  separator?: string;
  /** Separator foreground color — theme name or hex RGB. */
  separatorColor?: string;
  /** Ordered list of conditional rules, applied on top of base config. */
  rules?: ConditionalRule[];
}

// ── Built-in defaults ───────────────────────────────────────────────────

const DEFAULT_ICONS: Required<IconOverrides> = {
  model:    "\u{1F916}",       // 🤖 robot face
  folder:   "\u{1F4C1}",      // 📁 file folder
  git:      "\u{1F331}",       // 🌱 seedling
  tokensIn: "\u2191",          // ↑ up arrow
  tokensOut:"\u2193",          // ↓ down arrow
  cache:    "\u{1F4BE}",       // 💾 floppy disk
  context:  "\u{1F4CA}",       // 📊 bar chart
  cost:     "\u{1F4B0}",       // 💰 money bag
  thinking: "\u{1F9E0}",       // 🧠 brain
  statuses: "\u{1F50C}",       // 🔌 electric plug
};

const DEFAULT_THINKING: Record<string, ThinkingLevelConfig> = {
  off:      { icon: "\u25cb", color: "thinkingOff" },      // ○
  minimal:  { icon: "\u25d0", color: "thinkingMinimal" },  // ◐
  low:      { icon: "\u25d1", color: "thinkingLow" },      // ◑
  medium:   { icon: "\u25d2", color: "thinkingMedium" },   // ◒
  high:     { icon: "\u25d3", color: "thinkingHigh" },     // ◓
  xhigh:    { icon: "\u25cf", color: "thinkingXhigh" },    // ●
};

const DEFAULT_SECTION_ORDER: Record<string, number> = {
  model:    0,
  folder:   1,
  git:      2,
  tokens:   3,
  cache:    4,
  context:  5,
  cost:     6,
  thinking: 7,
  statuses: 8,
};

const DEFAULT_SEPARATOR = " │ ";

// ── Deep merge (plain objects only) ─────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function deepMerge<T extends AnyRecord>(base: T, ...overrides: Array<Partial<T> | undefined>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const override of overrides) {
    if (!override) continue;
    for (const key of Object.keys(override)) {
      const ov = (override as Record<string, unknown>)[key];
      const bv = result[key];
      if (isPlainObject(bv) && isPlainObject(ov)) {
        result[key] = deepMerge(bv, ov);
      } else {
        result[key] = ov;
      }
    }
  }
  return result as T;
}

// ── Config loading ──────────────────────────────────────────────────────

function loadJsonFile(path: string): unknown | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function getGlobalConfigPath(): string {
  return join(homedir(), CONFIG_DIR_NAME, "agent", "colorful-footer.json");
}

function getProjectConfigPath(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, "colorful-footer.json");
}

function buildDefaultConfig(): ColorfulFooterConfig {
  return {
    icons: { ...DEFAULT_ICONS },
    thinking: { ...DEFAULT_THINKING },
    separator: DEFAULT_SEPARATOR,
  };
}

/**
 * Load and merge all config sources.  Returns the fully-resolved base config
 * (before conditional rules are applied).
 */
export function loadConfig(cwd: string): ColorfulFooterConfig {
  const defaults = buildDefaultConfig();

  const globalRaw = loadJsonFile(getGlobalConfigPath()) as Partial<ColorfulFooterConfig> | undefined;
  const projectRaw = loadJsonFile(getProjectConfigPath(cwd)) as Partial<ColorfulFooterConfig> | undefined;

  return deepMerge(defaults, globalRaw, projectRaw);
}

// ── Model matching ──────────────────────────────────────────────────────

/**
 * Simple glob-like matching.
 * Supported wildcards: * (any chars), ? (single char).
 * Case-insensitive.
 */
function matchPattern(pattern: string, value: string): boolean {
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();

  // Convert glob to regex
  let regexStr = "";
  for (let i = 0; i < p.length; i++) {
    switch (p[i]) {
      case "*": regexStr += ".*"; break;
      case "?": regexStr += "."; break;
      // Escape regex special chars
      case ".": case "+": case "^": case "$": case "{": case "}":
      case "[": case "]": case "(": case ")": case "|": case "\\":
        regexStr += "\\" + p[i];
        break;
      default:
        regexStr += p[i];
    }
  }
  return new RegExp("^" + regexStr + "$").test(v);
}

function ruleMatches(rule: ConditionalRule, modelId: string): boolean {
  if (!rule.models || rule.models.length === 0) return false;
  return rule.models.some((pattern) => matchPattern(pattern, modelId));
}

/**
 * Apply conditional rules on top of the base config.
 * Returns the final effective configuration for the given model.
 */
export function resolveConfig(base: ColorfulFooterConfig, modelId: string): ColorfulFooterConfig {
  const matching = (base.rules ?? [])
    .filter((r) => ruleMatches(r, modelId))
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  let result = { ...base };
  for (const rule of matching) {
    // Shallow-copy to avoid mutating the base
    result = {
      ...result,
      icons: rule.icons ? { ...result.icons, ...rule.icons } : result.icons,
      sections: rule.sections ? deepMerge(result.sections ?? {}, rule.sections) : result.sections,
      thinking: rule.thinking ? { ...result.thinking, ...rule.thinking } : result.thinking,
      separator: rule.separator ?? result.separator,
      separatorColor: rule.separatorColor ?? result.separatorColor,
    };
  }
  return result;
}

// ── Derived helpers ─────────────────────────────────────────────────────

export interface EffectiveSection {
  key: string;
  icon: string;
  hidden: boolean;
  bgColor?: string;
  fgColor?: string;
  labelColor?: string;
  order: number;
}

export function resolveSections(config: ColorfulFooterConfig): EffectiveSection[] {
  const icons = { ...DEFAULT_ICONS, ...config.icons };
  const sections: EffectiveSection[] = [
    {
      key: "model",
      icon: icons.model,
      hidden: false,
      order: DEFAULT_SECTION_ORDER.model,
    },
    {
      key: "folder",
      icon: icons.folder,
      hidden: false,
      order: DEFAULT_SECTION_ORDER.folder,
    },
    {
      key: "git",
      icon: icons.git,
      hidden: false,
      order: DEFAULT_SECTION_ORDER.git,
    },
    {
      key: "tokens",
      icon: icons.tokensIn, // tokensIn is the primary icon; tokensOut used inline
      hidden: false,
      order: DEFAULT_SECTION_ORDER.tokens,
    },
    {
      key: "cache",
      icon: icons.cache,
      hidden: false,
      order: DEFAULT_SECTION_ORDER.cache,
    },
    {
      key: "context",
      icon: icons.context,
      hidden: false,
      order: DEFAULT_SECTION_ORDER.context,
    },
    {
      key: "cost",
      icon: icons.cost,
      hidden: false,
      order: DEFAULT_SECTION_ORDER.cost,
    },
    {
      key: "thinking",
      icon: icons.thinking,
      hidden: false,
      order: DEFAULT_SECTION_ORDER.thinking,
    },
    {
      key: "statuses",
      icon: icons.statuses,
      hidden: false,
      order: DEFAULT_SECTION_ORDER.statuses,
    },
  ];

  // Apply section-level config overrides
  for (const sec of sections) {
    const overrides = config.sections?.[sec.key];
    if (overrides) {
      if (overrides.hidden !== undefined) sec.hidden = overrides.hidden;
      if (overrides.bgColor !== undefined) sec.bgColor = overrides.bgColor;
      if (overrides.fgColor !== undefined) sec.fgColor = overrides.fgColor;
      if (overrides.labelColor !== undefined) sec.labelColor = overrides.labelColor;
      if (overrides.order !== undefined) sec.order = overrides.order;
    }
  }

  // Sort by order
  sections.sort((a, b) => a.order - b.order);

  return sections;
}

export function resolveThinking(config: ColorfulFooterConfig): Record<string, ThinkingLevelConfig> {
  return { ...DEFAULT_THINKING, ...config.thinking };
}

export function getTokensOutIcon(config: ColorfulFooterConfig): string {
  return config.icons?.tokensOut ?? DEFAULT_ICONS.tokensOut;
}
