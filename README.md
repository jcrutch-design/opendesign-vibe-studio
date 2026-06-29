# OpenDesign Vibe Studio

A Windows-first local desktop studio that combines an OpenDesign-style design pass with LobeHub-style custom LLM endpoints for app generation.

## What It Does

- Runs as a local Electron GUI.
- Creates and imports local app folders.
- Stores custom OpenAI-compatible chat endpoints: endpoint URL, API key, model, and optional headers.
- Runs a built-in OpenDesign-style proposal pass, or a configurable external OpenDesign command with `{brief}`, `{projectPath}`, and `{source}` tokens.
- Creates an initial `opendesign-proposal.html` design preview before vibe coding starts.
- Sends the design brief, OpenDesign output, and existing files to the selected LLM.
- Writes returned file manifests into the active project.
- Previews generated `index.html` apps locally.

## Run

```powershell
npm install
npm run dev
```

If Electron was installed without its binary, run:

```powershell
node .\node_modules\electron\install.js
```

Then start again:

```powershell
npm run dev
```

## Build

```powershell
npm run build
npm run dist
```

The default OpenDesign command is:

```powershell
builtin:opendesign
```

Change it in the Models view if your installed OpenDesign exposes a real CLI command. If a legacy `open-design` command is configured but not found on PATH, the app falls back to the built-in local design pass.

Drag the vertical handle between the project rail and workspace to resize the left project tab area and give the design proposal preview more room.
