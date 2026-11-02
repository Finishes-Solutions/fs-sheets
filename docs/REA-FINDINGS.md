# Smartsheet desktop inspection

This report records the initial static package inspection only. Later live UI observations are a separate investigation. Raw evidence remains local and is excluded from this repository.

## Identified artifact

- App: `/Applications/Smartsheet.app`
- Bundle ID: `com.smartsheet.desktopapp`
- Version: `1.0.54`
- Target: `Contents/Resources/app.asar` (18,582,805 bytes)
- SHA-256: `6a014bd4a3ac82a5d70daca1e149c67ab8daa24624168b553b66416ce3eb58b4`
- REA CLI: cached `rea-agents` 6.4.0, launched through its public `.bin/rea` entry point.

## Evidence

REA parent Evidence: `ev_d33b7130ed64a04d0948f2bea981976d678d5672b67263bf2cd92deaa6eb68df`.

Summary Evidence: `ev_b4cc6e941088a6dd80a743f992b36049cb9e276010a8b46770518481628ecee6`.

The CLI completed and retained inventory/static observations: 21 relevant files, 8 parsed JavaScript files, 10,619,988 text bytes read, and no reported parse failures. Semantic coverage is **partial**, with five bundled sources exhausting the default worker heap. Missing Electron boundary counts are not proof those APIs are absent. Do not describe this as a complete reconstruction.

Initial execution failed when the Swift process-helper compiler could not write its cache inside the sandbox. Retrying with approved filesystem access allowed analysis to run. No native decompiler installation or MCP configuration change was needed.

## Supplemental inspection

A separate Python ASAR reader inspected `package.json` and `.webpack/main/index.js` as inert text. This is ordinary static inspection, not REA-generated Evidence. Observations and exact character offsets are saved in `smartsheet-shell-observations.json`.

- The package declares React, Redux Toolkit, Electron utilities, and Smartsheet desktop/design dependencies.
- `createWebAppView` creates an Electron WebContentsView, gets a Smartsheet app URL, and passes it to `webContents.loadURL`.
- The URL helpers select hosted Smartsheet domains, including US, EU, and Gov variants.
- The package includes local login/navigation, primary-window, dialog, and connection-error bundles.

**Inference:** the desktop package includes a shell that loads the hosted product. It is not sufficient evidence for reconstructing all sheet/formula/workspace behavior. Static inspection does not reveal server implementations or establish which particular features are executed remotely. The presence of a grid utility dependency does not establish a full local grid or calculation engine.

## Reconstruction boundary

sheets is new, independently authored code. No extracted Smartsheet source is shipped in the implementation. REA findings guide scope; official product documentation guides the preliminary feature inventory. Formula behavior and data architecture are explicit implementation choices that still need compatibility tests.

During this initial static inspection, no Smartsheet process was launched and no account data or live network capture was used. Authentication was not investigated beyond incidental package structure.
