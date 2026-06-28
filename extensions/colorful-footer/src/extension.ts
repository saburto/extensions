/**
 * Colorful Footer Extension — replaces the default footer with a vibrant,
 * icon-rich status bar using emoji icons and theme-colored backgrounds.
 *
 * Configurable via JSON files:
 *   ~/.pi/agent/colorful-footer.json  (global)
 *   .pi/colorful-footer.json          (project-local)
 *
 * Supports icon overrides, color customization, conditional rules based on
 * model matching, and section visibility control.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  loadConfig,
  resolveConfig,
  resolveSections,
  resolveThinking,
  resolveFg,
  resolveBg,
  getTokensOutIcon,
  type ColorfulFooterConfig,
  type EffectiveSection,
  type ThinkingLevelConfig,
} from "./config";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const THINKING_BG: Record<string, string> = {
  off:      "userMessageBg",
  minimal:  "userMessageBg",
  low:      "userMessageBg",
  medium:   "toolPendingBg",
  high:     "toolPendingBg",
  xhigh:    "toolErrorBg",
};

// ── Colorful Working Indicator ───────────────────────────────────────────

function makeWorkingMessage(theme: Theme): string {
  return theme.bg("toolPendingBg",
    " " + theme.fg("accent", "\u2699\uFE0F") + " " + theme.fg("text", "Working...") + " ",
  );
}

function makeSpinner(theme: Theme) {
  const cols: ThemeColor[] = ["accent", "success", "warning", "thinkingHigh", "thinkingMedium"];
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  return {
    frames: frames.map((f, i) => theme.fg(cols[i % cols.length], f)),
    intervalMs: 80,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function pill(theme: Theme, bgColor: string | undefined, fallback: string, content: string): string {
  return resolveBg(bgColor, theme, fallback, " " + content + " ");
}

// ── Section Rendering Helpers ────────────────────────────────────────────

interface FooterContext {
  sections: EffectiveSection[];
  tokensOutIcon: string;
  thinking: Record<string, ThinkingLevelConfig>;
  separator: string;
  separatorColor: string;
  config: ColorfulFooterConfig;
}

/** Get colored icon (respects hex or theme color, falls back to theme name). */
function iconFg(sec: EffectiveSection, theme: Theme, fallback: string, text?: string): string {
  return resolveFg(sec.fgColor, theme, fallback, text ?? sec.icon);
}

/** Get colored label text (respects hex or theme color, defaults to muted). */
function labelFg(sec: EffectiveSection, theme: Theme, text: string): string {
  return resolveFg(sec.labelColor, theme, "muted", text);
}

// ── Extension ────────────────────────────────────────────────────────────

export const colorfulFooter = (pi: ExtensionAPI) => {
  let thinkingLevel = "off";
  let enabled = false;
  let requestRender: (() => void) | null = null;
  let baseConfig: ColorfulFooterConfig = loadConfig(process.cwd());

  // Re-resolve when model changes
  let modelId = "";

  pi.on("model_select", async (event) => {
    modelId = event.model.id;
    requestRender?.();
  });

  pi.on("thinking_level_select", async (event) => {
    thinkingLevel = event.level;
    requestRender?.();
  });

  pi.on("session_start", async (_event, ctx) => {
    if (enabled) return;

    enabled = true;
    thinkingLevel = pi.getThinkingLevel();
    modelId = ctx.model?.id ?? "";

    // Reload config at session start
    baseConfig = loadConfig(ctx.cwd);

    // Compute folder display
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
          // Resolve effective config for current model
          const cfg = resolveConfig(baseConfig, modelId);
          const sections = resolveSections(cfg);
          const thinking = resolveThinking(cfg);
          const sep = cfg.separator ?? " │ ";
          const sepColor = cfg.separatorColor ?? "dim";
          const tokOutIcon = getTokensOutIcon(cfg);

          // Build the footer context
          const fctx: FooterContext = {
            sections,
            tokensOutIcon: tokOutIcon,
            thinking,
            separator: sep,
            separatorColor: sepColor,
            config: cfg,
          };

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
          const think = thinking[currentLevel] ?? thinking.off;

          // ── Build sections in configured order ───────────────────
          const active: string[] = [];

          for (const sec of sections) {
            if (sec.hidden) continue;

            switch (sec.key) {
              // 1. Model
              case "model":
                active.push(
                  pill(theme, sec.bgColor, "toolPendingBg",
                    iconFg(sec, theme, "accent") + " " + labelFg(sec, theme, modelLabel),
                  ),
                );
                break;

              // 2. Folder
              case "folder":
                active.push(
                  pill(theme, sec.bgColor, "userMessageBg",
                    iconFg(sec, theme, "success") + " " + labelFg(sec, theme, folderDisplay),
                  ),
                );
                break;

              // 3. Git branch
              case "git":
                if (branch) {
                  active.push(
                    pill(theme, sec.bgColor, "toolSuccessBg",
                      iconFg(sec, theme, "success") + " " + labelFg(sec, theme, branch),
                    ),
                  );
                }
                break;

              // 4. Token stats
              case "tokens": {
                const inIcon = sec.icon;
                const outIcon = fctx.tokensOutIcon;
                const inFg = resolveFg(sec.fgColor, theme, "warning", inIcon + fmtTokens(tokensIn));
                const outFg = theme.fg("dim", outIcon + fmtTokens(tokensOut));
                active.push(
                  pill(theme, sec.bgColor, "userMessageBg", inFg + " " + outFg),
                );
                break;
              }

              // 5. Cache
              case "cache":
                if (cacheRead > 0) {
                  const totalInput = tokensIn + cacheRead + cacheWrite;
                  const hitRate = totalInput > 0 ? (cacheRead / totalInput) * 100 : 0;
                  const cacheColor = hitRate >= 30 ? "text" : "dim";
                  const cacheBg = hitRate >= 30 ? "toolSuccessBg" : "selectedBg";
                  active.push(
                    pill(theme, sec.bgColor, cacheBg,
                      iconFg(sec, theme, cacheColor) + " " +
                        labelFg(sec, theme, fmtTokens(cacheRead) + " " + hitRate.toFixed(1) + "%"),
                    ),
                  );
                }
                break;

              // 6. Context usage
              case "context": {
                const ctxUsage = ctx.getContextUsage();
                const ctxWindow = ctx.model?.contextWindow;
                if (ctxUsage?.tokens && ctxWindow && ctxWindow > 0) {
                  const pct = Math.round((ctxUsage.tokens / ctxWindow) * 100);
                  const used = fmtTokens(ctxUsage.tokens);
                  const total = fmtTokens(ctxWindow);
                  const ctxBg = pct > 80 ? "toolErrorBg" : pct > 50 ? "toolPendingBg" : "toolSuccessBg";
                  active.push(
                    pill(theme, sec.bgColor, ctxBg,
                      iconFg(sec, theme, "text") + " " +
                        labelFg(sec, theme, used + "/" + total + " (" + pct + "%)"),
                    ),
                  );
                }
                break;
              }

              // 7. Cost
              case "cost":
                active.push(
                  pill(theme, sec.bgColor, "selectedBg",
                    iconFg(sec, theme, "mdHeading") + " " +
                      labelFg(sec, theme, "$" + totalCost.toFixed(3)),
                  ),
                );
                break;

              // 8. Thinking level
              case "thinking": {
                const tBg = sec.bgColor ?? THINKING_BG[currentLevel] ?? "userMessageBg";
                active.push(
                  pill(theme, tBg, "userMessageBg",
                    iconFg(sec, theme, think.color ?? "thinkingOff") + " " +
                      labelFg(sec, theme, (think.icon ?? "") + " " + currentLevel),
                  ),
                );
                break;
              }

              // 9. Extension statuses (from ctx.ui.setStatus in other extensions)
              case "statuses": {
                const extStatuses = footerData.getExtensionStatuses();
                if (extStatuses.size > 0) {
                  const entries = Array.from(extStatuses.entries())
                    .sort(([a], [b]) => a.localeCompare(b));
                  for (const [, text] of entries) {
                    // Sanitize: remove newlines/tabs, collapse spaces
                    const sanitized = text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
                    if (sanitized) {
                      // Use icon as prefix; status text preserves its own ANSI styling
                      active.push(
                        iconFg(sec, theme, "dim", sec.icon + " ") + sanitized,
                      );
                    }
                  }
                }
                break;
              }
            }
          }

          // ── Join with separator ─────────────────────────────────
          let sepStr = resolveFg(fctx.separatorColor, theme, "dim", fctx.separator);
          let line = active.join(sepStr);
          if (visibleWidth(line) > width) {
            sepStr = resolveFg(fctx.separatorColor, theme, "dim", "│");
            line = active.join(sepStr);
          }

          // Progressively drop sections until the line fits
          let pruned = [...active];
          // Drop order: statuses → context → cache → cost → tokens → thinking → git → folder → model
          const dropOrder = ["statuses", "context", "cache", "cost", "tokens", "thinking", "git", "folder"];
          for (const sectionKey of dropOrder) {
            if (visibleWidth(line) <= width) break;
            if (sectionKey === "statuses") {
              // Drop all status entries at once (there can be multiple)
              const statusSec = sections.find(ss => ss.key === "statuses");
              if (statusSec) {
                const filtered = pruned.filter(s => !s.includes(statusSec.icon));
                if (filtered.length < pruned.length) {
                  pruned = filtered;
                  line = pruned.join(sepStr);
                }
              }
            } else {
              const idx = pruned.findIndex((s) => {
                const sec = sections.find(ss => ss.key === sectionKey);
                if (!sec) return false;
                // Match by icon
                return s.includes(sec.icon);
              });
              if (idx >= 0) {
                pruned.splice(idx, 1);
                line = pruned.join(sepStr);
              }
            }
          }
          // Last resort: drop model (should rarely happen)
          if (visibleWidth(line) > width) {
            const modelSec = sections.find(s => s.key === "model");
            if (modelSec) {
              const idx = pruned.findIndex(s => s.includes(modelSec.icon));
              if (idx >= 0) {
                pruned.splice(idx, 1);
                line = pruned.join(sepStr);
              }
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
        ctx.ui.setWorkingMessage(undefined);
        ctx.ui.setWorkingIndicator(undefined);
        enabled = false;
        ctx.ui.notify("Default footer restored", "info");
      } else {
        ctx.ui.notify("Use /reload to re-enable the colorful footer", "info");
      }
    },
  });

  // Chat-based config: inject README as context and let the LLM guide the user
  pi.registerCommand("colorful-config", {
    description: "Chat-based guide to customize the colorful footer",
    handler: async (_args, ctx) => {
      const globalPath = join(homedir(), ".pi", "agent", "colorful-footer.json");
      const projectPath = join(ctx.cwd, ".pi", "colorful-footer.json");
      const hasGlobal = existsSync(globalPath);
      const hasProject = existsSync(projectPath);

      // Read our own README to avoid duplicating documentation
      const extDir = dirname(fileURLToPath(import.meta.url));
      const readmePath = join(extDir, "..", "README.md");
      let guide: string;
      if (existsSync(readmePath)) {
        guide = readFileSync(readmePath, "utf-8");
      } else {
        guide = `# Colorful Footer Configuration

## Config files
- Global: ~/.pi/agent/colorful-footer.json
- Project: .pi/colorful-footer.json

## Config schema
- \`icons\`: override emoji per section (model, folder, git, tokensIn, tokensOut, cache, context, cost, thinking)
- \`sections.<key>.hidden\`: true to hide a section
- \`sections.<key>.bgColor\`: theme name (selectedBg, userMessageBg, customMessageBg, toolPendingBg, toolSuccessBg, toolErrorBg) or hex RGB like "#1a2b3c"
- \`sections.<key>.fgColor\`: theme name (accent, success, error, warning, text, muted, dim, mdHeading, ...) or hex RGB
- \`sections.<key>.labelColor\`: theme name or hex RGB for the text label
- \`sections.<key>.order\`: integer sort order (lower = left)
- \`separator\`: string between sections (default " │ ")
- \`separatorColor\`: theme name or hex RGB for the separator
- \`thinking.off/minimal/low/medium/high/xhigh\`: { icon, color } per level
- \`rules[]\`: conditional overrides when model ID matches a glob pattern
  - \`models\`: ["claude-opus*", "deepseek*"]
  - \`priority\`: higher wins when multiple match
  - \`sections\`: same per-section overrides as above`;
      }

      if (hasProject) {
        const current = readFileSync(projectPath, "utf-8");
        pi.sendUserMessage(
          guide + "\n\n---\n\n" +
          `You already have a project-local config at \`${projectPath}\`:\n\n\`\`\`json\n${current}\n\`\`\`\n\n` +
          "What would you like to modify? " +
          "You can also say \"reset to defaults\" to start fresh."
        );
      } else if (hasGlobal) {
        const current = readFileSync(globalPath, "utf-8");
        pi.sendUserMessage(
          guide + "\n\n---\n\n" +
          `You have a global config at \`${globalPath}\`:\n\n\`\`\`json\n${current}\n\`\`\`\n\n` +
          "What would you like to modify? " +
          "You can also say \"reset to defaults\" to start fresh, or create a project-local override."
        );
      } else {
        pi.sendUserMessage(
          guide + "\n\n---\n\n" +
          "Please help me configure the colorful footer. " +
          "Read any existing config files, ask me questions about my preferences, " +
          "and edit the JSON config accordingly. " +
          "When I'm happy with the result, ask whether to save and run /reload."
        );
      }
    },
  });
};
