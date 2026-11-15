# Pi Extensions

A monorepo of [pi coding agent](https://github.com/earendil-works/pi) extensions managed with bun workspaces.

## Structure

```
pi-extensions/
├── extensions/          # Individual extension packages
│   ├── colorful-footer/ # Colorful status footer
│   ├── pi-launcher/     # Launch pi sessions, tools, or processes
│   ├── mcp-image-saver/ # Auto-save images from tool results
│   ├── pi-nvim-lsp/     # Neovim LSP bridge
│   └── pi-notify-fullscreen/ # Fullscreen notifications
├── packages/            # Shared libraries (if any)
├── package.json         # Root workspace config
├── bun.lock             # bun lockfile
└── tsconfig.json        # Shared TypeScript config
```

`pi-notify-fullscreen` wraps the [notify-fullscreen](https://github.com/saburto/notify-fullscreen)
binary (Linux/X11) to alert you with a fullscreen overlay.

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
pi install npm:@saburto/pi-notify-fullscreen   # published extensions
pi install ./extensions/pi-launcher            # local clone
```

## Creating a New Extension

1. Create a directory under `extensions/`
2. Add a `package.json` with a `pi.extensions` manifest
3. Create `src/extension.ts` with your extension logic
4. Create `src/index.ts` that re-exports the extension as default

See the [pi extensions docs](https://pi.dev/docs/extensions) for the full API.

## Releasing to npm

Publishing uses [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC):
no npm tokens are stored in GitHub secrets, and every publish gets provenance
attestations automatically.

### One-time setup per package

1. Publish the package once manually (`npm publish --access public` from the
   package directory) — a trusted publisher can only be attached to an
   existing package page.
2. On npmjs.com: package page → **Settings** → **Trusted Publisher** →
   **GitHub Actions** and fill in:
   - **Organization or user:** `saburto`
   - **Repository:** `extensions`
   - **Workflow filename:** `release-please.yml` (add `publish-manual.yml` too
     if you want manual dispatches to publish)
3. Under **Allowed actions**, allow direct `npm publish`.
4. Ensure the package's `package.json` has a `repository` field matching this
   repo (exact owner/repo case) plus its `directory` inside the monorepo.

### Automatic releases

The `Release Please` workflow bumps versions and publishes on every merge to
`main` (see `release-please-config.json` for included packages). A manual
publish of any workspace is available via the `Publish to npm (manual)`
workflow, which accepts the workspace directory as an input.
