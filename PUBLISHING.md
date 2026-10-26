# Publishing RubiOps to the VS Code Marketplace

## Prerequisites

1. **Publisher account** — [Create a publisher](https://marketplace.visualstudio.com/manage)
   - Publisher ID: `CIGlobalTechnologies` (must match `publisher` in `package.json`)
2. **Marketplace PAT** — Azure DevOps → User settings → Personal access tokens
   - Scope: **Marketplace** → **Manage**
3. **Node.js** and project dependencies installed (`npm install`)

## Build the VSIX

```bash
npm run compile
npm run package
```

Output: `rubiops-<version>.vsix` (includes production dependencies such as `axios`)

`npm run package` runs `prepare-readme` automatically to embed screenshots in README (required for Marketplace image display).

> Do **not** add `node_modules/**` to `.vscodeignore` — that breaks the packaged extension.
> Edit `README.source.md` for docs changes, then run `cp README.source.md README.md && npm run prepare-readme`.

### Install locally (smoke test)

```bash
code --install-extension rubiops-1.0.0.vsix
```

## Publish

```bash
# One-time login (paste Marketplace PAT when prompted)
npx vsce login CIGlobalTechnologies

# Publish current version from package.json
npm run publish
```

### Alternative: upload via web

1. Open [Marketplace Manage](https://marketplace.visualstudio.com/manage)
2. Select publisher `CIGlobalTechnologies` → **+ New extension** → **Visual Studio Code**
3. Upload the `rubiops-1.0.0.vsix` file

## Version bumps

Edit `version` in `package.json`, add entry to `CHANGELOG.md`, then:

```bash
npm run publish
```

Or: `npx vsce publish minor` / `patch` / `major`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Publisher not found` | Create publisher ID `CIGlobalTechnologies` on marketplace |
| `LICENSE not found` | Ensure `LICENSE` exists at repo root |
| Secret scan error in CI | Run `vsce package` locally or use `required_permissions: all` |
| Extension already exists | Bump `version` in `package.json` |

## Marketplace listing checklist

- [ ] Publisher `CIGlobalTechnologies` created
- [ ] README includes PAT scopes and setup
- [ ] Icon `resources/icon.png` (128×128)
- [ ] LICENSE (MIT)
- [ ] Tested VSIX install locally
- [ ] `vsce login` + `npm run publish`
