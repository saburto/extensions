/**
 * LSP Client Pool — manages lifecycle of LspClient instances.
 *
 * One client per (server command + workspace root).
 * Clients are created on demand and shut down after idle timeout.
 */
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { LspClient } from "./client.js";
import { type ServerConfig, BUILTIN_SERVERS, getServersForFile } from "./config.js";
import { resolveBinary } from "./resolver.js";

// =============================================================================
// Types
// =============================================================================

interface PoolEntry {
  client: LspClient;
  config: ServerConfig;
  lastUsed: number;
}

// =============================================================================
// State
// =============================================================================

const clients = new Map<string, PoolEntry>();
const clientLocks = new Map<string, Promise<LspClient>>();

/** Default idle timeout: 5 minutes */
let idleTimeoutMs = 5 * 60 * 1000;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// Configuration
// =============================================================================

export function setIdleTimeout(ms: number): void {
  idleTimeoutMs = ms;
  if (ms > 0) startIdleChecker();
  else stopIdleChecker();
}

function startIdleChecker(): void {
  if (idleCheckInterval) return;
  idleCheckInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clients) {
      if (now - entry.lastUsed > idleTimeoutMs) {
        void shutdownClient(key);
      }
    }
  }, 60_000);
}

function stopIdleChecker(): void {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
}

// =============================================================================
// Workspace Root Detection
// =============================================================================

/**
 * Walk up from a file path looking for root marker files.
 * Returns the directory containing the first match, or cwd as fallback.
 */
export function findWorkspaceRoot(filePath: string, markers: string[], cwd: string): string | null {
  let dir = filePath;
  const root = "/";

  while (dir !== root) {
    for (const marker of markers) {
      if (existsSync(join(dir, marker))) {
        return dir;
      }
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  // Not found — some servers require a workspace root, others don't
  return null;
}

// =============================================================================
// Client Resolution
// =============================================================================

/**
 * Get or create an LSP client for a file.
 *
 * Resolution:
 *   1. Find matching server configs by file extension
 *   2. Resolve the binary (mason → project-local → $PATH)
 *   3. Find workspace root (or use cwd)
 *   4. Create/return pooled client keyed by (command + root)
 */
export async function getClientForFile(
  filePath: string,
  cwd: string,
): Promise<{ client: LspClient; config: ServerConfig } | null> {
  const ext = extname(filePath).toLowerCase();
  const servers = getServersForFile(BUILTIN_SERVERS, ext);

  // Try each matching server until one works
  for (const [name, config] of servers) {
    const binary = resolveBinary(config.command, cwd);
    if (!binary) continue;

    // Find workspace root
    const root = findWorkspaceRoot(filePath, config.rootMarkers, cwd) ?? cwd;

    // Pool key: command + workspace root
    const key = `${binary.path}::${root}`;

    // Return existing client if available
    const existing = clients.get(key);
    if (existing && existing.client.status === "ready") {
      existing.lastUsed = Date.now();
      return { client: existing.client, config };
    }

    // Avoid duplicate initialization
    const pending = clientLocks.get(key);
    if (pending) {
      const client = await pending;
      return { client, config };
    }

    // Create new client
    const initPromise = (async () => {
      const client = new LspClient(binary.path, root, config);
      try {
        await client.start();
      } catch (err) {
        clientLocks.delete(key);
        throw err;
      }
      clients.set(key, { client, config, lastUsed: Date.now() });
      clientLocks.delete(key);
      return client;
    })();

    clientLocks.set(key, initPromise);

    try {
      const client = await initPromise;
      return { client, config };
    } catch {
      // Try next server
      continue;
    }
  }

  return null;
}

/**
 * Get the number of active clients.
 */
export function getActiveClientCount(): number {
  return clients.size;
}

/**
 * Get info about all active clients.
 */
export function getActiveClients(): Array<{ name: string; status: string; command: string }> {
  return Array.from(clients.entries()).map(([_key, entry]) => ({
    name: entry.config.command,
    status: entry.client.status,
    command: entry.client.command,
  }));
}

/**
 * Wait for the project to be fully loaded by the LSP server.
 * For project-aware servers (jdtls, rust-analyzer), this waits for
 * $/progress tokens to complete (or times out after 15s).
 */
export async function waitForProjectLoad(
  client: LspClient,
  signal?: AbortSignal,
): Promise<void> {
  await client.waitForProjectLoaded(signal);
}

/**
 * Shutdown a specific client by pool key.
 */
async function shutdownClient(key: string): Promise<void> {
  const entry = clients.get(key);
  if (!entry) return;
  clients.delete(key);
  try {
    await entry.client.shutdown();
  } catch {
    // Force-removed already
  }
}

/**
 * Shutdown all clients.
 */
export async function shutdownAll(): Promise<void> {
  const entries = Array.from(clients.keys());
  await Promise.all(entries.map(shutdownClient));
  stopIdleChecker();
}
