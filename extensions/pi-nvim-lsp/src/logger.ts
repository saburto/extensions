/**
 * LSP activity log — ring buffer of recent JSON-RPC messages across all clients.
 */
export interface LogEntry {
  timestamp: number;
  client: string;
  direction: "send" | "recv" | "stderr";
  method?: string;
  id?: number;
  size: number;
  summary: string;
}

const MAX_LOG_ENTRIES = 500;
const logBuffer: LogEntry[] = [];

export function addLogEntry(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.shift();
}

export function addStderrEntry(command: string, text: string): void {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    addLogEntry({
      timestamp: Date.now(),
      client: command,
      direction: "stderr",
      size: Buffer.byteLength(trimmed, "utf8"),
      summary: trimmed.slice(0, 200),
    });
  }
}

export function getLogEntries(count = 50): LogEntry[] {
  return logBuffer.slice(-count);
}

export function getLogSummary(): string {
  const entries = logBuffer.slice(-20);
  if (entries.length === 0) return "No LSP activity yet.";

  return entries
    .map((e) => {
      const time = new Date(e.timestamp).toISOString().slice(11, 19);
      const arrow = e.direction === "send" ? "→" : "←";
      const method = e.method ?? "?";
      const size = e.size < 1024 ? `${e.size}B` : `${(e.size / 1024).toFixed(1)}KB`;
      return `${time} ${arrow} ${e.client} ${method} (${size})`;
    })
    .join("\n");
}
