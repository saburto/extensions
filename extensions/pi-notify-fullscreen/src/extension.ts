import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ChildProcess } from "node:child_process";

import {
  checkSupport,
  runNotify,
  type NotifyHandle,
  type NotifyOutcome,
  type NotifyRequest,
} from "./notifier";

/**
 * pi-notify-fullscreen — fullscreen notifications via `notify-fullscreen`.
 *
 * - `notify` tool: the agent can alert the user now, later (delay_seconds),
 *   when the current task settles (after_task), or ask a yes/no question
 *   and get the answer back (ask).
 * - Automatic notifications when the agent waits for human input
 *   (ui_prompt_start), so a user working elsewhere notices that pi is blocked.
 * - `/notify-fullscreen [--confirm] [--in 30s|5m|2h] [--after-task] [--no-refocus] <message>`
 *   command for direct use.
 *
 * Environment knobs:
 *   NOTIFY_FULLSCREEN_BIN    path override for the binary
 *   PI_NOTIFY_ON_PROMPT      1 (default: confirm/input/editor prompts) | all | 0
 *   PI_NOTIFY_PROMPT_REFOCUS 1 (default) | 0 — refocus on prompt alerts
 *   PI_NOTIFY_ON_SETTLED     0 (default) | 1 — also notify when pi goes idle
 *   PI_NOTIFY_COOLDOWN_MS    minimum gap between automatic notifications (default 3000)
 *   PI_NOTIFY_FORCE          1 to skip platform/$DISPLAY checks (testing)
 */

const MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;

/** Minimal structural view of the various CTX types, just what we need. */
type NotifyCtx = {
  hasUI?: boolean;
  ui?: { notify?: (message: string, kind?: "info" | "error" | "warning" | "success") => void };
};

const asCtx = (ctx: unknown): NotifyCtx => ctx as NotifyCtx;

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

type PromptNotifyMode = "off" | "important" | "all";
function promptNotifyMode(): PromptNotifyMode {
  const raw = (process.env.PI_NOTIFY_ON_PROMPT ?? "1").trim().toLowerCase();
  if (["0", "false", "off", "no", "never"].includes(raw)) return "off";
  if (["all", "everything", "2", "yes"].includes(raw)) return "all";
  return "important";
}

function cooldownMs(): number {
  const n = Number.parseInt(process.env.PI_NOTIFY_COOLDOWN_MS ?? "3000", 10);
  return Number.isFinite(n) && n >= 0 ? n : 3000;
}

function humanDuration(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  if (whole < 3600) {
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${m}m${s ? ` ${s}s` : ""}`;
  }
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  return `${h}h${m ? ` ${m}m` : ""}`;
}

/** Parses durations like "30", "30s", "5m", "2h", "1d" into milliseconds. */
function parseDuration(text: string | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/i.exec(text ?? "");
  if (!m) return null;
  const value = Number.parseFloat(m[1]);
  const unit = (m[2] ?? "s").toLowerCase();
  const ms =
    unit === "ms" ? value
    : unit === "s" ? value * 1_000
    : unit === "m" ? value * 60_000
    : unit === "h" ? value * 3_600_000
    : value * 86_400_000;
  if (!Number.isFinite(ms) || ms < 100 || ms > 7 * 86_400_000) return null;
  return Math.round(ms);
}

type ParsedCommand =
  | { message: string; confirm: boolean; refocus: boolean; afterTask: boolean; delayMs: number | null }
  | { error: string };

function parseCommandArgs(args: string): ParsedCommand {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const words: string[] = [];
  let confirm = false;
  let refocus = true;
  let afterTask = false;
  let delayMs: number | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "--confirm") confirm = true;
    else if (part === "--refocus") refocus = true;
    else if (part === "--no-refocus") refocus = false;
    else if (part === "--after-task") afterTask = true;
    else if (part === "--in") {
      const raw = parts[++i];
      const parsed = parseDuration(raw);
      if (parsed === null) return { error: `invalid --in duration "${raw ?? ""}" (use e.g. 30s, 5m, 2h)` };
      delayMs = parsed;
    } else {
      words.push(part);
    }
  }

  const message = words.join(" ").trim();
  if (!message) {
    return {
      error: "missing message. Usage: /notify-fullscreen [--confirm] [--in 30s|5m|2h] [--after-task] [--no-refocus] <message>",
    };
  }
  if (confirm && (delayMs !== null || afterTask)) {
    return { error: "--confirm cannot be combined with --in or --after-task" };
  }
  return { message, confirm, refocus, afterTask, delayMs };
}

export const piNotifyFullscreen = (pi: ExtensionAPI): void => {
  // --- session-scoped state (cleared on session_shutdown) ---
  const liveChildren = new Set<ChildProcess>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const pendingAfterTask: string[] = [];
  const warnedReasons = new Set<string>();
  let lastAutoAt = 0;
  let autoInFlight = false;

  const warnOnce = (ctx: NotifyCtx, reason: string) => {
    if (!warnedReasons.has(reason)) {
      warnedReasons.add(reason);
      if (ctx.hasUI) ctx.ui?.notify?.(`pi-notify-fullscreen: ${reason}`, "info");
      console.error(`[pi-notify-fullscreen] ${reason}`);
    }
  };

  const launch = (request: NotifyRequest): NotifyHandle => {
    const handle = runNotify(request);
    liveChildren.add(handle.child);
    void handle.done.then((outcome) => {
      liveChildren.delete(handle.child);
      if (!outcome.ok) console.error(`[pi-notify-fullscreen] notify-fullscreen failed: ${outcome.detail}`);
    });
    return handle;
  };

  /** Automatic notifications (prompts, settle): cooldown + single in-flight overlay. */
  const fireAuto = (request: NotifyRequest, ctx: NotifyCtx) => {
    if (autoInFlight) return;
    const now = Date.now();
    if (now - lastAutoAt < cooldownMs()) return;
    const support = checkSupport();
    if (!support.ok) {
      warnOnce(ctx, support.reason);
      return;
    }
    autoInFlight = true;
    lastAutoAt = now;
    const handle = launch(request);
    void handle.done.finally(() => {
      autoInFlight = false;
    });
  };

  /** Explicit notifications (tool/command/after-task): no cooldown, but still guard unsupported. */
  const fireGuaranteed = (request: NotifyRequest, ctx: NotifyCtx) => {
    const support = checkSupport();
    if (!support.ok) {
      warnOnce(ctx, support.reason);
      return;
    }
    launch(request);
  };

  const schedule = (request: NotifyRequest, delayMs: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      launch(request);
    }, delayMs);
    timers.add(timer);
  };

  const outcomeToText = (outcome: NotifyOutcome, ask: boolean, message: string): string => {
    if (!outcome.ok) {
      return `notify-fullscreen failed (${outcome.reason}): ${outcome.detail}`;
    }
    if (ask) return outcome.answer === "yes" ? 'User answered YES.' : 'User answered NO.';
    return `Fullscreen notification "${message}" was shown and acknowledged.`;
  };

  // -------------------------------------------------------------
  // `notify` tool — the agent's main way to reach the user.
  // -------------------------------------------------------------
  pi.registerTool({
    name: "notify",
    label: "Notify user",
    description:
      "Show a fullscreen notification on the user's screen (via notify-fullscreen), now or scheduled. " +
      "Use it when the user asked to be reminded later, when the user wants to know when a task finishes, " +
      "or when you need the user's attention or a yes/no decision.",
    promptSnippet: "Fullscreen user notifications",
    promptGuidelines: [
      "Use notify when the user asks to be reminded ('notify me in 10 minutes' → delay_seconds: 600), when they want a signal once a task finishes (after_task: true), or when only the user can decide something.",
      "Use ask: true for yes/no questions — the tool blocks and returns the user's answer. Don't combine ask with delay_seconds/after_task.",
      "Don't use notify for trivial progress updates the user didn't ask for.",
      "Focus returns to the terminal automatically after dismissal; pass refocus: false only if that would be disruptive.",
    ],
    parameters: Type.Object({
      message: Type.String({
        minLength: 1,
        maxLength: 4000,
        description: 'Text to show on screen. Use "\\n" for line breaks.',
      }),
      ask: Type.Optional(
        Type.Boolean({
          default: false,
          description:
            "Show Yes/No buttons and return the user's answer to you. Only use for decisions the task cannot continue without.",
        }),
      ),
      delay_seconds: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: MAX_DELAY_SECONDS,
          description: 'Show the notification after this many seconds ("in 5 minutes" → 300).',
        }),
      ),
      after_task: Type.Optional(
        Type.Boolean({
          default: false,
          description:
            "Show the notification when the current task finishes running (\"notify me when you're done\").",
        }),
      ),
      refocus: Type.Optional(
        Type.Boolean({
          default: true,
          description: "After dismissal, return keyboard focus to the terminal window (default: on).",
        }),
      ),
      opacity: Type.Optional(
        Type.Number({ minimum: 0.1, maximum: 1.0, description: "Background dim opacity, 0.1-1.0." }),
      ),
      font_size: Type.Optional(
        Type.Integer({ minimum: 8, maximum: 400, description: "Message font size in pixels." }),
      ),
      ok_label: Type.Optional(Type.String({ description: 'Primary button label (default "OK", or "Yes" with ask).' })),
      no_label: Type.Optional(Type.String({ description: 'Secondary button label (default "No", ask mode only).' })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const message = (params.message ?? "").trim();
      if (!message) {
        return {
          content: [{ type: "text" as const, text: "notify: message must not be empty." }],
          details: {},
        };
      }
      const ask = params.ask === true;
      const delay = params.delay_seconds ?? null;
      const after = params.after_task === true;

      if (delay !== null && after) {
        return {
          content: [
            { type: "text" as const, text: "notify: delay_seconds and after_task are mutually exclusive — pick one timing." },
          ],
          details: {},
        };
      }
      if (ask && (delay !== null || after)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "notify: ask requires an immediate notification (the answer must come back to you), so it can't be combined with delay_seconds or after_task.",
            },
          ],
          details: {},
        };
      }

      const request: NotifyRequest = {
        message,
        confirm: ask,
        refocus: params.refocus !== false,
        opacity: params.opacity,
        fontSize: params.font_size,
        okLabel: params.ok_label,
        noLabel: params.no_label,
      };

      const support = checkSupport();
      if (!support.ok) {
        return {
          content: [{ type: "text" as const, text: `notify: unavailable — ${support.reason}.` }],
          details: {},
        };
      }

      if (after) {
        pendingAfterTask.push(message);
        return {
          content: [
            {
              type: "text" as const,
              text: `Fullscreen notification will appear when the current task settles: "${message}"`,
            },
          ],
          details: {},
        };
      }

      if (delay !== null) {
        schedule(request, delay * 1000);
        return {
          content: [
            {
              type: "text" as const,
              text: `Scheduled a fullscreen notification in ${humanDuration(delay)}: "${message}"`,
            },
          ],
          details: {},
        };
      }

      // Immediate.
      const handle = runNotify(request);
      liveChildren.add(handle.child);
      const onAbort = () => handle.child.kill("SIGTERM");
      signal?.addEventListener("abort", onAbort, { once: true });
      const outcome = await handle.done;
      signal?.removeEventListener("abort", onAbort);
      liveChildren.delete(handle.child);

      return {
        content: [{ type: "text" as const, text: outcomeToText(outcome, ask, message) }],
        details: {},
      };
    },
  });

  // -------------------------------------------------------------
  // /notify-fullscreen command — for the user, directly.
  // -------------------------------------------------------------
  pi.registerCommand("notify-fullscreen", {
    description:
      "Fullscreen notification: /notify-fullscreen [--confirm] [--in 30s|5m|2h] [--after-task] [--no-refocus] <message>",
    handler: async (args, ctx) => {
      const parsed = parseCommandArgs(args);
      if ("error" in parsed) {
        ctx.ui.notify(parsed.error, "error");
        return;
      }

      const support = checkSupport();
      if (!support.ok) {
        ctx.ui.notify(`pi-notify-fullscreen: ${support.reason}`, "error");
        return;
      }

      const request: NotifyRequest = {
        message: parsed.message,
        confirm: parsed.confirm,
        refocus: parsed.refocus,
      };

      if (parsed.afterTask) {
        pendingAfterTask.push(parsed.message);
        ctx.ui.notify("Will show a fullscreen notification when the current task finishes.", "info");
        return;
      }
      if (parsed.delayMs !== null) {
        schedule(request, parsed.delayMs);
        ctx.ui.notify(`Will show a fullscreen notification in ${humanDuration(parsed.delayMs / 1000)}.`, "info");
        return;
      }

      const handle = runNotify(request);
      liveChildren.add(handle.child);
      void handle.done.then((outcome) => {
        liveChildren.delete(handle.child);
        if (!outcome.ok) ctx.ui.notify(`pi-notify-fullscreen: ${outcome.detail}`, "error");
      });
    },
  });

  // -------------------------------------------------------------
  // Events.
  // -------------------------------------------------------------

  // The agent is blocked waiting for the user (confirm/input/select/...).
  // Bring the user back with a fullscreen overlay.
  pi.on("ui_prompt_start", async (event, ctx) => {
    const mode = promptNotifyMode();
    if (mode === "off") return;
    if (mode === "important" && (event.kind === "select" || event.kind === "custom")) return;
    const title = event.title ? ` — ${event.title}` : "";
    fireAuto(
      {
        message: `Pi needs your input (${event.kind}${title})`,
        refocus: envFlag("PI_NOTIFY_PROMPT_REFOCUS", true),
      },
      asCtx(ctx),
    );
  });

  // Final idle: flush "after_task" notifications and optional settle ping.
  pi.on("agent_settled", async (event, ctx) => {
    if (pendingAfterTask.length > 0) {
      const message = pendingAfterTask.splice(0).join("\n\n");
      fireGuaranteed({ message, refocus: true }, asCtx(ctx));
    }
    if (envFlag("PI_NOTIFY_ON_SETTLED", false) && !event.aborted) {
      fireAuto({ message: "Pi has finished.", refocus: true }, asCtx(ctx));
    }
  });

  // Cleanup: drop pending timers and queued after-task notifications.
  // Live overlay windows are left alone so the user can still dismiss them
  // (a just-shown "after task" notification must survive in -p mode).
  pi.on("session_shutdown", async () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    pendingAfterTask.length = 0;
  });
};