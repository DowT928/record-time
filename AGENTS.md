# AGENTS.md

## Encoding Rules

- Treat all source, config, and documentation files in this repository as UTF-8.
- Do not write source files with Windows PowerShell defaults such as `Set-Content`, `Out-File`, or `>` redirection. PowerShell 5.1 may write UTF-16LE or ANSI text.
- Prefer `apply_patch` for manual edits. If a script writes text, pass an explicit UTF-8 encoding.
- Do not trust terminal-rendered Chinese text as proof that a file is broken. Verify bytes or code points first; the console display layer can be wrong while the file is still valid UTF-8.
- Do not copy mojibake from terminal output back into source. The encoding checker keeps escaped examples of common bad patterns.
- Run `npm run check:encoding` after touching Chinese copy, Markdown, JSON, or scripts that write text.

## Verification

- Encoding success means `npm run check:encoding` passes.
- The check intentionally ignores generated output and runtime data folders such as `dist`, `dist-electron`, `release`, `build`, `.demo-user-data`, and `node_modules`.

## Release Packaging Rules

- Keep `dependencies` limited to modules the Electron main/preload runtime loads from `node_modules` after packaging. Renderer-only libraries such as React, Recharts, lucide, and date-fns belong in `devDependencies` because Vite bundles them into `dist`.
- Before adding a production dependency, verify it is imported by `electron/**` at runtime or is required via `require.resolve` from packaged code. If it is only imported by `src/**`, keep it as a dev dependency.
- If the installer becomes unexpectedly slow or large, inspect `release/win-unpacked/resources/app.asar` first. A large `app.asar` containing renderer dependency trees such as Recharts, Redux, or React usually means a bundled frontend library was placed in `dependencies`.
- For Windows release rebuilds, prefer the two-step cached path when `npm run dist` stalls on GitHub/CDN downloads: build/update `release/win-unpacked` first, then run electron-builder with `--prepackaged release\win-unpacked` to generate the NSIS installer.
- After changing dependency placement, run `npm install --package-lock-only --ignore-scripts`, then verify with `npm run build` and a release packaging size check.
