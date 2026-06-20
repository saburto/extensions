/**
 * Colorful Footer Extension — replaces the default footer with a vibrant,
 * icon-rich status bar using emoji icons and theme-colored backgrounds.
 *
 * Layout:  [🤖 model] [📁 folder] [🌱 branch] [↑in ↓out] [💾cache hit%] [📊ctx%] [💰cost] [🧠thinking]
 *
 * Uses emoji icons — works in any modern terminal without Nerd Fonts.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";

type ThemeBg = Parameters<Theme["bg"]>[0];
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ── Emoji icons ──────────────────────────────────────────────────────────
// All icons are standard emoji — no Nerd Font required.

const ICONS = {
  model: "\u{1F916}",       // 🤖 robot face
  folder: "\u{1F4C1}",      // 📁 file folder → current directory
  git: "\u{1F331}",         // 🌱 seedling → git branch
  tokensIn: "\u2191",        // ↑ up arrow
  tokensOut: "\u2193",       // ↓ down arrow
  cache: "\u{1F4BE}",        // 💾 floppy disk → cache/storage
  context: "\u{1F4CA}",      // 📊 bar chart → context usage
  cost: "\u{1F4B0}",         // 💰 money bag
  thinking: "\u{1F9E0}",     // 🧠 brain
} as const;

// Thinking level → icon + color (paired with 🧠 prefix)
const THINKING: Record<string, { icon: string; color: ThemeColor }> = {
  off:      { icon: "\u25cb", color: "muted" },              // ○
  minimal:  { icon: "\u25d0", color: "thinkingMinimal" },  // ◐
  low:      { icon: "\u25d1", color: "thinkingLow" },      // ◑
  medium:   { icon: "\u25d2", color: "thinkingMedium" },   // ◒
  high:     { icon: "\u25d3", color: "thinkingHigh" },     // ◓
  xhigh:    { icon: "\u25cf", color: "thinkingXhigh" },    // ●
};

// ── Colorful Working Indicator ───────────────────────────────────────────

/** Build a pill-style working message matching the footer aesthetic */
function makeWorkingMessage(theme: Theme): string {
  return theme.bg("toolPendingBg",
    " " + theme.fg("accent", "\u2699\uFE0F") + " " + theme.fg("text", "Working...") + " ",
  );
}

/** Build a spinner indicator using theme colors (no rainbow) */
function makeSpinner(theme: Theme) {
  const cols: ThemeColor[] = ["accent", "success", "warning", "thinkingHigh", "thinkingMedium"];
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  return {
    frames: frames.map((f, i) => theme.fg(cols[i % cols.length], f)),
    intervalMs: 80,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Format large numbers with k/M suffix */
function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Wrap text in a colored background "pill" */
function pill(theme: Theme, bgColor: ThemeBg, content: string): string {
  return theme.bg(bgColor, " " + content + " ");
}

// ── Extension ─────────────────────────────────────────────────────────────

export const colorfulFooter = (pi: ExtensionAPI) => {
  let thinkingLevel = "off";
  let enabled = false;
  let requestRender: (() => void) | null = null;

  // Track thinking level changes and trigger footer re-render
  pi.on("thinking_level_select", async (event) => {
    thinkingLevel = event.level;
    requestRender?.();
  });

  // Enable colorful footer on session start
  pi.on("session_start", async (_event, ctx) => {
    if (enabled) return;

    enabled = true;
    thinkingLevel = pi.getThinkingLevel();

    // Compute folder display: repo root name if in a git repo, otherwise cwd without $HOME
    let folderDisplay: string;
    const cwd = ctx.cwd;
    const home = process.env.HOME || '';
    try {
      const result = await pi.exec('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        timeout: 2000,
      });
      if (result.code === 0 && result.stdout.trim()) {
        const gitRoot = result.stdout.trim();
        folderDisplay = gitRoot.split('/').pop() || gitRoot;
      } else {
        folderDisplay = home && cwd.startsWith(home)
          ? '~' + cwd.slice(home.length)
          : cwd;
      }
    } catch {
      folderDisplay = home && cwd.startsWith(home)
        ? '~' + cwd.slice(home.length)
        : cwd;
    }

    // Colorful working message + spinner shown while the agent is streaming
    ctx.ui.setWorkingMessage(makeWorkingMessage(ctx.ui.theme));
    ctx.ui.setWorkingIndicator(makeSpinner(ctx.ui.theme));

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());
      requestRender = () => tui.requestRender();

      return {
        dispose: () => {
          unsub();
          requestRender = null;
        },
        invalidate() {},
        render(width: number): string[] {
          // ── Compute token stats ──────────────────────────────────
          let tokensIn = 0;
          let tokensOut = 0;
          let cacheRead = 0;
          let cacheWrite = 0;
          let totalCost = 0;
          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              tokensIn += m.usage.input;
              tokensOut += m.usage.output;
              cacheRead += m.usage.cacheRead;
              cacheWrite += m.usage.cacheWrite;
              totalCost += m.usage.cost.total;
            }
          }

          const branch = footerData.getGitBranch();
          const modelLabel = ctx.model?.id ?? "no-model";
          const currentLevel = thinkingLevel;
          const think = THINKING[currentLevel] ?? THINKING.off;

          // ── Build sections ───────────────────────────────────────
          const sections: string[] = [];

          // 1. Model
          sections.push(
            pill(theme, "toolPendingBg",
              theme.fg("accent", ICONS.model) + " " + theme.fg("muted", modelLabel),
            ),
          );

          // 2. Current folder
          sections.push(
            pill(theme, "userMessageBg",
              theme.fg("success", ICONS.folder) + " " + theme.fg("muted", folderDisplay),
            ),
          );

          // 3. Git branch
          if (branch) {
            sections.push(
              pill(theme, "toolSuccessBg",
                theme.fg("success", ICONS.git) + " " + theme.fg("muted", branch),
              ),
            );
          }

          // 4. Token stats
          sections.push(
            pill(theme, "userMessageBg",
              theme.fg("warning", ICONS.tokensIn + fmtTokens(tokensIn)) +
                " " +
                theme.fg("dim", ICONS.tokensOut + fmtTokens(tokensOut)),
            ),
          );

          // 5. Cache
          if (cacheRead > 0) {
            const totalInput = cacheRead + tokensIn;
            const hitRate = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0;
            const cacheColor: ThemeColor = hitRate >= 30 ? "text" : "dim";
            const cacheBg: ThemeBg = hitRate >= 30 ? "toolSuccessBg" : "selectedBg";
            sections.push(
              pill(theme, cacheBg,
                theme.fg(cacheColor, ICONS.cache + fmtTokens(cacheRead)) +
                  " " +
                  theme.fg("dim", hitRate + "%"),
              ),
            );
          }

          // 6. Context usage
          const ctxUsage = ctx.getContextUsage();
          const ctxWindow = ctx.model?.contextWindow;
          if (ctxUsage?.tokens && ctxWindow && ctxWindow > 0) {
            const pct = Math.round((ctxUsage.tokens / ctxWindow) * 100);
            const used = fmtTokens(ctxUsage.tokens);
            const total = fmtTokens(ctxWindow);
            const ctxColor: ThemeColor = "text";
            const ctxBg: ThemeBg = pct > 80 ? "toolErrorBg" : pct > 50 ? "toolPendingBg" : "toolSuccessBg";
            sections.push(
              pill(theme, ctxBg,
                theme.fg(ctxColor, ICONS.context + " " + used + "/" + total) +
                  " " +
                  theme.fg("dim", "(" + pct + "%)"),
              ),
            );
          }

          // 7. Cost
          sections.push(
            pill(theme, "selectedBg",
              theme.fg("mdHeading", ICONS.cost + "$" + totalCost.toFixed(3)),
            ),
          );

          // 8. Thinking level
          const thinkBg: ThemeBg =
            currentLevel === "xhigh" ? "toolErrorBg" :
            currentLevel === "high" ? "toolPendingBg" :
            "userMessageBg";
          sections.push(
            pill(theme, thinkBg,
              theme.fg(think.color, ICONS.thinking + " " + think.icon + " " + currentLevel),
            ),
          );

          // ── Join with separator ─────────────────────────────────
          let sep = theme.fg("dim", " │ ");
          let line = sections.join(sep);
          if (visibleWidth(line) > width) {
            sep = theme.fg("dim", "│");
            line = sections.join(sep);
          }

          // Progressively drop sections until the line fits.
          let pruned = [...sections];
          if (visibleWidth(line) > width) {
            pruned = pruned.filter((s) => !s.includes(ICONS.context));
            line = pruned.join(sep);
          }
          if (visibleWidth(line) > width) {
            pruned = pruned.filter((s) => !s.includes(ICONS.cache));
            line = pruned.join(sep);
          }
          if (visibleWidth(line) > width) {
            const costIdx = pruned.findIndex((s) => s.includes(ICONS.cost));
            if (costIdx >= 0) {
              pruned.splice(costIdx, 1);
              line = pruned.join(sep);
            }
          }
          if (visibleWidth(line) > width) {
            const tokIdx = pruned.findIndex((s) => s.includes(ICONS.tokensIn));
            if (tokIdx >= 0) {
              pruned.splice(tokIdx, 1);
              line = pruned.join(sep);
            }
          }
          if (visibleWidth(line) > width) {
            const thinkIdx = pruned.findIndex((s) => s.includes(ICONS.thinking));
            if (thinkIdx >= 0) {
              pruned.splice(thinkIdx, 1);
              line = pruned.join(sep);
            }
          }
          if (visibleWidth(line) > width) {
            const gitIdx = pruned.findIndex((s) => s.includes(ICONS.git));
            if (gitIdx >= 0) {
              pruned.splice(gitIdx, 1);
              line = pruned.join(sep);
            }
          }
          if (visibleWidth(line) > width) {
            const folderIdx = pruned.findIndex((s) => s.includes(ICONS.folder));
            if (folderIdx >= 0) {
              pruned.splice(folderIdx, 1);
              line = pruned.join(sep);
            }
          }

          return [truncateToWidth(line, width)];
        },
      };
    });
  });

  // Toggle command
  pi.registerCommand("colorful", {
    description: "Toggle the colorful footer on/off",
    handler: async (_args, ctx) => {
      if (enabled) {
        ctx.ui.setFooter(undefined);
        // Reset working message + indicator to pi defaults
        ctx.ui.setWorkingMessage(undefined);
        ctx.ui.setWorkingIndicator(undefined);
        enabled = false;
        ctx.ui.notify("Default footer restored", "info");
      } else {
        ctx.ui.notify("Use /reload to re-enable the colorful footer", "info");
      }
    },
  });
};
