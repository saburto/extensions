# Pi Extensions

A monorepo of [pi coding agent](https://github.com/earendil-works/pi) extensions managed with bun workspaces.

## Structure

```
pi-extensions/
├── extensions/          # Individual extension packages
│   ├── colorful-footer/ # Colorful status footer
│   ├── pi-launcher/     # Launch pi sessions, tools, or processes
│   ├── mcp-image-saver/ # Auto-save images from tool results
│   └── pi-nvim-lsp/     # Neovim LSP bridge
├── packages/            # Shared libraries (if any)
├── package.json         # Root workspace config
├── bun.lock             # bun lockfile
└── tsconfig.json        # Shared TypeScript config
```

## Getting Started

```bash
# Install dependencies
bun install

# Type-check all extensions
bun run typecheck

# Run tests
bun run test
```

## Using an Extension

From this repo root, test an extension with:

```bash
pi -e ./extensions/pi-launcher/src/index.ts -p "launch something"
```

Or install the extensions you want into your pi settings:

```bash
pi install ./extensions/pi-launcher
```

## Creating a New Extension

1. Create a directory under `extensions/`
2. Add a `package.json` with a `pi.extensions` manifest
3. Create `src/extension.ts` with your extension logic
4. Create `src/index.ts` that re-exports the extension as default

See the [pi extensions docs](https://pi.dev/docs/extensions) for the full API.
