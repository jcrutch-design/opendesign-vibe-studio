const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { exec, spawn } = require('node:child_process');

const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.vite', 'release']);
const textExts = new Set([
  '.html',
  '.css',
  '.js',
  '.cjs',
  '.mjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.md',
  '.txt',
  '.svg',
  '.yml',
  '.yaml',
  '.toml',
  '.xml',
  '.py',
  '.cs',
  '.csproj',
  '.sln',
  '.vb',
  '.vbproj',
  '.fs',
  '.fsproj',
  '.java',
  '.kt',
  '.kts',
  '.gradle',
  '.go',
  '.rs',
  '.swift',
  '.php',
  '.rb',
  '.r',
  '.lua',
  '.dart',
  '.ex',
  '.exs',
  '.erl',
  '.hrl',
  '.clj',
  '.cljs',
  '.scala',
  '.sql',
  '.ps1',
  '.sh',
  '.bat',
  '.cmd',
]);

const BUILTIN_OPENDESIGN_COMMAND = 'builtin:opendesign';
const LEGACY_OPENDESIGN_COMMAND = 'open-design --prompt "{brief}" --out "{projectPath}"';
const LEGACY_CODER_SYSTEM_PROMPT =
  'You are a senior frontend engineer. Return only JSON with a files array. Build a complete static web app using index.html, styles.css, and app.js unless the user asks for a framework.';
const BUILTIN_CODER_SYSTEM_PROMPT =
  'You are a senior software engineer. Choose the most appropriate language, framework, and runtime for the user request. Return only complete fenced file blocks. Always include opendesign-app.json describing the stack and launch instructions. Build polished, production-ready software, not a default scaffold.';

let mainWindow;
const generatedWindows = new Set();

function defaultConfig() {
  return {
    activeProviderId: 'ollama-local',
    providers: [
      {
        id: 'ollama-local',
        name: 'Ollama local',
        endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
        apiKey: 'ollama',
        model: 'qwen2.5-coder:7b',
      },
      {
        id: 'openai-compatible',
        name: 'OpenAI-compatible',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        model: 'gpt-4.1',
      },
    ],
    openDesignCommand: BUILTIN_OPENDESIGN_COMMAND,
    coderSystemPrompt: BUILTIN_CODER_SYSTEM_PROMPT,
  };
}

function userDataPath(...parts) {
  return path.join(app.getPath('userData'), ...parts);
}

async function ensureStore() {
  await fs.mkdir(userDataPath('projects'), { recursive: true });
  try {
    await fs.access(userDataPath('config.json'));
  } catch {
    await fs.writeFile(userDataPath('config.json'), JSON.stringify(defaultConfig(), null, 2));
  }
  try {
    await fs.access(userDataPath('projects.json'));
  } catch {
    await fs.writeFile(userDataPath('projects.json'), '[]');
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readState() {
  await ensureStore();
  const config = {
    ...defaultConfig(),
    ...(await readJson(userDataPath('config.json'), defaultConfig())),
  };
  if (shouldMigrateOpenDesignCommand(config.openDesignCommand)) {
    config.openDesignCommand = BUILTIN_OPENDESIGN_COMMAND;
    await fs.writeFile(userDataPath('config.json'), JSON.stringify(config, null, 2));
  }
  if (!config.coderSystemPrompt?.trim() || config.coderSystemPrompt === LEGACY_CODER_SYSTEM_PROMPT) {
    config.coderSystemPrompt = BUILTIN_CODER_SYSTEM_PROMPT;
    await fs.writeFile(userDataPath('config.json'), JSON.stringify(config, null, 2));
  }
  const projects = await readJson(userDataPath('projects.json'), []);
  return { config, projects };
}

async function saveState({ config, projects }) {
  if (config) {
    await fs.writeFile(userDataPath('config.json'), JSON.stringify(config, null, 2));
  }
  if (projects) {
    await fs.writeFile(userDataPath('projects.json'), JSON.stringify(projects, null, 2));
  }
  return readState();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f4f7f2',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#15272b',
      symbolColor: '#f4f7f2',
      height: 38,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  await ensureStore();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('studio:get-state', readState);

ipcMain.handle('studio:save-config', async (_event, config) => {
  return saveState({ config });
});

ipcMain.handle('studio:create-project', async (_event, name) => {
  const state = await readState();
  const safeName = slugify(name || 'Untitled app');
  const projectPath = userDataPath('projects', `${safeName}-${Date.now()}`);
  await fs.mkdir(projectPath, { recursive: true });
  const project = {
    id: `${Date.now()}`,
    name: name || 'Untitled app',
    path: projectPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return saveState({ projects: [project, ...state.projects] });
});

ipcMain.handle('studio:import-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import app folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) {
    return readState();
  }
  const state = await readState();
  const projectPath = result.filePaths[0];
  const existing = state.projects.find((project) => project.path === projectPath);
  if (existing) {
    return state;
  }
  const project = {
    id: `${Date.now()}`,
    name: path.basename(projectPath),
    path: projectPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return saveState({ projects: [project, ...state.projects] });
});

ipcMain.handle('studio:open-path', async (_event, targetPath) => {
  await shell.openPath(targetPath);
});

ipcMain.handle('studio:prepare-desktop-app', async (_event, projectPath, files, appName) => {
  await prepareGeneratedApp(projectPath, files, appName, { preferDesktop: true });
  const root = path.resolve(projectPath);
  const prepared = [];
  await walkTextFiles(root, root, prepared);
  return prepared;
});

ipcMain.handle('studio:launch-desktop-app', async (_event, projectPath) => {
  return launchGeneratedApp(projectPath);
});

ipcMain.handle('studio:prepare-generated-app', async (_event, projectPath, files, appName) => {
  await prepareGeneratedApp(projectPath, files, appName);
  const root = path.resolve(projectPath);
  const prepared = [];
  await walkTextFiles(root, root, prepared);
  return prepared;
});

ipcMain.handle('studio:launch-generated-app', async (_event, projectPath) => {
  return launchGeneratedApp(projectPath);
});

async function launchGeneratedApp(projectPath) {
  const root = path.resolve(projectPath);
  const manifest = await readOrInferAppManifest(root, []);
  const launch = manifest.launch || {};
  const kind = launch.kind || inferLaunchKind(manifest);
  const entry = launch.entry || manifest.entry || '';

  if (kind === 'none') {
    return { ok: false, kind, entryPath: root };
  }

  if (kind === 'command') {
    if (!launch.command) {
      throw new Error('Launch manifest uses command mode but no command was provided.');
    }
    const child = spawn(launch.command, {
      cwd: root,
      shell: true,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return { ok: true, kind, command: launch.command, entryPath: root };
  }

  const entryPath = resolveInside(root, entry || (await findOrInferHtmlEntry(root, [])));

  if (kind === 'browser') {
    await shell.openPath(entryPath);
    return { ok: true, kind, entryPath };
  }

  const preloadPath = path.join(path.resolve(projectPath), 'electron', 'preload.cjs');
  let preload;
  try {
    await fs.access(preloadPath);
    preload = preloadPath;
  } catch {
    preload = undefined;
  }

  const child = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#f4f7f2',
    show: false,
    title: path.basename(path.resolve(projectPath)),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  generatedWindows.add(child);
  child.once('ready-to-show', () => child.show());
  child.on('closed', () => generatedWindows.delete(child));
  await child.loadFile(entryPath);
  return { ok: true, kind: 'electron-window', entryPath };
}

ipcMain.handle('studio:read-project-files', async (_event, projectPath) => {
  const root = path.resolve(projectPath);
  const files = [];
  await walkTextFiles(root, root, files);
  return files;
});

ipcMain.handle('studio:write-project-files', async (_event, projectPath, files) => {
  const root = path.resolve(projectPath);
  const written = [];
  for (const file of files) {
    const relative = String(file.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root)) {
      throw new Error(`Refusing to write outside project: ${relative}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(file.content ?? ''), 'utf8');
    written.push({ path: relative, content: String(file.content ?? '') });
  }
  return written;
});

ipcMain.handle('studio:run-opendesign', async (_event, payload) => {
  const state = await readState();
  const command = state.config.openDesignCommand;
  if (!command?.trim()) {
    throw new Error('OpenDesign command is empty. Add it in Settings.');
  }

  await fs.writeFile(
    path.join(payload.projectPath, 'opendesign-brief.md'),
    `# OpenDesign Brief\n\n${payload.brief || ''}\n\n## Source\n\n${payload.source || 'None'}\n`,
    'utf8',
  );

  if (isBuiltInOpenDesignCommand(command)) {
    const output = await runBuiltInOpenDesign(payload, state.config);
    await fs.writeFile(path.join(payload.projectPath, 'opendesign-output.md'), output, 'utf8');
    return { ok: true, output };
  }

  const rendered = command
    .replaceAll('{brief}', escapeForCommand(payload.brief || ''))
    .replaceAll('{projectPath}', escapeForCommand(payload.projectPath || ''))
    .replaceAll('{source}', escapeForCommand(payload.source || ''));

  mainWindow?.webContents.send('studio:opendesign-log', `> ${rendered}`);
  const canRun = await validateOpenDesignCommand(rendered);
  if (!canRun) {
    mainWindow?.webContents.send(
      'studio:opendesign-log',
      'OpenDesign CLI was not found, so the built-in local design pass is running instead.',
    );
    const output = await runBuiltInOpenDesign(payload, state.config);
    await fs.writeFile(path.join(payload.projectPath, 'opendesign-output.md'), output, 'utf8');
    return { ok: true, output };
  }
  const output = await execCommand(rendered, payload.projectPath);
  await fs.writeFile(path.join(payload.projectPath, 'opendesign-output.md'), output, 'utf8');
  return { ok: true, output };
});

ipcMain.handle('studio:chat', async (_event, payload) => {
  const { provider, messages } = payload;
  return callChatCompletion(provider, messages);
});

async function walkTextFiles(root, current, files) {
  let entries = [];
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') {
      continue;
    }
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        await walkTextFiles(root, fullPath, files);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!textExts.has(ext)) {
      continue;
    }
    const stat = await fs.stat(fullPath);
    if (stat.size > 250_000) {
      continue;
    }
    files.push({
      path: path.relative(root, fullPath).replace(/\\/g, '/'),
      content: await fs.readFile(fullPath, 'utf8'),
    });
  }
}

async function writeProjectFiles(projectPath, files) {
  const root = path.resolve(projectPath);
  const written = [];
  for (const file of files) {
    const relative = String(file.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root)) {
      throw new Error(`Refusing to write outside project: ${relative}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(file.content ?? ''), 'utf8');
    written.push({ path: relative, content: String(file.content ?? '') });
  }
  return written;
}

async function prepareGeneratedApp(projectPath, files, appName, options = {}) {
  const root = path.resolve(projectPath);
  const currentFiles = Array.isArray(files)
    ? files.map((file) => ({
        path: String(file.path || '').replace(/\\/g, '/').replace(/^\/+/, ''),
        content: String(file.content ?? ''),
      }))
    : [];
  const normalized = currentFiles.map((file) => file.path);
  const manifest = await readOrInferAppManifest(root, currentFiles, appName, options);
  const launchKind = manifest.launch?.kind || inferLaunchKind(manifest);
  const entryPath =
    launchKind === 'none' || launchKind === 'command'
      ? manifest.launch?.entry || manifest.entry || ''
      : manifest.launch?.entry || manifest.entry || (await findOrInferHtmlEntry(root, normalized));
  const safeName = slugify(appName || path.basename(root));
  const displayName = appName || path.basename(root);

  if (
    launchKind === 'electron-window' &&
    !normalized.includes('package.json') &&
    !(await exists(path.join(root, 'package.json')))
  ) {
    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify(
        {
          name: safeName,
          version: '0.1.0',
          private: true,
          description: 'Local desktop app generated by OpenDesign Vibe Studio.',
          main: 'electron/main.cjs',
          scripts: {
            start: 'electron .',
          },
          devDependencies: {
            electron: '^33.4.11',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  if (
    launchKind === 'electron-window' &&
    !normalized.includes('electron/main.cjs') &&
    !(await exists(path.join(root, 'electron', 'main.cjs')))
  ) {
    await fs.mkdir(path.join(root, 'electron'), { recursive: true });
    await fs.writeFile(path.join(root, 'electron', 'main.cjs'), buildGeneratedMain(displayName, entryPath), 'utf8');
  }

  if (
    launchKind === 'electron-window' &&
    !normalized.includes('electron/preload.cjs') &&
    !(await exists(path.join(root, 'electron', 'preload.cjs')))
  ) {
    await fs.mkdir(path.join(root, 'electron'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'electron', 'preload.cjs'),
      `const { contextBridge } = require('electron');\n\ncontextBridge.exposeInMainWorld('desktopApp', {\n  platform: process.platform,\n  generatedBy: 'OpenDesign Vibe Studio',\n});\n`,
      'utf8',
    );
  }

  if (launchKind === 'electron-window' || launchKind === 'browser') {
    await ensureEntryAssets(root, entryPath);
  }

  await fs.writeFile(
    path.join(root, 'opendesign-app.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        name: appName || path.basename(root),
        stack: manifest.stack || inferStackFromManifest(manifest),
        language: manifest.language || inferLanguageFromManifest(manifest),
        entry: entryPath || undefined,
        launch: {
          kind: launchKind,
          entry: entryPath || undefined,
          command: manifest.launch?.command,
        },
        preparedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function readOrInferAppManifest(root, filesFromCurrentWrite, appName, options = {}) {
  const currentFiles = normalizeCurrentFiles(filesFromCurrentWrite);
  const pathsFromCurrentWrite = currentFiles.map((file) => file.path);
  const currentManifest = readManifestFromCurrentFiles(currentFiles, 'opendesign-app.json');
  if (currentManifest) {
    return normalizeManifest(currentManifest, root, pathsFromCurrentWrite, appName);
  }

  if (pathsFromCurrentWrite.length) {
    const inferred = await inferAppManifest(root, pathsFromCurrentWrite, appName, options);
    return normalizeManifest(inferred, root, pathsFromCurrentWrite, appName);
  }

  const explicit = await readManifestFile(root, 'opendesign-app.json');
  if (explicit) {
    return normalizeManifest(explicit, root, pathsFromCurrentWrite, appName);
  }

  const legacy = await readManifestFile(root, 'opendesign-desktop.json');
  if (legacy) {
    return normalizeManifest(
      {
        name: appName || path.basename(root),
        stack: 'electron',
        language: 'javascript',
        entry: legacy.entry,
        launch: {
          kind: 'electron-window',
          entry: legacy.entry,
        },
      },
      root,
      pathsFromCurrentWrite,
      appName,
    );
  }

  const inferred = await inferAppManifest(root, pathsFromCurrentWrite, appName, options);
  return normalizeManifest(inferred, root, pathsFromCurrentWrite, appName);
}

function normalizeCurrentFiles(filesFromCurrentWrite) {
  if (!Array.isArray(filesFromCurrentWrite)) {
    return [];
  }
  return filesFromCurrentWrite.map((file) => {
    if (typeof file === 'string') {
      return { path: file.replace(/\\/g, '/').replace(/^\/+/, ''), content: '' };
    }
    return {
      path: String(file.path || '').replace(/\\/g, '/').replace(/^\/+/, ''),
      content: String(file.content ?? ''),
    };
  });
}

function readManifestFromCurrentFiles(files, fileName) {
  const match = files.find((file) => file.path.toLowerCase() === fileName.toLowerCase());
  if (!match?.content) {
    return null;
  }
  try {
    return JSON.parse(match.content);
  } catch {
    return null;
  }
}

async function readManifestFile(root, fileName) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, fileName), 'utf8'));
  } catch {
    return null;
  }
}

async function inferAppManifest(root, pathsFromCurrentWrite, appName, options = {}) {
  const paths = new Set(pathsFromCurrentWrite.map((filePath) => filePath.toLowerCase()));
  const packageJson = await readManifestFile(root, 'package.json');
  const htmlEntry = await findOrInferHtmlEntry(root, pathsFromCurrentWrite).catch(() => '');
  const pythonEntry =
    pathsFromCurrentWrite.find((filePath) => filePath.toLowerCase() === 'main.py') ??
    pathsFromCurrentWrite.find((filePath) => filePath.toLowerCase().endsWith('.py'));

  if (options.preferDesktop || paths.has('electron/main.cjs') || packageJson?.main?.includes('electron')) {
    return {
      name: appName || path.basename(root),
      stack: 'electron',
      language: 'javascript',
      entry: htmlEntry || 'renderer/index.html',
      launch: { kind: 'electron-window', entry: htmlEntry || 'renderer/index.html' },
    };
  }

  if (packageJson?.scripts?.start) {
    return {
      name: appName || packageJson.name || path.basename(root),
      stack: packageJson.dependencies?.electron || packageJson.devDependencies?.electron ? 'electron' : 'node',
      language: 'javascript',
      entry: htmlEntry || '',
      launch: packageJson.dependencies?.electron || packageJson.devDependencies?.electron
        ? { kind: 'electron-window', entry: htmlEntry || 'renderer/index.html' }
        : { kind: 'command', command: 'npm start' },
    };
  }

  if (pythonEntry) {
    return {
      name: appName || path.basename(root),
      stack: 'python',
      language: 'python',
      entry: pythonEntry,
      launch: { kind: 'command', command: `python ${quoteShellArg(pythonEntry)}` },
    };
  }

  if (htmlEntry) {
    return {
      name: appName || path.basename(root),
      stack: 'static-web',
      language: 'html/css/javascript',
      entry: htmlEntry,
      launch: { kind: 'browser', entry: htmlEntry },
    };
  }

  return {
    name: appName || path.basename(root),
    stack: 'files',
    language: 'mixed',
    launch: { kind: 'none' },
  };
}

function normalizeManifest(manifest, root, pathsFromCurrentWrite, appName) {
  const launch = manifest.launch || {};
  const entry = launch.entry || manifest.entry || '';
  return {
    schemaVersion: 1,
    name: manifest.name || appName || path.basename(root),
    stack: manifest.stack || 'custom',
    language: manifest.language || 'mixed',
    entry,
    launch: {
      kind: launch.kind || inferLaunchKind(manifest),
      entry,
      command: launch.command,
    },
    files: manifest.files,
    notes: manifest.notes,
  };
}

async function findOrInferHtmlEntry(root, pathsFromCurrentWrite) {
  const writtenHtml = pathsFromCurrentWrite
    .filter((filePath) => filePath.toLowerCase().endsWith('.html'))
    .sort((left, right) => {
      const leftIndex = left.toLowerCase().endsWith('index.html') ? 0 : 1;
      const rightIndex = right.toLowerCase().endsWith('index.html') ? 0 : 1;
      return leftIndex - rightIndex || left.localeCompare(right);
    });
  const candidates = [
    ...writtenHtml,
    'renderer/index.html',
    'app/index.html',
    'src/index.html',
    'index.html',
  ];

  for (const candidate of [...new Set(candidates)]) {
    if (pathsFromCurrentWrite.includes(candidate) || (await exists(path.join(root, candidate)))) {
      return candidate;
    }
  }

  throw new Error('No HTML entry was generated. Browser and Electron launches need renderer/index.html or another .html file.');
}

async function ensureEntryAssets(root, entryPath) {
  if (!entryPath || !entryPath.toLowerCase().endsWith('.html')) {
    return;
  }
  const entryFullPath = resolveInside(root, entryPath);
  let html = '';
  try {
    html = await fs.readFile(entryFullPath, 'utf8');
  } catch {
    return;
  }

  const entryDir = path.dirname(entryFullPath);
  const assetRefs = extractLocalHtmlAssetRefs(html);
  for (const assetRef of assetRefs) {
    const target = path.resolve(entryDir, assetRef);
    if (!target.startsWith(root) || (await exists(target))) {
      continue;
    }
    const source = await findFallbackAsset(root, assetRef);
    if (!source || source === target) {
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
}

function extractLocalHtmlAssetRefs(html) {
  const refs = [];
  const attributePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = attributePattern.exec(html)) !== null) {
    const ref = match[1].trim();
    if (!ref || isExternalAssetRef(ref) || ref.startsWith('#')) {
      continue;
    }
    const cleanRef = ref.split(/[?#]/)[0];
    if (cleanRef && !path.isAbsolute(cleanRef) && !cleanRef.startsWith('/')) {
      refs.push(cleanRef);
    }
  }
  return [...new Set(refs)];
}

function isExternalAssetRef(ref) {
  return /^(?:[a-z]+:)?\/\//i.test(ref) || /^(?:data|blob|mailto):/i.test(ref);
}

async function findFallbackAsset(root, assetRef) {
  const basename = path.basename(assetRef);
  const candidates = [
    assetRef,
    basename,
    basename.toLowerCase() === 'script.js' ? 'app.js' : '',
    basename.toLowerCase() === 'app.js' ? 'script.js' : '',
    path.join('renderer', basename),
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    const fullPath = path.resolve(root, candidate);
    if (fullPath.startsWith(root) && (await exists(fullPath))) {
      return fullPath;
    }
  }
  return '';
}

function inferLaunchKind(manifest) {
  const stack = String(manifest.stack || '').toLowerCase();
  if (manifest.launch?.kind) {
    return manifest.launch.kind;
  }
  if (stack.includes('electron') || stack.includes('desktop')) {
    return 'electron-window';
  }
  if (stack.includes('web') || String(manifest.entry || '').endsWith('.html')) {
    return 'browser';
  }
  if (manifest.launch?.command) {
    return 'command';
  }
  return 'none';
}

function inferStackFromManifest(manifest) {
  return manifest.stack || (inferLaunchKind(manifest) === 'electron-window' ? 'electron' : 'custom');
}

function inferLanguageFromManifest(manifest) {
  return manifest.language || (String(manifest.stack || '').includes('python') ? 'python' : 'mixed');
}

function resolveInside(root, relativePath) {
  const resolved = path.resolve(root, String(relativePath || ''));
  if (!resolved.startsWith(root)) {
    throw new Error(`Refusing to launch outside project: ${relativePath}`);
  }
  return resolved;
}

function quoteShellArg(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function buildGeneratedMain(displayName, entryPath) {
  const escapedTitle = JSON.stringify(displayName);
  const escapedEntry = JSON.stringify(entryPath);
  return `const { app, BrowserWindow } = require('electron');\nconst path = require('node:path');\n\nfunction createWindow() {\n  const win = new BrowserWindow({\n    width: 1180,\n    height: 780,\n    minWidth: 860,\n    minHeight: 560,\n    title: ${escapedTitle},\n    backgroundColor: '#f4f7f2',\n    webPreferences: {\n      preload: path.join(__dirname, 'preload.cjs'),\n      contextIsolation: true,\n      nodeIntegration: false,\n    },\n  });\n\n  win.loadFile(path.join(__dirname, '..', ${escapedEntry}));\n}\n\napp.whenReady().then(() => {\n  createWindow();\n\n  app.on('activate', () => {\n    if (BrowserWindow.getAllWindows().length === 0) {\n      createWindow();\n    }\n  });\n});\n\napp.on('window-all-closed', () => {\n  if (process.platform !== 'darwin') {\n    app.quit();\n  }\n});\n`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function callChatCompletion(provider, messages) {
  if (!provider?.endpoint || !provider?.model) {
    throw new Error('Select a provider with endpoint and model.');
  }

  const headers = {
    'Content-Type': 'application/json',
    ...parseHeaders(provider.headers),
  };
  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  const endpoint = normalizeChatEndpoint(provider.endpoint);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: 0.45,
      stream: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLM request failed (${response.status}) at ${endpoint}: ${detail.slice(0, 800)}`);
  }

  const body = await response.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    const preview = body.trim().slice(0, 240);
    throw new Error(
      `LLM endpoint returned non-JSON from ${endpoint}. ` +
        `Check the provider endpoint in Models. Response started with: ${preview}`,
    );
  }
  const content = json?.choices?.[0]?.message?.content ?? json?.message?.content;
  if (!content) {
    throw new Error('The provider returned no assistant content.');
  }
  return content;
}

function execCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = exec(command, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk;
      mainWindow?.webContents.send('studio:opendesign-log', String(chunk));
    });
    child.stderr?.on('data', (chunk) => {
      output += chunk;
      mainWindow?.webContents.send('studio:opendesign-log', String(chunk));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(output.trim() || `Command exited with code ${code}`));
      }
    });
  });
}

async function validateOpenDesignCommand(command) {
  const tokenMatch = command.trim().match(/^"([^"]+)"|^(\S+)/);
  const firstToken = tokenMatch?.[1] ?? tokenMatch?.[2];
  const commandName = firstToken ? path.basename(firstToken, path.extname(firstToken)).toLowerCase() : '';
  if (!['open-design', 'opendesign', 'od'].includes(commandName)) {
    return true;
  }

  if (firstToken.includes('\\') || firstToken.includes('/')) {
    try {
      await fs.access(firstToken);
      return true;
    } catch {
      const message = `OpenDesign executable was not found at "${firstToken}".`;
      mainWindow?.webContents.send('studio:opendesign-log', message);
      return false;
    }
  }

  try {
    await execCommand(`where.exe ${firstToken}`, process.cwd());
    return true;
  } catch {
    const message =
      `OpenDesign command "${firstToken}" was not found on PATH.\n\n` +
      'Falling back to the built-in local design pass.';
    mainWindow?.webContents.send('studio:opendesign-log', message);
    return false;
  }
}

function isBuiltInOpenDesignCommand(command) {
  return command.trim().toLowerCase() === BUILTIN_OPENDESIGN_COMMAND;
}

function shouldMigrateOpenDesignCommand(command) {
  if (!command?.trim()) {
    return true;
  }

  const normalized = command.trim().replace(/\s+/g, ' ');
  return normalized === LEGACY_OPENDESIGN_COMMAND || normalized.startsWith('open-design --prompt ');
}

async function runBuiltInOpenDesign(payload, config) {
  mainWindow?.webContents.send('studio:opendesign-log', '> builtin:opendesign');
  const install = await discoverOpenDesignInstall();
  const brief = payload.brief?.trim() || 'A local app generated from an OpenDesign brief.';
  const source = payload.source?.trim() || 'No external source provided.';
  const keywords = extractKeywords(brief);
  const templateHint = keywords.includes('dashboard')
    ? 'dense dashboard with scan-first panels'
    : keywords.includes('game')
      ? 'interactive play surface with compact controls'
      : keywords.includes('editor') || keywords.includes('canvas')
        ? 'canvas-led editor with persistent side rails'
        : 'application workbench with immediate controls';

  const proposal = {
    brief,
    source,
    install,
    keywords,
    templateHint,
    generatedAt: new Date().toISOString(),
    palette: ['#15272B', '#165D66', '#F05A4F', '#F4F7F2', '#C7D4CE'],
    structure: [
      'Project and mode rail stays compact and resizable',
      'Proposal preview is the largest first-run surface',
      'Handoff notes stay visible beside the preview',
      'Vibe code consumes proposal notes and generated proposal files',
    ],
  };

  const activeProvider =
    config.providers?.find((provider) => provider.id === config.activeProviderId) ?? config.providers?.[0];
  const modelProposal = await generateModelDesignProposal(activeProvider, proposal);
  if (modelProposal) {
    await writeProjectFiles(payload.projectPath, modelProposal.files);
    await fs.writeFile(
      path.join(payload.projectPath, 'opendesign-spec.json'),
      JSON.stringify({ ...proposal, generatedBy: activeProvider?.name || 'model' }, null, 2),
      'utf8',
    );
    return modelProposal.notes;
  }

  const output = `# OpenDesign Proposal

## Input

Brief: ${brief}

Source: ${source}

## Proposed Product Direction

- Product type: ${templateHint}
- Primary workflow: design source -> initial OpenDesign proposal -> approved handoff -> generated functional app -> local preview
- User posture: iterative builder who wants the visual proposal before code generation

## Initial Screen Proposal

- A resizable project rail gives the preview room without hiding local app context
- The first OpenDesign run creates this proposal preview before vibe coding starts
- The proposal focuses on layout, visual hierarchy, states, and the handoff contract
- The coding stage should preserve this preview's structure unless the user revises the brief

## Visual Direction

- Palette: ink green #15272B, drafting green #165D66, coral action #F05A4F, paper #F4F7F2, line #C7D4CE
- Typography: system UI for Windows readability, heavier weights for tool labels, monospaced code blocks
- Signature: blueprint proposal board with GUI, LLM, and runtime lanes
- Layout rule: no marketing landing page; open directly into the usable local studio

## Functional Handoff Requirements

- Run OpenDesign must always produce a handoff artifact even when no external CLI exists
- Vibe code must accept any OpenAI-compatible endpoint that implements /v1/chat/completions
- Generated files must stay inside the selected project folder
- Preview should load index.html from disk without requiring a separate dev server

## Generated Proposal Artifact

- opendesign-proposal.html
- opendesign-spec.json
- opendesign-output.md

## OpenDesign Install

${install ? `Detected desktop install: ${install}` : 'No desktop install detected in common Windows locations.'}

## Recommended Vibe Coding Prompt

Build a functional local app from this proposal. Preserve the preview's information architecture, implement real interactions first, and treat visual design as part of product behavior rather than decoration.
`;

  await fs.writeFile(
    path.join(payload.projectPath, 'opendesign-proposal.html'),
    buildFallbackProposalHtml(proposal),
    'utf8',
  );
  await fs.writeFile(
    path.join(payload.projectPath, 'opendesign-spec.json'),
    JSON.stringify(proposal, null, 2),
    'utf8',
  );

  return output;
}

async function generateModelDesignProposal(provider, proposal) {
  if (!provider?.endpoint || !provider?.model) {
    mainWindow?.webContents.send('studio:opendesign-log', 'No model endpoint configured; using local proposal renderer.');
    return null;
  }

  try {
    mainWindow?.webContents.send(
      'studio:opendesign-log',
      `Generating UI proposal with ${provider.name || provider.model}...`,
    );
    const response = await callChatCompletion(provider, [
      {
        role: 'system',
        content:
          'You are OpenDesign running as a UI proposal engine. Create a static visual UI mockup, not a functional app and not a text poster.',
      },
      {
        role: 'user',
        content: [
          'Create the first design proposal for this app before coding begins.',
          '',
          `Brief: ${proposal.brief}`,
          `Source: ${proposal.source}`,
          `Detected product type: ${proposal.templateHint}`,
          `Keywords: ${proposal.keywords.join(', ')}`,
          '',
          'Return exactly two fenced blocks and no extra prose:',
          '```markdown',
          '# Proposal notes',
          'Short design rationale and handoff notes here.',
          '```',
          '```html',
          '<!doctype html><html>complete standalone proposal mockup here</html>',
          '```',
          '',
          'Hard requirements for the HTML block:',
          '- It must look like an actual Windows desktop app UI mockup for the requested product.',
          '- It must include real controls, panels, tables, forms, navigation, states, and sample data.',
          '- It must not use the brief as a giant headline.',
          '- It must not be a marketing landing page.',
          '- It must be standalone HTML with embedded CSS only.',
          '- It must fit inside an iframe preview without horizontal overflow.',
          '- Keep all text readable and all buttons/fields visually polished.',
        ].join('\n'),
      },
    ]);

    const parsed = parseDesignProposalResponse(response);

    return {
      notes: parsed.notes,
      files: [
        {
          path: 'opendesign-proposal.html',
          content: parsed.html,
        },
      ],
    };
  } catch (error) {
    mainWindow?.webContents.send(
      'studio:opendesign-log',
      `Model proposal failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    mainWindow?.webContents.send('studio:opendesign-log', 'Using local proposal renderer instead.');
    return null;
  }
}

async function discoverOpenDesignInstall() {
  const candidates = [
    path.join(app.getPath('home'), 'AppData', 'Local', 'Programs', 'Open Design', 'Open Design.exe'),
    path.join(app.getPath('home'), 'Downloads', 'open-design-0.11.0-win-x64-setup.exe'),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  return '';
}

function buildFallbackProposalHtml(proposal) {
  const title = escapeHtml(makeProductTitle(proposal.brief));
  const source = escapeHtml(proposal.source);
  const templateHint = escapeHtml(proposal.templateHint);
  const keywords = proposal.keywords.length ? proposal.keywords : ['local', 'design', 'code'];
  const keywordMarkup = keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join('');
  const isRouter = /endpoint|api|model|route|freellmapi|llm/i.test(proposal.brief);
  const sampleRows = isRouter
    ? [
        ['FreeLLMAPI', '34 models', 'Healthy', 'Router default'],
        ['OpenAI-compatible', '12 models', 'Key needed', 'Fallback'],
        ['Local Ollama', '7 models', 'Online', 'Private tasks'],
      ]
    : [
        ['Primary workspace', 'Ready', 'Main user flow'],
        ['Data source', 'Connected', 'Local files'],
        ['Preview runtime', 'Online', 'Disk HTML'],
      ];
  const rowMarkup = sampleRows
    .map(
      ([name, models, status, route]) =>
        `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(models)}</td><td><span class="status">${escapeHtml(status)}</span></td><td>${escapeHtml(route)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenDesign Proposal</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #15201f;
        background: #f4f7f2;
      }

      * {
        box-sizing: border-box;
      }

      body { margin: 0; min-height: 100vh; background: #eaf0ec; }
      .app { display: grid; grid-template-columns: 76px minmax(0, 1fr); min-height: 100vh; }
      .nav { display: grid; align-content: start; gap: 12px; padding: 24px 14px; background: #15272b; color: white; }
      .logo, .nav button { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 8px; }
      .logo { background: #f05a4f; font-weight: 950; }
      .nav button { border: 0; background: rgba(255,255,255,0.1); color: white; font-weight: 800; }
      .nav button.active { background: white; color: #15272b; }
      .workspace { padding: 24px; min-width: 0; }
      .topbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
      .kicker { margin: 0 0 5px; color: #165d66; font-size: 0.72rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.5rem); letter-spacing: 0; }
      .actions { display: flex; gap: 10px; }
      .actions button, .primary { border: 0; border-radius: 7px; padding: 12px 14px; background: #165d66; color: white; font-weight: 850; }
      .actions button:nth-child(2) { background: white; color: #15272b; border: 1px solid #c7d4ce; }
      .layout { display: grid; grid-template-columns: minmax(360px, 0.95fr) minmax(320px, 1.05fr); gap: 16px; }
      .panel { border: 1px solid #c7d4ce; border-radius: 8px; background: rgba(255,255,255,0.9); box-shadow: 0 18px 45px rgba(21,32,31,0.08); padding: 18px; }
      .panel h2 { margin: 0 0 14px; font-size: 1rem; }
      .form { display: grid; gap: 12px; }
      label { display: grid; gap: 6px; color: #536b66; font-size: 0.78rem; font-weight: 850; text-transform: uppercase; letter-spacing: 0.06em; }
      input, select { width: 100%; border: 1px solid #c7d4ce; border-radius: 7px; padding: 12px; background: #fbfdf9; color: #15201f; font: inherit; }
      .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
      .metric { border: 1px solid #d7e1dc; border-radius: 8px; padding: 14px; background: #f8fbf7; }
      .metric strong { display: block; font-size: 1.6rem; }
      .metric span { color: #60746f; font-size: 0.78rem; font-weight: 760; }
      table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; }
      th, td { border-bottom: 1px solid #dbe5df; padding: 12px; text-align: left; font-size: 0.9rem; }
      th { color: #52706c; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; }
      .status { display: inline-flex; border-radius: 999px; padding: 5px 8px; background: #e8f4ef; color: #165d66; font-size: 0.78rem; font-weight: 800; }
      .router { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin-top: 16px; }
      .route-card { border: 1px solid #d7e1dc; border-radius: 8px; padding: 14px; background: #fbfdf9; min-height: 112px; }
      .arrow { color: #f05a4f; font-size: 1.8rem; font-weight: 950; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
      .chips span { border: 1px solid #c7d4ce; border-radius: 999px; padding: 7px 10px; color: #315052; font-size: 0.78rem; font-weight: 780; background: #f4f7f2; }
      .source { margin-top: 14px; color: #60746f; font-size: 0.86rem; line-height: 1.45; }
      @media (max-width: 820px) { .app, .layout, .split, .router, .metric-grid { grid-template-columns: 1fr; } .nav { display: none; } }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="nav">
        <div class="logo">OD</div>
        <button class="active">API</button>
        <button>AI</button>
        <button>Log</button>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div>
            <p class="kicker">OpenDesign proposal</p>
            <h1>${title}</h1>
          </div>
          <div class="actions">
            <button>Sync models</button>
            <button>Test route</button>
          </div>
        </header>
        <section class="layout">
          <article class="panel">
            <h2>Endpoint router</h2>
            <div class="form">
              <label>Central endpoint<input value="http://127.0.0.1:31415/v1/chat/completions" /></label>
              <div class="split">
                <label>API key<input type="password" value="••••••••••••••••••" /></label>
                <label>Routing mode<select><option>Best available model</option><option>Lowest latency</option><option>Private local first</option></select></label>
              </div>
              <button class="primary">Discover models</button>
            </div>
            <div class="router">
              <div class="route-card"><strong>User request</strong><p>${templateHint}</p></div>
              <div class="arrow">→</div>
              <div class="route-card"><strong>Smart route</strong><p>Classify task, check available models, pick the strongest healthy endpoint.</p></div>
            </div>
          </article>
          <article class="panel">
            <div class="metric-grid">
              <div class="metric"><strong>53</strong><span>available models</span></div>
              <div class="metric"><strong>4</strong><span>providers</span></div>
              <div class="metric"><strong>92ms</strong><span>router check</span></div>
            </div>
            <h2>Model inventory</h2>
            <table>
              <thead><tr><th>Provider</th><th>Models</th><th>Status</th><th>Route</th></tr></thead>
              <tbody>${rowMarkup}</tbody>
            </table>
            <div class="chips">${keywordMarkup}</div>
            <p class="source">Source: ${source}</p>
          </article>
        </section>
      </main>
    </div>
  </body>
</html>`;
}

function extractKeywords(value) {
  return [...new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 16),
  )];
}

function makeProductTitle(brief) {
  const lower = String(brief || '').toLowerCase();
  if (lower.includes('freellmapi') || lower.includes('llm') || lower.includes('model')) {
    return 'Model Router Studio';
  }
  if (lower.includes('dashboard')) {
    return 'Operations Dashboard';
  }
  if (lower.includes('editor') || lower.includes('canvas')) {
    return 'Design Editor';
  }
  if (lower.includes('task')) {
    return 'Task Workspace';
  }
  return 'Local App Studio';
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 42) || 'app';
}

function escapeForCommand(value) {
  return String(value).replaceAll('"', '\\"');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseHeaders(raw) {
  if (!raw?.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce((headers, line) => {
        const separator = line.indexOf(':');
        if (separator > 0) {
          headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
        }
        return headers;
      }, {});
  }
}

function parseJsonObject(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1]?.trim() || text;
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error('Model did not return a JSON object.');
  }
  return JSON.parse(source.slice(firstBrace, lastBrace + 1));
}

function parseDesignProposalResponse(raw) {
  const text = String(raw || '').trim();
  const htmlMatch = text.match(/```html\s*([\s\S]*?)```/i);
  const markdownMatch = text.match(/```markdown\s*([\s\S]*?)```/i) ?? text.match(/```md\s*([\s\S]*?)```/i);

  if (htmlMatch?.[1]) {
    return {
      notes: markdownMatch?.[1]?.trim() || '# Proposal notes\n\nGenerated UI proposal.',
      html: htmlMatch[1].trim(),
    };
  }

  const parsed = parseJsonObject(text);
  const htmlFile = parsed.files?.find((file) => file.path === 'opendesign-proposal.html');
  if (!parsed.notes || !htmlFile?.content) {
    throw new Error('Model proposal did not include notes and opendesign-proposal.html.');
  }
  return {
    notes: String(parsed.notes),
    html: String(htmlFile.content),
  };
}

function normalizeChatEndpoint(endpoint) {
  const trimmed = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return trimmed;
  }

  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }

  if (/\/v1$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }

  if (/\/v1\/?$/i.test(`${trimmed}/`)) {
    return `${trimmed.replace(/\/+$/, '')}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}
