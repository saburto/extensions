/**
 * Built-in LSP server configurations sourced from nvim-lspconfig.
 *
 * Each entry provides the minimum needed to spawn and communicate with
 * a language server: command, args, file extensions, root markers,
 * initialization options, and settings.
 *
 * Sourced from: https://github.com/neovim/nvim-lspconfig
 * Binary resolution via mason registry: https://github.com/mason-org/mason-registry
 */

export interface ServerConfig {
  /** Command to spawn (binary name or path) */
  command: string;
  /** Arguments passed to the command */
  args?: string[];
  /** File extensions this server handles (e.g. [".rs", ".ts"]) */
  fileTypes: string[];
  /** Root marker files to detect workspace root (priority-ordered) */
  rootMarkers: string[];
  /** Initialization options passed during initialize */
  initOptions?: Record<string, unknown>;
  /** Settings sent via workspace/didChangeConfiguration */
  settings?: Record<string, unknown>;
  /** If true, server can work on standalone files without a workspace root */
  workspaceRequired?: boolean;
  /** If true, this is a linter/formatter only (no type intelligence) */
  isLinter?: boolean;
}

/**
 * Map Neovim filetype names to file extensions.
 */
function ft(...exts: string[]): string[] {
  return exts.map((e) => (e.startsWith(".") ? e : `.${e}`));
}

export const BUILTIN_SERVERS: Record<string, ServerConfig> = {
  // ── Rust ──────────────────────────────────────────────────────────
  "rust-analyzer": {
    command: "rust-analyzer",
    fileTypes: ft("rs"),
    rootMarkers: ["Cargo.toml", "rust-project.json", ".git"],
    settings: { "rust-analyzer": { checkOnSave: false } },
  },

  // ── TypeScript / JavaScript ──────────────────────────────────────
  "typescript-language-server": {
    command: "typescript-language-server",
    args: ["--stdio"],
    fileTypes: ft("ts", "tsx", "js", "jsx", "mjs", "cjs"),
    rootMarkers: ["package.json", "tsconfig.json", "jsconfig.json", ".git"],
    initOptions: {
      preferences: {
        includeInlayParameterNameHints: "all",
        includeInlayVariableTypeHints: true,
      },
    },
  },

  // ── HTML ─────────────────────────────────────────────────────────
  "vscode-html-language-server": {
    command: "vscode-html-language-server",
    args: ["--stdio"],
    fileTypes: ft("html", "htm"),
    rootMarkers: [".git"],
    initOptions: { provideFormatter: true },
  },

  // ── CSS ──────────────────────────────────────────────────────────
  "vscode-css-language-server": {
    command: "vscode-css-language-server",
    args: ["--stdio"],
    fileTypes: ft("css", "scss", "less"),
    rootMarkers: ["package.json", ".git"],
    initOptions: { provideFormatter: true },
  },

  // ── JSON ─────────────────────────────────────────────────────────
  "vscode-json-language-server": {
    command: "vscode-json-language-server",
    args: ["--stdio"],
    fileTypes: ft("json", "jsonc"),
    rootMarkers: [".git"],
    initOptions: { provideFormatter: true },
  },

  // ── Go ───────────────────────────────────────────────────────────
  gopls: {
    command: "gopls",
    args: ["serve"],
    fileTypes: ft("go", "mod", "sum", "work"),
    rootMarkers: ["go.mod", "go.work", "go.sum", ".git"],
    settings: {
      gopls: {
        analyses: { unusedparams: true, shadow: true },
        staticcheck: true,
      },
    },
  },

  // ── Python (pyright) ────────────────────────────────────────────
  pyright: {
    command: "pyright-langserver",
    args: ["--stdio"],
    fileTypes: ft("py", "pyi"),
    rootMarkers: [
      "pyrightconfig.json",
      "pyproject.toml",
      "setup.py",
      "requirements.txt",
      "Pipfile",
      ".git",
    ],
    settings: {
      python: { analysis: { autoSearchPaths: true, diagnosticMode: "openFilesOnly" } },
    },
  },

  // ── Python (ruff) ───────────────────────────────────────────────
  ruff: {
    command: "ruff",
    args: ["server"],
    fileTypes: ft("py", "pyi"),
    rootMarkers: ["pyproject.toml", "ruff.toml", ".ruff.toml", ".git"],
    isLinter: true,
  },

  // ── Lua ──────────────────────────────────────────────────────────
  "lua-language-server": {
    command: "lua-language-server",
    fileTypes: ft("lua"),
    rootMarkers: [".luarc.json", ".luarc.jsonc", ".luacheckrc", ".stylua.toml", ".git"],
    settings: {
      Lua: {
        hint: { enable: true },
        diagnostics: { enable: true },
      },
    },
  },

  // ── Zig ──────────────────────────────────────────────────────────
  zls: {
    command: "zls",
    fileTypes: ft("zig", "zir"),
    rootMarkers: ["build.zig", "build.zig.zon", "zls.json", ".git"],
  },

  // ── C / C++ (clangd) ────────────────────────────────────────────
  clangd: {
    command: "clangd",
    args: ["--background-index", "--clang-tidy"],
    fileTypes: ft("c", "cpp", "cc", "cxx", "h", "hpp", "hxx", "m", "mm"),
    rootMarkers: [
      ".clangd",
      ".clang-tidy",
      ".clang-format",
      "compile_commands.json",
      "CMakeLists.txt",
      "Makefile",
      ".git",
    ],
  },

  // ── Bash ─────────────────────────────────────────────────────────
  bashls: {
    command: "bash-language-server",
    args: ["start"],
    fileTypes: ft("sh", "bash", "zsh"),
    rootMarkers: [".git"],
  },

  // ── YAML ─────────────────────────────────────────────────────────
  yamlls: {
    command: "yaml-language-server",
    args: ["--stdio"],
    fileTypes: ft("yaml", "yml"),
    rootMarkers: [".git"],
  },

  // ── Markdown ─────────────────────────────────────────────────────
  marksman: {
    command: "marksman",
    fileTypes: ft("md", "markdown"),
    rootMarkers: [".git", ".marksman.toml"],
  },

  // ── Docker ───────────────────────────────────────────────────────
  "docker-langserver": {
    command: "docker-langserver",
    args: ["--stdio"],
    fileTypes: ft("dockerfile", "Dockerfile"),
    rootMarkers: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".git"],
  },

  // ── Terraform ────────────────────────────────────────────────────
  terraformls: {
    command: "terraform-ls",
    args: ["serve"],
    fileTypes: ft("tf", "tfvars"),
    rootMarkers: ["main.tf", ".terraform", ".git"],
  },

  // ── Nix ──────────────────────────────────────────────────────────
  nil_ls: {
    command: "nil",
    fileTypes: ft("nix"),
    rootMarkers: ["flake.nix", "default.nix", ".git"],
  },

  // ── Java (jdtls) ──────────────────────────────────────────────
  jdtls: {
    command: "jdtls",
    fileTypes: ft("java"),
    rootMarkers: ["pom.xml", "build.gradle", "build.gradle.kts", "mvnw", "gradlew", ".git"],
    settings: {
      java: {
        configuration: { updateBuildConfiguration: "interactive" },
      },
    },
  },

  // ── Kotlin ───────────────────────────────────────────────────────
  "kotlin-language-server": {
    command: "kotlin-language-server",
    fileTypes: ft("kt", "kts"),
    rootMarkers: ["build.gradle", "build.gradle.kts", "settings.gradle", ".git"],
  },

  // ── Scala (Metals) ──────────────────────────────────────────────
  metals: {
    command: "metals",
    fileTypes: ft("scala", "sbt"),
    rootMarkers: ["build.sbt", "build.sc", ".git"],
  },

  // ── Elixir ───────────────────────────────────────────────────────
  elixirls: {
    command: "elixir-ls",
    fileTypes: ft("ex", "exs", "eex", "heex"),
    rootMarkers: ["mix.exs", ".git"],
  },

  // ── Elm ──────────────────────────────────────────────────────────
  elmls: {
    command: "elm-language-server",
    fileTypes: ft("elm"),
    rootMarkers: ["elm.json", "elm-package.json", ".git"],
  },

  // ── Haskell ──────────────────────────────────────────────────────
  hls: {
    command: "haskell-language-server-wrapper",
    fileTypes: ft("hs", "lhs"),
    rootMarkers: ["stack.yaml", "cabal.project", "package.yaml", ".git"],
  },

  // ── Ruby ─────────────────────────────────────────────────────────
  ruby_lsp: {
    command: "ruby-lsp",
    fileTypes: ft("rb", "erb"),
    rootMarkers: ["Gemfile", ".git"],
  },

  // ── Svelte ───────────────────────────────────────────────────────
  svelte: {
    command: "svelteserver",
    args: ["--stdio"],
    fileTypes: ft("svelte"),
    rootMarkers: ["package.json", ".git"],
  },

  // ── Vue ──────────────────────────────────────────────────────────
  "vue-language-server": {
    command: "vue-language-server",
    args: ["--stdio"],
    fileTypes: ft("vue"),
    rootMarkers: ["package.json", "vite.config.js", "vite.config.ts", ".git"],
  },

  // ── GraphQL ──────────────────────────────────────────────────────
  graphql: {
    command: "graphql-lsp",
    args: ["server", "-m", "stream"],
    fileTypes: ft("graphql", "gql"),
    rootMarkers: [".graphqlrc", ".graphqlconfig", "package.json", ".git"],
  },
};

/**
 * Find all servers that handle a given file extension.
 * Returns non-linter servers first, linters last.
 */
export function getServersForFile(
  config: Record<string, ServerConfig>,
  fileExt: string,
): Array<[string, ServerConfig]> {
  const matches: Array<[string, ServerConfig]> = [];
  const ext = fileExt.toLowerCase();

  for (const [name, serverConfig] of Object.entries(config)) {
    if (serverConfig.fileTypes.some((ft) => ft === ext)) {
      matches.push([name, serverConfig]);
    }
  }

  // Primary servers (non-linters) first
  return matches.sort((a, b) => {
    const aLint = a[1].isLinter ? 1 : 0;
    const bLint = b[1].isLinter ? 1 : 0;
    return aLint - bLint;
  });
}
