import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import {
  Bot,
  Braces,
  Check,
  Code2,
  ExternalLink,
  FileCode2,
  FolderInput,
  FolderOpen,
  Loader2,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import type { AppConfig, GeneratedFile, Provider, StudioProject, StudioState } from './types';
import { createFallbackApp, extractGeneratedFiles } from './vibe';

const defaultState: StudioState = {
  config: {
    activeProviderId: undefined,
    providers: [],
    openDesignCommand: '',
    coderSystemPrompt: '',
  },
  projects: [],
};

type View = 'design' | 'code' | 'settings';

type VibeProgress = {
  label: string;
  step: number;
  total: number;
};

export function App() {
  const [state, setState] = useState<StudioState>(defaultState);
  const [activeProjectId, setActiveProjectId] = useState<string>();
  const [view, setView] = useState<View>('design');
  const [brief, setBrief] = useState(
    'A polished local task app with a visual canvas, persistent projects, and AI-assisted edits.',
  );
  const [source, setSource] = useState('');
  const [designOutput, setDesignOutput] = useState('');
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('index.html');
  const [chatPrompt, setChatPrompt] = useState(
    'Turn the OpenDesign output and brief into a complete functional static app. Make it feel production-ready.',
  );
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState<string>();
  const [logs, setLogs] = useState<string[]>([]);
  const [configDraft, setConfigDraft] = useState<AppConfig>(defaultState.config);
  const [projectRailWidth, setProjectRailWidth] = useState(292);
  const [vibeProgress, setVibeProgress] = useState<VibeProgress>();

  useEffect(() => {
    void refreshState();
    return window.studio.onOpenDesignLog((line) => {
      setLogs((current) => [...current.slice(-120), line.trimEnd()]);
    });
  }, []);

  useEffect(() => {
    setConfigDraft(state.config);
    if (!activeProjectId && state.projects[0]) {
      setActiveProjectId(state.projects[0].id);
    }
  }, [state, activeProjectId]);

  const activeProject = useMemo(
    () => state.projects.find((project) => project.id === activeProjectId) ?? state.projects[0],
    [state.projects, activeProjectId],
  );

  const activeProvider = useMemo(
    () =>
      state.config.providers.find((provider) => provider.id === state.config.activeProviderId) ??
      state.config.providers[0],
    [state.config],
  );

  const selectedContent = useMemo(
    () => files.find((file) => file.path === selectedFile)?.content ?? '',
    [files, selectedFile],
  );

  const previewFile = useMemo(() => {
    if (!activeProject) {
      return '';
    }
    const index = files.find((file) => file.path.endsWith('index.html'));
    return index ? `file:///${activeProject.path.replace(/\\/g, '/')}/${index.path}` : '';
  }, [activeProject, files]);

  const proposalPreviewFile = useMemo(() => {
    if (!activeProject) {
      return '';
    }
    const proposal = files.find((file) => file.path.endsWith('opendesign-proposal.html'));
    return proposal ? `file:///${activeProject.path.replace(/\\/g, '/')}/${proposal.path}` : '';
  }, [activeProject, files]);

  function startProjectRailResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = projectRailWidth;

    function onMove(moveEvent: MouseEvent) {
      const nextWidth = Math.min(420, Math.max(148, startWidth + moveEvent.clientX - startX));
      setProjectRailWidth(nextWidth);
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing-rail');
    }

    document.body.classList.add('is-resizing-rail');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function refreshState() {
    const next = await window.studio.getState();
    setState(next);
  }

  async function createProject() {
    const name = window.prompt('Name this app', 'Untitled vibe app');
    if (!name) {
      return;
    }
    await createProjectFromName(name);
  }

  async function createProjectFromName(name: string) {
    setBusy('project');
    try {
      const next = await window.studio.createProject(name);
      setState(next);
      setActiveProjectId(next.projects[0]?.id);
      setFiles([]);
      setStatus(`Created ${name}`);
      return next.projects[0];
    } finally {
      setBusy(undefined);
    }
  }

  async function ensureProject() {
    if (activeProject) {
      return activeProject;
    }
    const name = brief
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(' ')
      .replace(/[^\w\s-]/g, '')
      .trim();
    return createProjectFromName(name || 'Untitled vibe app');
  }

  async function importProject() {
    setBusy('project');
    try {
      const next = await window.studio.importProject();
      setState(next);
      setActiveProjectId(next.projects[0]?.id);
      setStatus('Imported folder');
    } finally {
      setBusy(undefined);
    }
  }

  async function loadFiles(project = activeProject) {
    if (!project) {
      return;
    }
    setBusy('files');
    try {
      const nextFiles = await window.studio.readProjectFiles(project.path);
      setFiles(nextFiles);
      setSelectedFile(nextFiles.find((file) => file.path.endsWith('index.html'))?.path ?? nextFiles[0]?.path ?? '');
      setStatus(`Loaded ${nextFiles.length} files`);
    } finally {
      setBusy(undefined);
    }
  }

  async function runOpenDesign() {
    const project = await ensureProject();
    if (!project) {
      setStatus('Create or import a project first.');
      return;
    }
    setBusy('opendesign');
    setLogs([]);
    try {
      const result = await window.studio.runOpenDesign({
        projectPath: project.path,
        brief,
        source,
      });
      setDesignOutput(result.output || 'OpenDesign command completed.');
      setStatus('OpenDesign proposal ready');
      await loadFiles(project);
    } catch (error) {
      const message = readError(error);
      setDesignOutput(message);
      setStatus(message);
    } finally {
      setBusy(undefined);
    }
  }

  async function generateApp() {
    const project = await ensureProject();
    if (!project) {
      setStatus('Create or import a project first.');
      return;
    }

    setBusy('generate');
    setVibeProgress({ label: 'Preparing project context', step: 1, total: 5 });
    try {
      let generated: GeneratedFile[];
      if (!activeProvider?.endpoint) {
        setVibeProgress({ label: 'Building local fallback files', step: 2, total: 5 });
        generated = createFallbackApp(brief, designOutput);
        setStatus('Generated fallback starter because no provider is configured');
      } else {
        setVibeProgress({ label: 'Reading proposal and existing files', step: 2, total: 5 });
        const existingFiles = await window.studio.readProjectFiles(project.path);
        setVibeProgress({ label: `Vibe coding with ${activeProvider.name}`, step: 3, total: 5 });
        const response = await window.studio.chat({
          provider: activeProvider,
          messages: [
            { role: 'system', content: state.config.coderSystemPrompt },
            {
              role: 'user',
              content: [
                `Brief:\n${brief}`,
                `OpenDesign output:\n${designOutput || 'No OpenDesign output yet.'}`,
                `User coding request:\n${chatPrompt}`,
                `Existing files:\n${JSON.stringify(existingFiles.slice(0, 20))}`,
                'Return only JSON in this shape: {"files":[{"path":"index.html","content":"..."},{"path":"styles.css","content":"..."},{"path":"app.js","content":"..."}]}',
              ].join('\n\n'),
            },
          ],
        });
        setVibeProgress({ label: 'Parsing generated file manifest', step: 4, total: 5 });
        generated = extractGeneratedFiles(response);
      }

      setVibeProgress({ label: `Writing ${generated.length} files`, step: 5, total: 5 });
      const written = await window.studio.writeProjectFiles(project.path, generated);
      setFiles(written);
      setSelectedFile(written.find((file) => file.path.endsWith('index.html'))?.path ?? written[0]?.path ?? '');
      setStatus(`Generated ${written.length} files`);
      setView('code');
      setVibeProgress({ label: 'Preview ready', step: 5, total: 5 });
    } catch (error) {
      setStatus(readError(error));
      setVibeProgress({ label: 'Vibe coding stopped', step: 0, total: 5 });
    } finally {
      setBusy(undefined);
      window.setTimeout(() => setVibeProgress(undefined), 2200);
    }
  }

  async function saveConfig() {
    setBusy('settings');
    try {
      const next = await window.studio.saveConfig(configDraft);
      setState(next);
      setStatus('Settings saved');
    } finally {
      setBusy(undefined);
    }
  }

  function updateProvider(id: string, patch: Partial<Provider>) {
    setConfigDraft((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === id ? { ...provider, ...patch } : provider,
      ),
    }));
  }

  function addProvider() {
    const id = `provider-${Date.now()}`;
    setConfigDraft((current) => ({
      ...current,
      activeProviderId: id,
      providers: [
        ...current.providers,
        {
          id,
          name: 'New endpoint',
          endpoint: 'http://127.0.0.1:4000/v1/chat/completions',
          apiKey: '',
          model: 'local-model',
        },
      ],
    }));
  }

  const navItems: Array<{ id: View; label: string; icon: typeof Palette }> = [
    { id: 'design', label: 'Design', icon: Palette },
    { id: 'code', label: 'Code', icon: Code2 },
    { id: 'settings', label: 'Models', icon: Settings },
  ];

  return (
    <div
      className="app-shell"
      style={{
        '--project-rail-width': `${projectRailWidth}px`,
      } as CSSProperties}
    >
      <aside className="rail">
        <div className="brand-mark">
          <Sparkles size={18} />
          <span>OD</span>
        </div>
        <nav className="rail-tabs">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? 'icon-tab active' : 'icon-tab'}
                onClick={() => setView(item.id)}
                title={item.label}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="project-actions">
          <button className="icon-only" onClick={createProject} title="New project">
            <Plus size={18} />
          </button>
          <button className="icon-only" onClick={importProject} title="Import folder">
            <FolderInput size={18} />
          </button>
        </div>
      </aside>

      <section className="project-rail">
        <header className="rail-header">
          <p>Local apps</p>
          <button className="ghost-icon" onClick={() => void refreshState()} title="Refresh projects">
            <RefreshCw size={15} />
          </button>
        </header>
        <div className="project-list">
          {state.projects.map((project) => (
            <button
              key={project.id}
              className={project.id === activeProject?.id ? 'project-row active' : 'project-row'}
              onClick={() => {
                setActiveProjectId(project.id);
                void loadFiles(project);
              }}
            >
              <span>{project.name}</span>
              <small>{compactPath(project.path)}</small>
            </button>
          ))}
          {!state.projects.length && (
            <div className="empty-state">
              <FolderOpen size={22} />
              <span>Create or import a local app folder.</span>
            </div>
          )}
        </div>
      </section>

      <div
        className="rail-resizer"
        onMouseDown={startProjectRailResize}
        title="Resize project rail"
        role="separator"
        aria-orientation="vertical"
      />

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">OpenDesign Vibe Studio</p>
            <h1>{activeProject?.name ?? 'No project selected'}</h1>
          </div>
          <div className="topbar-actions">
            <span className="provider-pill">
              <Bot size={15} />
              {activeProvider?.name ?? 'No model'}
            </span>
            {activeProject && (
              <button className="secondary" onClick={() => window.studio.openPath(activeProject.path)}>
                <ExternalLink size={16} />
                Folder
              </button>
            )}
          </div>
        </header>

        {view === 'design' && (
          <DesignView
            brief={brief}
            source={source}
            designOutput={designOutput}
            proposalPreviewFile={proposalPreviewFile}
            logs={logs}
            busy={busy}
            status={status}
            vibeProgress={vibeProgress}
            onBrief={setBrief}
            onSource={setSource}
            onDesignOutput={setDesignOutput}
            onRunOpenDesign={runOpenDesign}
            onGenerate={generateApp}
          />
        )}

        {view === 'code' && (
          <CodeView
            files={files}
            selectedFile={selectedFile}
            selectedContent={selectedContent}
            previewFile={previewFile}
            chatPrompt={chatPrompt}
            busy={busy}
            status={status}
            vibeProgress={vibeProgress}
            onSelectFile={setSelectedFile}
            onChatPrompt={setChatPrompt}
            onLoad={() => void loadFiles()}
            onGenerate={generateApp}
          />
        )}

        {view === 'settings' && (
          <SettingsView
            config={configDraft}
            busy={busy}
            onConfig={setConfigDraft}
            onSave={saveConfig}
            onAddProvider={addProvider}
            onUpdateProvider={updateProvider}
          />
        )}
      </main>
    </div>
  );
}

function DesignView(props: {
  brief: string;
  source: string;
  designOutput: string;
  proposalPreviewFile: string;
  logs: string[];
  busy?: string;
  status: string;
  vibeProgress?: VibeProgress;
  onBrief: (value: string) => void;
  onSource: (value: string) => void;
  onDesignOutput: (value: string) => void;
  onRunOpenDesign: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="design-grid">
      <section className="canvas-pane">
        <div className="pane-title">
          <div>
            <p className="eyebrow">Initial proposal</p>
            <h2>Design preview</h2>
          </div>
          <button className="primary" onClick={props.onRunOpenDesign} disabled={!!props.busy}>
            {props.busy === 'opendesign' ? <Loader2 className="spin" size={17} /> : <Palette size={17} />}
            Run OpenDesign
          </button>
        </div>
        <textarea
          className="brief-input"
          value={props.brief}
          onChange={(event) => props.onBrief(event.target.value)}
          placeholder="Describe the app, design source, target users, and interaction model."
        />
        <input
          className="source-input"
          value={props.source}
          onChange={(event) => props.onSource(event.target.value)}
          placeholder="Optional Figma URL, image path, or design reference"
        />
        {props.proposalPreviewFile ? (
          <iframe className="proposal-preview" title="OpenDesign proposal preview" src={props.proposalPreviewFile} />
        ) : (
          <div className="canvas-stage">
            <div className="blueprint-line horizontal" />
            <div className="blueprint-line vertical" />
            <div className="floating-node node-a">GUI</div>
            <div className="floating-node node-b">LLM</div>
            <div className="floating-node node-c">APP</div>
          </div>
        )}
      </section>

      <section className="output-pane">
        <div className="pane-title">
          <div>
            <p className="eyebrow">Handoff</p>
            <h2>Proposal notes</h2>
          </div>
          <button className="primary coral" onClick={props.onGenerate} disabled={!!props.busy}>
            {props.busy === 'generate' ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
            Vibe code
          </button>
        </div>
        {props.vibeProgress && <VibeProgressStrip progress={props.vibeProgress} />}
        <textarea
          className="output-input"
          value={props.designOutput}
          onChange={(event) => props.onDesignOutput(event.target.value)}
          placeholder="OpenDesign output appears here. You can also paste visual specs manually."
        />
        <div className="terminal-pane">
          <div className="terminal-title">
            <TerminalSquare size={15} />
            <span>{props.status}</span>
          </div>
          <pre>{props.logs.length ? props.logs.join('\n') : 'No command output yet.'}</pre>
        </div>
      </section>
    </div>
  );
}

function CodeView(props: {
  files: GeneratedFile[];
  selectedFile: string;
  selectedContent: string;
  previewFile: string;
  chatPrompt: string;
  busy?: string;
  status: string;
  vibeProgress?: VibeProgress;
  onSelectFile: (path: string) => void;
  onChatPrompt: (value: string) => void;
  onLoad: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="code-grid">
      <section className="file-browser">
        <div className="pane-title compact">
          <div>
            <p className="eyebrow">Files</p>
            <h2>Manifest</h2>
          </div>
          <button className="ghost-icon" onClick={props.onLoad} title="Reload files">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="file-list">
          {props.files.map((file) => (
            <button
              key={file.path}
              className={file.path === props.selectedFile ? 'file-row active' : 'file-row'}
              onClick={() => props.onSelectFile(file.path)}
            >
              <FileCode2 size={15} />
              <span>{file.path}</span>
            </button>
          ))}
          {!props.files.length && <div className="empty-state">Generate files to fill this lane.</div>}
        </div>
        <div className="mini-composer">
          <textarea value={props.chatPrompt} onChange={(event) => props.onChatPrompt(event.target.value)} />
          {props.vibeProgress && <VibeProgressStrip progress={props.vibeProgress} />}
          <button className="primary coral" onClick={props.onGenerate} disabled={!!props.busy}>
            {props.busy === 'generate' ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
            Generate
          </button>
        </div>
      </section>

      <section className="editor-pane">
        <div className="pane-title compact">
          <div>
            <p className="eyebrow">Editor</p>
            <h2>{props.selectedFile || 'No file'}</h2>
          </div>
          <span className="status-chip">{props.status}</span>
        </div>
        <pre className="code-block">{props.selectedContent || 'Select a generated file.'}</pre>
      </section>

      <section className="preview-pane">
        <div className="pane-title compact">
          <div>
            <p className="eyebrow">Runtime</p>
            <h2>Preview</h2>
          </div>
          <Play size={17} />
        </div>
        {props.previewFile ? (
          <iframe title="Generated app preview" src={props.previewFile} />
        ) : (
          <div className="empty-preview">
            <Braces size={24} />
            <span>Generate an index.html file to preview the app.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function VibeProgressStrip({ progress }: { progress: VibeProgress }) {
  const percent = progress.total > 0 ? Math.max(6, Math.round((progress.step / progress.total) * 100)) : 6;

  return (
    <div className="vibe-progress" aria-live="polite">
      <div className="vibe-progress-row">
        <span>{progress.label}</span>
        <strong>
          {Math.max(progress.step, 0)}/{progress.total}
        </strong>
      </div>
      <div className="vibe-progress-track">
        <div style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function SettingsView(props: {
  config: AppConfig;
  busy?: string;
  onConfig: (config: AppConfig) => void;
  onSave: () => void;
  onAddProvider: () => void;
  onUpdateProvider: (id: string, patch: Partial<Provider>) => void;
}) {
  return (
    <div className="settings-grid">
      <section className="settings-main">
        <div className="pane-title">
          <div>
            <p className="eyebrow">Lobe-style routing</p>
            <h2>Custom endpoints</h2>
          </div>
          <div className="button-row">
            <button className="secondary" onClick={props.onAddProvider}>
              <Plus size={16} />
              Endpoint
            </button>
            <button className="primary" onClick={props.onSave} disabled={props.busy === 'settings'}>
              {props.busy === 'settings' ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
              Save
            </button>
          </div>
        </div>

        <div className="provider-stack">
          {props.config.providers.map((provider) => (
            <article className="provider-editor" key={provider.id}>
              <label>
                <span>Name</span>
                <input
                  value={provider.name}
                  onChange={(event) => props.onUpdateProvider(provider.id, { name: event.target.value })}
                />
              </label>
              <label>
                <span>Endpoint</span>
                <input
                  value={provider.endpoint}
                  onChange={(event) => props.onUpdateProvider(provider.id, { endpoint: event.target.value })}
                />
              </label>
              <label>
                <span>Model</span>
                <input
                  value={provider.model}
                  onChange={(event) => props.onUpdateProvider(provider.id, { model: event.target.value })}
                />
              </label>
              <label>
                <span>API key</span>
                <input
                  type="password"
                  value={provider.apiKey}
                  onChange={(event) => props.onUpdateProvider(provider.id, { apiKey: event.target.value })}
                />
              </label>
              <label className="wide">
                <span>Extra headers</span>
                <textarea
                  value={provider.headers ?? ''}
                  onChange={(event) => props.onUpdateProvider(provider.id, { headers: event.target.value })}
                  placeholder='{"HTTP-Referer":"http://localhost"}'
                />
              </label>
              <button
                className={
                  props.config.activeProviderId === provider.id ? 'select-provider selected' : 'select-provider'
                }
                onClick={() => props.onConfig({ ...props.config, activeProviderId: provider.id })}
              >
                <Check size={16} />
                Use endpoint
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-side">
        <label>
          <span>OpenDesign command</span>
          <textarea
            value={props.config.openDesignCommand}
            onChange={(event) => props.onConfig({ ...props.config, openDesignCommand: event.target.value })}
          />
        </label>
        <label>
          <span>Coder system prompt</span>
          <textarea
            value={props.config.coderSystemPrompt}
            onChange={(event) => props.onConfig({ ...props.config, coderSystemPrompt: event.target.value })}
          />
        </label>
        <div className="token-note">
          <strong>Tokens</strong>
          <span>Use <code>{'{brief}'}</code>, <code>{'{projectPath}'}</code>, and <code>{'{source}'}</code> in the OpenDesign command.</span>
        </div>
      </section>
    </div>
  );
}

function compactPath(value: string) {
  return value.replace(/^([A-Z]:\\Users\\[^\\]+\\)/i, '~\\');
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
