import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Pi Launcher — Launches pi sessions, tools, or processes.
 *
 * A minimal scaffold extension. Replace the tool and event handlers
 * with your actual launcher logic.
 *
 * Features (stub):
 * - Registers a `launch` tool that the LLM can call
 * - Registers a `/launcher` command for status
 * - Shows a footer status widget
 */

export const piLauncher = (pi: ExtensionAPI): void => {
  // --- Register a custom tool ---
  pi.registerTool({
    name: "launch",
    label: "Launch",
    description: "Launch a pi session, tool, or process.",
    promptSnippet: "Launch pi sessions, tools, or processes",
    promptGuidelines: [
      "Use launch when the user asks to start a new pi session, a sub-agent, or a background process.",
    ],
    parameters: Type.Object({
      target: Type.String({
        description: "What to launch (e.g., 'session', 'tool', 'process')",
      }),
      config: Type.Optional(
        Type.String({
          description: "Optional configuration or arguments for the launch target",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // TODO: Replace with actual launch logic
      const { target, config } = params;

      if (ctx.hasUI) {
        ctx.ui.notify(`Launched: ${target}${config ? ` (${config})` : ""}`, "info");
      }

      return {
        content: [
          {
            type: "text",
            text: `[pi-launcher stub] Launch requested — target: "${target}"${config ? `, config: "${config}"` : ""}. Replace this stub with your actual logic.`,
          },
        ],
        details: {},
      };
    },
  });

  // --- Register a command ---
  pi.registerCommand("launcher", {
    description: "Show pi-launcher status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        "Pi Launcher v0.0.1 — stub extension. Edit extensions/pi-launcher/src/extension.ts to add your logic.",
        "info",
      );
    },
  });

  // --- Footer status ---
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("pi-launcher", ctx.ui.theme.fg("accent", "🚀 launcher"));
  });
};
