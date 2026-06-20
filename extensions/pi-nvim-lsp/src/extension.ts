/**
 * pi-nvim-lsp — LSP extension powered by mason + nvim-lspconfig.
 *
 * Spawns LSP servers directly via JSON-RPC over stdio.
 * Uses mason registry for binary resolution and nvim-lspconfig
 * for server configurations. No Neovim dependency at runtime.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isWriteToolResult, isEditToolResult } from "@earendil-works/pi-coding-agent";
import { lspSchema, type LspParams, type LspToolDetails } from "./types.js";
import { getClientForFile, getActiveClients, shutdownAll } from "./pool.js";
import { getLogEntries, type LogEntry } from "./logger.js";
import { formatDiagnostics } from "./format.js";
import { executeAction } from "./actions.js";

export const piNvimLsp = (pi: ExtensionAPI): void => {
  pi.registerTool({
    name: "lsp",
    label: "LSP",
    description:
      "Query Language Server Protocol servers. Get diagnostics, definitions, references, hover info, symbols, rename, code actions, and format files. Uses language servers installed via mason or available on $PATH.",
    promptSnippet: "Query LSP servers for diagnostics, definitions, references, hover, symbols, rename, code actions, and formatting",
    promptGuidelines: [
      "Use lsp diagnostics after writing or editing a file to check for newly introduced errors.",
      "Use lsp definition or lsp references to understand code structure before making changes.",
      "Use lsp rename to safely rename symbols. Pass symbol= and line= for precise targeting.",
      "Use lsp code_actions to discover and apply automated fixes like import organization.",
      "Use lsp hover to get type information and documentation for symbols at a position.",
      "Use lsp status to see which language servers are available.",
      "Prefer lsp diagnostics over running separate lint/type-check CLI commands when a language server is available.",
    ],
    parameters: lspSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return executeAction(params as LspParams, ctx);
    },
  });

  pi.registerCommand("lsp", {
    description: "Show LSP status",
    handler: async (_args, ctx) => {
      const clients = getActiveClients();
      if (clients.length === 0) {
        if (ctx.hasUI) ctx.ui.notify("No active LSP clients", "info");
      } else {
        const names = clients.map((c) => `${c.name} (${c.status})`).join(", ");
        if (ctx.hasUI) ctx.ui.notify(`LSP: ${names}`, "info");
      }
    },
  });

  pi.registerCommand("lsp-log", {
    description: "Show recent LSP JSON-RPC activity",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const entries = getLogEntries(40);
      if (entries.length === 0) {
        ctx.ui.notify("No LSP activity logged yet", "info");
        return;
      }
      const lines = entries.map((e: LogEntry) => {
        const time = new Date(e.timestamp).toISOString().slice(11, 23);
        if (e.direction === "stderr") {
          return `${time} ⚡ ${e.client.padEnd(20)} ${e.summary}`;
        }
        const arrow = e.direction === "send" ? "→" : "←";
        const method = e.method ?? "?";
        const kb = (e.size / 1024).toFixed(1);
        return `${time} ${arrow} ${e.client.padEnd(20)} ${method.padEnd(35)} ${kb}KB`;
      });
      const content = `Recent LSP activity (last ${entries.length} messages):\n\n${lines.join("\n")}`;
      await ctx.ui.editor("LSP Log", content);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus("pi-nvim-lsp", ctx.ui.theme.fg("accent", "🔌 lsp"));
    updateWidget(ctx);
    const interval = setInterval(() => updateWidget(ctx), 5000);
    pi.on("session_shutdown", () => clearInterval(interval));
  });

  pi.on("session_shutdown", async () => {
    await shutdownAll();
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!isWriteToolResult(event) && !isEditToolResult(event)) return;
    if (event.isError) return;
    const filePath = (event.input as Record<string, unknown>).path;
    if (typeof filePath !== "string") return;

    try {
      const result = await getClientForFile(filePath, ctx.cwd);
      if (!result) return;
      const { client } = result;
      await client.openFile(filePath);
      await new Promise((r) => setTimeout(r, 500));
      const diags = client.getDiagnostics(filePath);
      if (diags.length === 0) return;
      return {
        content: [
          ...(event.content ?? []),
          { type: "text" as const, text: `\n---\nLSP diagnostics:\n${formatDiagnostics(diags, filePath)}` },
        ],
      };
    } catch {
      // silently skip
    }
  });
};

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

function updateWidget(ctx: ExtensionContext): void {
  const clients = getActiveClients();
  if (clients.length === 0) {
    ctx.ui.setWidget("pi-nvim-lsp", undefined);
    return;
  }
  const lines = clients.map((c) => {
    const icon = c.status === "ready" ? "✓" : c.status === "error" ? "✗" : "◌";
    return `${icon} ${c.name} (${c.status})`;
  });
  ctx.ui.setWidget("pi-nvim-lsp", lines, { placement: "aboveEditor" });
}
