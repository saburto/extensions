import { execFile, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Thin wrapper around the `notify-fullscreen` binary
 * (https://github.com/saburto/notify-fullscreen).
 */

/** Parameters for one fullscreen notification. */
export type NotifyRequest = {
  message: string;
  /** Yes/No dialog: the user's choice becomes the tool's answer. */
  confirm?: boolean;
  /** After dismissal, return focus to the triggering window/tmux pane. */
  refocus?: boolean;
  /** Background dim opacity, 0.0-1.0 (default 0.85 in the binary). */
  opacity?: number;
  /** Message font size in pixels (default is screen-based). */
  fontSize?: number;
  /** Primary button label ("OK", or "Yes" in confirm mode). */
  okLabel?: string;
  /** Secondary button label (confirm mode only). */
  noLabel?: string;
};

export type NotifyOutcome =
  | { ok: true; answer: "yes" | "no" | "ack" }
  | { ok: false; reason: "error" | "timeout"; detail: string };

export type NotifyHandle = { child: ChildProcess; done: Promise<NotifyOutcome> };

/** Locates the notify-fullscreen binary: env override > ~/.local/bin > $PATH. */
export function resolveBinaryPath(): string | null {
  const fromEnv = process.env.NOTIFY_FULLSCREEN_BIN?.trim();
  if (fromEnv) return fromEnv;

  const local = join(homedir(), ".local", "bin", "notify-fullscreen");
  if (existsSync(local)) return local;

  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = join(dir, "notify-fullscreen");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Whether notify-fullscreen can run in this environment.
 * Set PI_NOTIFY_FORCE=1 to skip the platform/display checks (e.g. tests).
 */
export function checkSupport(): { ok: boolean; reason: string } {
  if ((process.env.PI_NOTIFY_FORCE ?? "0") === "1") {
    return resolveBinaryPath()
      ? { ok: true, reason: "" }
      : { ok: false, reason: "notify-fullscreen not found (set NOTIFY_FULLSCREEN_BIN)" };
  }
  if (process.platform !== "linux") {
    return { ok: false, reason: "notify-fullscreen is Linux/X11-only" };
  }
  if (!process.env.DISPLAY) {
    return { ok: false, reason: "no $DISPLAY (needs an X11/Xwayland session)" };
  }
  if (!resolveBinaryPath()) {
    return {
      ok: false,
      reason:
        "notify-fullscreen not found — install it (make install puts it in ~/.local/bin) or set NOTIFY_FULLSCREEN_BIN",
    };
  }
  return { ok: true, reason: "" };
}

/**
 * Spawns notify-fullscreen. The message goes through stdin (the binary's
 * `-` mode), so special characters and leading dashes are safe.
 * The returned promise resolves when the overlay is dismissed.
 */
export function runNotify(req: NotifyRequest, opts: { timeoutMs?: number } = {}): NotifyHandle {
  const bin = resolveBinaryPath() ?? "notify-fullscreen";
  const args: string[] = [];
  if (req.confirm) args.push("-c");
  if (req.refocus) args.push("-r");
  if (req.opacity !== undefined) args.push("-o", String(req.opacity));
  if (req.fontSize !== undefined) args.push("-f", String(req.fontSize));
  if (req.okLabel) args.push("--ok-label", req.okLabel);
  if (req.noLabel) args.push("--no-label", req.noLabel);
  args.push("-"); // read message from stdin

  const child = execFile(bin, args);
  child.stdin?.on("error", () => {
    /* EPIPE if the binary exits before reading stdin — the exit event reports it */
  });

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (opts.timeoutMs && opts.timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, opts.timeoutMs);
  }

  const done = new Promise<NotifyOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: NotifyOutcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(outcome);
    };
    child.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      finish({
        ok: false,
        reason: "error",
        detail: e.code === "ENOENT" ? `binary not found: ${bin}` : e.message,
      });
    });
    // Exit codes: 0 OK/Yes · 1 No/Esc · 2 usage · 3 runtime error · 130 interrupted
    child.on("exit", (code) => {
      if (timedOut) return finish({ ok: false, reason: "timeout", detail: `timed out after ${opts.timeoutMs}ms` });
      if (req.confirm) {
        if (code === 0) return finish({ ok: true, answer: "yes" });
        if (code === 1) return finish({ ok: true, answer: "no" });
      } else if (code === 0 || code === 1) {
        return finish({ ok: true, answer: "ack" });
      }
      finish({ ok: false, reason: "error", detail: `exit code ${code}` });
    });
  });

  child.stdin?.write(req.message.endsWith("\n") ? req.message : `${req.message}\n`);
  child.stdin?.end();

  return { child, done };
}