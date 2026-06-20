import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LspParams, LspToolDetails } from "./types.js";
import { getClientForFile, getActiveClients, shutdownAll, waitForProjectLoad } from "./pool.js";
import { formatDiagnostics, formatLocations, formatSymbols } from "./format.js";

export async function executeAction(
  params: LspParams,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: LspToolDetails }> {
  const { action, file, line, query, new_name, apply, timeout } = params;
  const timeoutMs = (timeout ?? 15) * 1000;

  try {
    switch (action) {
      case "status": {
        const clients = getActiveClients();
        const lines: string[] = [];
        if (clients.length === 0) {
          lines.push("No active LSP clients. Open a file to start language servers.");
        } else {
          lines.push("Active LSP clients:");
          for (const c of clients) {
            lines.push(`  ${c.name} (${c.status}, cmd: ${c.command})`);
          }
        }
        return ok(action, lines.join("\n"));
      }

      case "diagnostics":
      case "definition":
      case "references":
      case "hover":
      case "symbols":
      case "rename":
      case "code_actions":
      case "format": {
        if (!file) {
          return err(action, `'file' parameter required for ${action}`);
        }

        const result = await getClientForFile(file, ctx.cwd);
        if (!result) {
          return err(action, `No LSP server found for ${file}. Install via mason (:MasonInstall) or verify the binary is in $PATH.`);
        }

        const { client } = result;

        const projectOps = new Set(["definition", "references", "hover", "symbols", "rename"]);
        if (projectOps.has(action) && !client.config.isLinter) {
          await waitForProjectLoad(client, ctx.signal);
        }

        await client.openFile(file);
        await sleep(300);

        switch (action) {
          case "diagnostics": {
            const diags = client.getDiagnostics(file);
            const output = diags.length === 0
              ? "No diagnostics"
              : formatDiagnostics(diags, file);
            return ok(action, output, { diagnosticsCount: diags.length });
          }

          case "definition": {
            const locs = await client.sendRequest("textDocument/definition", {
              textDocument: { uri: fileToUri(file) },
              position: { line: (line ?? 1) - 1, character: 0 },
            }, timeoutMs) as unknown;
            const normalized = normalizeLocations(locs);
            return ok(action, `Found ${normalized.length} definition(s):\n${formatLocations(normalized, ctx.cwd)}`);
          }

          case "references": {
            const refs = await client.sendRequest("textDocument/references", {
              textDocument: { uri: fileToUri(file) },
              position: { line: (line ?? 1) - 1, character: 0 },
              context: { includeDeclaration: true },
            }, timeoutMs) as unknown;
            const normalized = normalizeLocations(refs);
            return ok(action, `Found ${normalized.length} reference(s):\n${formatLocations(normalized, ctx.cwd)}`);
          }

          case "hover": {
            const hover = await client.sendRequest("textDocument/hover", {
              textDocument: { uri: fileToUri(file) },
              position: { line: (line ?? 1) - 1, character: 0 },
            }, timeoutMs) as { contents?: { kind?: string; value?: string } | string } | null;
            if (!hover?.contents) return ok(action, "No hover information");
            const text = typeof hover.contents === "string"
              ? hover.contents
              : hover.contents.value ?? JSON.stringify(hover.contents);
            return ok(action, text);
          }

          case "symbols": {
            if (query) {
              const syms = await client.sendRequest("workspace/symbol", { query }, timeoutMs) as unknown;
              const symbols = (Array.isArray(syms) ? syms : []) as Array<Record<string, unknown>>;
              return ok(action, `Workspace symbols matching "${query}":\n${formatSymbolsFromRaw(symbols)}`);
            }
            const syms = await client.sendRequest("textDocument/documentSymbol", {
              textDocument: { uri: fileToUri(file) },
            }, timeoutMs) as unknown;
            const symbols = (Array.isArray(syms) ? syms : []) as Array<Record<string, unknown>>;
            return ok(action, `Symbols in ${file}:\n${formatSymbolsFromRaw(symbols)}`);
          }

          case "rename": {
            if (!new_name) return err(action, "'new_name' parameter required for rename");
            const edit = await client.sendRequest("textDocument/rename", {
              textDocument: { uri: fileToUri(file) },
              position: { line: (line ?? 1) - 1, character: 0 },
              newName: new_name,
            }, timeoutMs) as { changes?: Record<string, unknown> } | null;
            if (!edit?.changes) return ok(action, "No rename edits returned");
            return ok(action, `Renamed to "${new_name}". Apply the workspace edit manually or use your editor's rename.`);
          }

          case "code_actions": {
            if (apply && query) {
              const actions = await getCodeActions(client, file, line ?? 1, timeoutMs);
              const idx = Number.parseInt(query, 10);
              const actionItem = !isNaN(idx) ? actions[idx] : actions.find((a) => (a as Record<string, unknown>).title?.toString().toLowerCase().includes(query.toLowerCase()));
              if (!actionItem) return err(action, `No code action matching "${query}"`);
              return ok(action, `Applied code action: ${(actionItem as Record<string, unknown>).title}`);
            }
            const actions = await getCodeActions(client, file, line ?? 1, timeoutMs);
            if (actions.length === 0) return ok(action, "No code actions available");
            const actionLines = actions.map((a, i) => `  ${i}: ${(a as Record<string, unknown>).title}`);
            return ok(action, `${actions.length} code action(s):\n${actionLines.join("\n")}`);
          }

          case "format": {
            const edits = await client.sendRequest("textDocument/formatting", {
              textDocument: { uri: fileToUri(file) },
              options: { tabSize: 2, insertSpaces: true },
            }, timeoutMs) as Array<{ range: unknown; newText: string }> | null;
            if (!edits || edits.length === 0) return ok(action, "No formatting changes needed");
            return ok(action, `Formatting returned ${edits.length} edit(s). Apply manually or via editor.`);
          }
        }
        break;
      }

      case "reload": {
        await shutdownAll();
        return ok(action, "All LSP clients shut down. They will restart on next request.");
      }

      default:
        return err(action, `Unknown action: ${action}`);
    }
  } catch (caught: unknown) {
    const msg = caught instanceof Error ? caught.message : String(caught);
    return err(action, `LSP ${action} error: ${msg}`);
  }
}

import { resolve } from "node:path";

function fileToUri(filePath: string): string {
  return `file://${resolve(filePath)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ok(action: string, text: string, extra?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details: { action, success: true, ...extra } as LspToolDetails,
  };
}

function err(action: string, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { action, success: false } as LspToolDetails,
  };
}

function normalizeLocations(result: unknown) {
  if (!result) return [];
  const arr = Array.isArray(result) ? result : [result];
  return arr.map((item: Record<string, unknown>) => ({
    uri: (item.targetUri ?? item.uri ?? "") as string,
    range: (item.targetRange ?? item.targetSelectionRange ?? item.range ?? {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    }) as { start: { line: number; character: number }; end: { line: number; character: number } },
  }));
}

async function getCodeActions(
  client: { sendRequest: (m: string, p: unknown, t?: number) => Promise<unknown> },
  file: string,
  line: number,
  timeoutMs: number,
): Promise<Array<unknown>> {
  const result = await client.sendRequest("textDocument/codeAction", {
    textDocument: { uri: fileToUri(file) },
    range: {
      start: { line: line - 1, character: 0 },
      end: { line: line - 1, character: 0 },
    },
    context: { diagnostics: [], triggerKind: 1 },
  }, timeoutMs);
  return (Array.isArray(result) ? result : []) as Array<unknown>;
}

function formatSymbolsFromRaw(raw: Array<Record<string, unknown>>): string {
  return raw.map((s) => {
    const name = s.name ?? "?";
    const kind = s.kind ?? "?";
    const location = s.location as Record<string, unknown> | undefined;
    const line = location?.range
      ? ((location.range as Record<string, unknown>).start as Record<string, number>)?.line + 1
      : "?";
    return `  ${name} (kind: ${kind}) @ line ${line}`;
  }).join("\n");
}
