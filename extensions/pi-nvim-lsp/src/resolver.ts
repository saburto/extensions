/**
 * Binary resolution for LSP servers.
 *
 * Resolution order:
 *   1. Mason install dirs (~/.local/share/nvim/mason/bin, etc.)
 *   2. Project-local bin dirs (node_modules/.bin, .venv/bin, etc.)
 *   3. $PATH
 */
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// =============================================================================
// Mason Directories
// =============================================================================

/**
 * Common mason install directories to search.
 */
function getMasonDirs(): string[] {
  const dataHome =
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");

  return [
    join(dataHome, "nvim", "mason", "bin"),
    join(dataHome, "kickstart", "mason", "bin"),
    join(dataHome, "lazy", "mason", "bin"),
    join(homedir(), ".local", "share", "nvim", "mason", "bin"),
    join(homedir(), ".local", "share", "kickstart", "mason", "bin"),
  ];
}

// =============================================================================
// Project-local Bin Dirs
// =============================================================================

const LOCAL_BIN_PATHS: Array<{ markers: string[]; binDir: string }> = [
  { markers: ["package.json", "pnpm-lock.yaml", "yarn.lock"], binDir: "node_modules/.bin" },
  { markers: ["pyproject.toml", "requirements.txt", "setup.py"], binDir: ".venv/bin" },
  { markers: ["pyproject.toml", "requirements.txt", "setup.py"], binDir: "venv/bin" },
  { markers: ["Gemfile"], binDir: "vendor/bundle/bin" },
  { markers: ["Gemfile"], binDir: "bin" },
  { markers: ["go.mod", "go.sum"], binDir: "bin" },
];

/**
 * Check if any marker file exists in a directory.
 */
function hasMarker(cwd: string, markers: string[]): boolean {
  return markers.some((m) => existsSync(join(cwd, m)));
}

/**
 * Resolve a command in project-local bin directories.
 */
function resolveLocal(cwd: string, command: string): string | null {
  for (const { markers, binDir } of LOCAL_BIN_PATHS) {
    if (hasMarker(cwd, markers)) {
      const localPath = join(cwd, binDir, command);
      if (existsSync(localPath)) return localPath;

      // Windows: check .exe, .cmd, .bat extensions
      if (platform() === "win32") {
        for (const ext of [".exe", ".cmd", ".bat"]) {
          if (existsSync(localPath + ext)) return localPath + ext;
        }
      }
    }
  }
  return null;
}

// =============================================================================
// $PATH Resolution
// =============================================================================

/**
 * Resolve a command from $PATH using `which` (Unix) or `where` (Windows).
 */
function resolveFromPath(command: string): string | null {
  try {
    const whichCmd = platform() === "win32" ? "where" : "which";
    const result = execFileSync(whichCmd, [command], {
      encoding: "utf8",
      timeout: 3000,
    });
    const path = result.trim().split("\n")[0].trim();
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

// =============================================================================
// Main Resolution
// =============================================================================

export interface ResolvedBinary {
  path: string;
  source: "mason" | "project-local" | "path";
}

/**
 * Resolve an LSP server binary to an absolute path.
 *
 * Order: mason dirs → project-local → $PATH
 */
export function resolveBinary(command: string, cwd: string): ResolvedBinary | null {
  // 1. Check mason directories
  for (const masonDir of getMasonDirs()) {
    const masonBin = join(masonDir, command);
    if (existsSync(masonBin)) {
      return { path: masonBin, source: "mason" };
    }
  }

  // 2. Check project-local bin directories
  const localPath = resolveLocal(cwd, command);
  if (localPath) {
    return { path: localPath, source: "project-local" };
  }

  // 3. Check $PATH (returns the command name itself if in PATH)
  const pathBin = resolveFromPath(command);
  if (pathBin) {
    return { path: pathBin, source: "path" };
  }

  return null;
}
