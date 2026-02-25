# Releasing Files to LLM Prompt

## Quick answer
- `npm run package` builds the extension code (`dist`) but does **not** create a `.vsix`.
- `vsce package` creates the `.vsix` file.
- `vsce publish <version>` publishes to the VS Code Marketplace.

## Release checklist
1. Update version in `package.json` and `CHANGELOG.md`.
2. Run build checks:
   - `npm run package`
3. Create a VSIX artifact:
   - `vsce package`
4. Verify output file exists:
   - `files-to-llm-prompt-<version>.vsix`
5. Publish:
   - `vsce publish <version>`

## Typical commands
```powershell
# Build/typecheck/lint/bundle
npm run package

# Create .vsix
vsce package

# Publish specific version
vsce publish 1.5.1
```

## Using a PAT in PowerShell
```powershell
$env:VSCE_PAT="YOUR_MARKETPLACE_PAT"
vsce publish 1.5.1
```

## Troubleshooting
- No new `.vsix` after `npm run package`:
  - Expected behavior. Run `vsce package`.
- `spawn EPERM` during `vsce package`/`vsce publish`:
  - Environment/sandbox restriction when spawning `esbuild`.
  - Re-run with permissions that allow process spawn.
- Wrong version published:
  - Ensure `package.json` version and `vsce publish <version>` match.

## Security note
- If a PAT is accidentally shared in chat/logs, revoke/rotate it immediately in Azure DevOps.
