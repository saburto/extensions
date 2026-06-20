import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

// =============================================================================
// Tool Schema
// =============================================================================

export const LSP_ACTIONS = [
  "diagnostics",
  "definition",
  "references",
  "hover",
  "symbols",
  "rename",
  "code_actions",
  "format",
  "status",
  "reload",
] as const;

export type LspAction = (typeof LSP_ACTIONS)[number];

export const lspSchema = Type.Object({
  action: Type.Unsafe<LspAction>(Type.String({
    description: "LSP action: diagnostics, definition, references, hover, symbols, rename, code_actions, format, status, reload",
  })),
  file: Type.Optional(Type.String({
    description: "File path. Use * for workspace-wide diagnostics/symbols.",
  })),
  line: Type.Optional(Type.Number({
    description: "Line number (1-indexed)",
  })),
  symbol: Type.Optional(Type.String({
    description: "Symbol name on the line for disambiguation",
  })),
  query: Type.Optional(Type.String({
    description: "Search query for workspace symbols, or code-action selector",
  })),
  new_name: Type.Optional(Type.String({
    description: "New symbol name for rename actions",
  })),
  apply: Type.Optional(Type.Boolean({
    description: "Apply edits (default varies by action)",
  })),
  timeout: Type.Optional(Type.Number({
    description: "Request timeout in seconds (default: 15)",
  })),
});

export type LspParams = Static<typeof lspSchema>;

// =============================================================================
// Tool result details
// =============================================================================

export interface LspToolDetails {
  serverName?: string;
  action: string;
  success: boolean;
  request?: LspParams;
  [key: string]: unknown;
}

// =============================================================================
// LSP Protocol Types
// =============================================================================

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface Diagnostic {
  range: Range;
  severity?: 1 | 2 | 3 | 4; // error, warning, info, hint
  code?: string | number;
  source?: string;
  message: string;
}

export interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: Diagnostic[];
  version?: number | null;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: Array<{ textDocument: { uri: string; version?: number }; edits: TextEdit[] }>;
}

export interface CodeAction {
  title: string;
  kind?: string;
  edit?: WorkspaceEdit;
  command?: { title: string; command: string; arguments?: unknown[] };
  isPreferred?: boolean;
}

export interface SymbolInfo {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}
