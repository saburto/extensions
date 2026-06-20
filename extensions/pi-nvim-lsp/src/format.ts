/**
 * Format LSP results for LLM consumption.
 *
 * Phase 2 will add formatters for diagnostics, locations, hover, symbols, etc.
 * Phase 1 is a stub.
 */

import type { Diagnostic, Location, SymbolInfo } from "./types.js";

// =============================================================================
// Diagnostic Formatting
// =============================================================================

const SEVERITY_LABELS: Record<number, string> = {
  1: "ERROR",
  2: "WARNING",
  3: "INFO",
  4: "HINT",
};

/**
 * Format a single diagnostic as a one-line string.
 */
export function formatDiagnostic(d: Diagnostic, relPath: string): string {
  const severity = SEVERITY_LABELS[d.severity ?? 1] ?? "?";
  const line = (d.range?.start?.line ?? 0) + 1;
  const col = (d.range?.start?.character ?? 0) + 1;
  const code = d.code ? ` [${d.code}]` : "";
  const source = d.source ? ` (${d.source})` : "";
  return `  ${relPath}:${line}:${col}: ${severity}: ${d.message}${code}${source}`;
}

/**
 * Format diagnostics for a file, grouped by severity.
 */
export function formatDiagnostics(
  diagnostics: Diagnostic[],
  relPath: string,
): string {
  if (diagnostics.length === 0) return "OK";

  const errors = diagnostics.filter((d) => d.severity === 1);
  const warnings = diagnostics.filter((d) => d.severity === 2);
  const others = diagnostics.filter((d) => d.severity !== 1 && d.severity !== 2);

  const lines: string[] = [];

  if (errors.length > 0) {
    lines.push(`${errors.length} error(s):`);
    lines.push(...errors.map((d) => formatDiagnostic(d, relPath)));
  }
  if (warnings.length > 0) {
    lines.push(`${warnings.length} warning(s):`);
    lines.push(...warnings.map((d) => formatDiagnostic(d, relPath)));
  }
  if (others.length > 0) {
    lines.push(`${others.length} other(s):`);
    lines.push(...others.map((d) => formatDiagnostic(d, relPath)));
  }

  return lines.join("\n");
}

// =============================================================================
// Placeholder formatters (Phase 2+)
// =============================================================================

export function formatLocations(
  locations: Location[],
  _cwd: string,
): string {
  if (locations.length === 0) return "No results";
  return locations
    .map((l) => {
      const line = (l.range?.start?.line ?? 0) + 1;
      const col = (l.range?.start?.character ?? 0) + 1;
      return `  ${l.uri}:${line}:${col}`;
    })
    .join("\n");
}

export function formatSymbols(symbols: SymbolInfo[]): string {
  if (symbols.length === 0) return "No symbols found";
  return symbols
    .map((s) => {
      const line = (s.location?.range?.start?.line ?? 0) + 1;
      return `  ${s.name} (kind: ${s.kind}) @ line ${line}${s.containerName ? ` in ${s.containerName}` : ""}`;
    })
    .join("\n");
}
