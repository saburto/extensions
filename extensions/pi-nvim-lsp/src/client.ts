/**
 * LSP Client — spawns a language server and communicates via JSON-RPC over stdio.
 *
 * Handles:
 *   - Process spawning & lifecycle
 *   - JSON-RPC message framing (Content-Length header)
 *   - Initialize handshake with client capabilities
 *   - Request/response correlation (pending request map)
 *   - Notification dispatch (diagnostics, progress, etc.)
 *   - File synchronization (didOpen, didChange, didSave, didClose)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { type ServerConfig } from "./config.js";
import type {
  Diagnostic,
  PublishDiagnosticsParams,
} from "./types.js";
import { addLogEntry, addStderrEntry } from "./logger.js";

// =============================================================================
// Types
// =============================================================================

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  method: string;
  timer: ReturnType<typeof setTimeout>;
}

interface OpenFile {
  version: number;
  languageId: string;
}

export type ClientStatus = "connecting" | "ready" | "error";

// =============================================================================
// Constants
// =============================================================================

/** Default timeout for LSP requests (ms) */
const REQUEST_TIMEOUT_MS = 30_000;

/** Timeout for initialize handshake (ms) */
const INIT_TIMEOUT_MS = 15_000;

/** Default warmup wait after initialization (ms) */
const WARMUP_MS = 500;

// =============================================================================
// Client Capabilities (what we tell the server we support)
// =============================================================================

const CLIENT_CAPABILITIES = {
  textDocument: {
    synchronization: { didSave: true, dynamicRegistration: false },
    hover: { contentFormat: ["markdown", "plaintext"], dynamicRegistration: false },
    definition: { dynamicRegistration: false, linkSupport: true },
    references: { dynamicRegistration: false },
    documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
    rename: { dynamicRegistration: false, prepareSupport: true },
    codeAction: {
      dynamicRegistration: false,
      codeActionLiteralSupport: {
        codeActionKind: {
          valueSet: ["quickfix", "refactor", "refactor.extract", "source", "source.organizeImports"],
        },
      },
    },
    formatting: { dynamicRegistration: false },
    publishDiagnostics: { relatedInformation: true, versionSupport: true },
  },
  workspace: {
    applyEdit: true,
    workspaceEdit: { documentChanges: true },
    configuration: true,
    workspaceFolders: true,
    symbol: { dynamicRegistration: false },
  },
};

// =============================================================================
// Language ID detection
// =============================================================================

const EXT_TO_LANG: Record<string, string> = {
  ".rs": "rust",
  ".ts": "typescript", ".tsx": "typescriptreact",
  ".js": "javascript", ".jsx": "javascriptreact",
  ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python", ".pyi": "python",
  ".go": "go", ".mod": "gomod", ".sum": "gosum", ".work": "gowork",
  ".lua": "lua",
  ".zig": "zig", ".zir": "zig",
  ".c": "c", ".cpp": "cpp", ".cc": "cpp", ".h": "c", ".hpp": "cpp",
  ".html": "html", ".htm": "html",
  ".css": "css", ".scss": "scss", ".less": "less",
  ".json": "json", ".jsonc": "jsonc",
  ".yaml": "yaml", ".yml": "yaml",
  ".md": "markdown", ".markdown": "markdown",
  ".sh": "bash", ".bash": "bash", ".zsh": "bash",
  ".tf": "terraform", ".tfvars": "terraform",
  ".nix": "nix",
  ".kt": "kotlin", ".kts": "kotlin",
  ".scala": "scala", ".sbt": "scala",
  ".ex": "elixir", ".exs": "elixir", ".eex": "elixir",
  ".elm": "elm",
  ".hs": "haskell", ".lhs": "haskell",
  ".rb": "ruby", ".erb": "ruby",
  ".java": "java",
  ".vue": "vue",
  ".graphql": "graphql", ".gql": "graphql",
  ".dockerfile": "dockerfile",
};

function detectLanguageId(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  // Special case: Dockerfile (no extension)
  if (filePath.endsWith("Dockerfile")) return "dockerfile";
  return EXT_TO_LANG[ext] ?? ext.slice(1);
}

// =============================================================================
// URI conversion
// =============================================================================

function fileToUri(filePath: string): string {
  const abs = resolve(filePath);
  return `file://${abs}`;
}

// =============================================================================
// LspClient
// =============================================================================

export class LspClient {
  readonly command: string;
  readonly cwd: string;
  readonly config: ServerConfig;

  private proc: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private messageBuffer = Buffer.alloc(0);
  private _status: ClientStatus = "connecting";

  // State
  readonly openFiles = new Map<string, OpenFile>();
  readonly diagnostics = new Map<string, PublishDiagnosticsParams>();
  diagnosticsVersion = 0;
  serverCapabilities: Record<string, unknown> = {};

  // Callbacks
  onDiagnostics?: (params: PublishDiagnosticsParams) => void;
  onError?: (error: Error) => void;

  // Progress tracking for project-aware servers.
  // When all work-done progress tokens complete (or after timeout),
  // the project is considered loaded.
  private projectLoaded!: Promise<void>;
  private resolveProjectLoaded!: () => void;
  private activeProgressTokens = new Set<string | number>();
  private projectLoadTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Max time to wait for project indexing before auto-resolving (ms) */
  private static PROJECT_LOAD_TIMEOUT_MS = 15_000;

  constructor(command: string, cwd: string, config: ServerConfig) {
    this.command = command;
    this.cwd = cwd;
    this.config = config;
    this.resetProjectLoaded();
  }

  /** Reset the project-loaded promise (called at startup and on reload). */
  private resetProjectLoaded(): void {
    this.activeProgressTokens.clear();
    if (this.projectLoadTimeout) clearTimeout(this.projectLoadTimeout);
    this.projectLoaded = new Promise((resolve) => {
      this.resolveProjectLoaded = () => {
        if (this.projectLoadTimeout) {
          clearTimeout(this.projectLoadTimeout);
          this.projectLoadTimeout = null;
        }
        resolve();
      };
    });
    // Auto-resolve after timeout in case the server doesn't use progress tokens
    this.projectLoadTimeout = setTimeout(
      () => this.resolveProjectLoaded(),
      LspClient.PROJECT_LOAD_TIMEOUT_MS,
    );
  }

  /** Wait for the server to finish loading the project (or timeout). */
  async waitForProjectLoaded(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    const promises: Promise<unknown>[] = [this.projectLoaded];
    if (signal) {
      promises.push(
        new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve(undefined), { once: true }),
        ),
      );
    }
    await Promise.race(promises);
  }

  get status(): ClientStatus {
    return this._status;
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  /**
   * Spawn the server process and perform the initialize handshake.
   */
  async start(): Promise<void> {
    const args = this.config.args ?? [];

    this.proc = spawn(this.command, args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.proc.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        this._status = "error";
        this.onError?.(new Error(`LSP server exited with code ${code}: ${this.command}`));
      }
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      addStderrEntry(this.command, chunk.toString("utf8"));
    });

    // Set up stdout reader for JSON-RPC messages
    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.messageBuffer = Buffer.concat([this.messageBuffer, chunk]);
      this.processBuffer();
    });

    // Initialize handshake
    const initParams = {
      processId: process.pid,
      rootUri: fileToUri(this.cwd),
      rootPath: this.cwd,
      capabilities: CLIENT_CAPABILITIES,
      initializationOptions: this.config.initOptions,
      workspaceFolders: [{ uri: fileToUri(this.cwd), name: this.cwd }],
    };

    try {
      const result = (await this.sendRequest("initialize", initParams, INIT_TIMEOUT_MS)) as {
        capabilities: Record<string, unknown>;
      };
      this.serverCapabilities = result.capabilities ?? {};

      this.sendNotification("initialized", {});

      // Send workspace configuration if settings are defined
      if (this.config.settings) {
        this.sendNotification("workspace/didChangeConfiguration", {
          settings: this.config.settings,
        });
      }

      this._status = "ready";

      // Brief warmup for all servers
      await new Promise((r) => setTimeout(r, WARMUP_MS));
    } catch (err) {
      this._status = "error";
      throw err;
    }
  }

  /**
   * Gracefully shutdown the server.
   */
  async shutdown(): Promise<void> {
    if (!this.proc) return;
    try {
      await this.sendRequest("shutdown", null, 5000);
      this.sendNotification("exit", {});
    } catch {
      // Force kill
    }
    this.proc.kill("SIGTERM");
    setTimeout(() => {
      this.proc?.kill("SIGKILL");
    }, 2000);
  }

  // ── JSON-RPC Protocol ────────────────────────────────────────────

  /**
   * Send a request and wait for the response.
   */
  sendRequest(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    const id = ++this.requestId;
    const message = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    logSend(this.command, method, id, message);
    this.write(message);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timed out: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, method, timer });
    });
  }

  /**
   * Send a notification (no response expected).
   */
  sendNotification(method: string, params: unknown): void {
    const message = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
    });
    logSend(this.command, method, undefined, message);
    this.write(message);
  }

  /**
   * Write a JSON-RPC message to the server's stdin.
   */
  private write(message: string): void {
    if (!this.proc?.stdin) return;
    const contentLength = Buffer.byteLength(message, "utf8");
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    this.proc.stdin.write(header);
    this.proc.stdin.write(message);
  }

  /**
   * Process the accumulated message buffer, extracting complete
   * JSON-RPC messages delimited by Content-Length headers.
   */
  private processBuffer(): void {
    while (this.messageBuffer.length > 0) {
      const headerEnd = this.messageBuffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const header = this.messageBuffer.toString("utf8", 0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) {
        // Malformed header, skip
        this.messageBuffer = this.messageBuffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = Number.parseInt(match[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.messageBuffer.length < messageEnd) return; // Incomplete

      const message = this.messageBuffer.toString("utf8", messageStart, messageEnd);
      this.messageBuffer = this.messageBuffer.subarray(messageEnd);

      try {
        const parsed = JSON.parse(message);
        logRecv(this.command, message);
        this.handleMessage(parsed);
      } catch {
        // Malformed JSON, skip
      }
    }
  }

  /**
   * Dispatch an incoming JSON-RPC message.
   */
  private handleMessage(msg: Record<string, unknown>): void {
    // Response to a pending request
    if (msg.id !== undefined && msg.id !== null) {
      const id = msg.id as number;
      const pending = this.pendingRequests.get(id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pendingRequests.delete(id);

      if (msg.error) {
        const err = msg.error as { code: number; message: string };
        pending.reject(new Error(`LSP error ${err.code}: ${err.message}`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Notification
    const method = msg.method as string;
    if (!method) return;

    // Server requests (have id, need response)
    if (msg.id !== undefined && msg.id !== null) {
      // These are handled in handleMessage via the pendingRequests path,
      // but some server requests we need to respond to explicitly.
      if (method === "window/workDoneProgress/create") {
        // Accept progress token creation
        const response = JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          result: null,
        });
        this.write(response);
        return;
      }
      return;
    }

    switch (method) {
      case "textDocument/publishDiagnostics":
        this.handlePublishDiagnostics(msg.params as PublishDiagnosticsParams);
        break;
      case "window/showMessage":
        // Log or ignore
        break;
      case "window/logMessage":
        // Log or ignore
        break;
      case "$/progress":
        this.handleProgress(msg.params as { token: string | number; value?: { kind?: string } });
        break;
      case "language/status":
        // Ignored; we use $/progress tokens instead
        break;
    }
  }

  /**
   * Handle incoming diagnostics from the server.
   */
  private handlePublishDiagnostics(params: PublishDiagnosticsParams): void {
    this.diagnosticsVersion++;
    this.diagnostics.set(params.uri, params);
    this.onDiagnostics?.(params);
  }

  /**
   * Handle $/progress notifications to track server indexing state.
   * When all progress tokens are completed, the project is considered loaded.
   */
  private handleProgress(params: { token: string | number; value?: { kind?: string } }): void {
    if (!params.value) return;
    if (params.value.kind === "begin") {
      this.activeProgressTokens.add(params.token);
    } else if (params.value.kind === "end") {
      this.activeProgressTokens.delete(params.token);
      if (this.activeProgressTokens.size === 0) {
        this.resolveProjectLoaded();
      }
    }
  }

  // ── File Synchronization ─────────────────────────────────────────

  /**
   * Notify the server that a file was opened.
   */
  async openFile(filePath: string): Promise<void> {
    const uri = fileToUri(filePath);
    const languageId = detectLanguageId(filePath);

    this.openFiles.set(uri, { version: 0, languageId });

    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 0,
        text: "", // Server reads from disk
      },
    });
  }

  /**
   * Notify the server that file content changed.
   */
  notifyChange(filePath: string, content: string): void {
    const uri = fileToUri(filePath);
    const existing = this.openFiles.get(uri);
    const version = (existing?.version ?? 0) + 1;

    this.openFiles.set(uri, { version, languageId: existing?.languageId ?? detectLanguageId(filePath) });

    this.sendNotification("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    });
  }

  /**
   * Notify the server that the file was saved.
   */
  notifySave(filePath: string): void {
    const uri = fileToUri(filePath);
    this.sendNotification("textDocument/didSave", {
      textDocument: { uri },
    });
  }

  /**
   * Notify the server that a file was closed.
   */
  notifyClose(filePath: string): void {
    const uri = fileToUri(filePath);
    this.openFiles.delete(uri);
    this.diagnostics.delete(uri);
    this.sendNotification("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  // ── Diagnostics ──────────────────────────────────────────────────

  /**
   * Get cached diagnostics for a file.
   */
  getDiagnostics(filePath: string): Diagnostic[] {
    const uri = fileToUri(filePath);
    const entry = this.diagnostics.get(uri);
    return entry?.diagnostics ?? [];
  }
}

// =============================================================================
// Logging helpers
// =============================================================================

function logSend(command: string, method: string, id: number | undefined, raw: string): void {
  addLogEntry({
    timestamp: Date.now(),
    client: command,
    direction: "send",
    method,
    id,
    size: Buffer.byteLength(raw, "utf8"),
    summary: raw.slice(0, 100),
  });
}

function logRecv(command: string, raw: string): void {
  let method: string | undefined;
  let id: number | undefined;
  try {
    const parsed = JSON.parse(raw);
    method = parsed.method;
    id = parsed.id;
  } catch { /* ignore parse errors */ }

  addLogEntry({
    timestamp: Date.now(),
    client: command,
    direction: "recv",
    method,
    id,
    size: Buffer.byteLength(raw, "utf8"),
    summary: raw.slice(0, 100),
  });
}
