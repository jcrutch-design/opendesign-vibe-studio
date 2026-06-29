import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import {
  Bot,
  Braces,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  FolderInput,
  FolderOpen,
  HelpCircle,
  Loader2,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Rocket,
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

type BuildResult = {
  kind: 'real' | 'starter';
  providerName?: string;
  projectPath: string;
  previewPath?: string;
  filesWritten: number;
  completedAt: string;
  launchPrompt: string;
};

type ClarificationRequest = {
  projectId: string;
  questions: string[];
  answer: string;
  existingFiles: GeneratedFile[];
};

type GenerateOptions = {
  skipClarification?: boolean;
  clarificationAnswer?: string;
  existingFiles?: GeneratedFile[];
};

type WorkflowStageId = 'brief' | 'proposal' | 'questions' | 'build' | 'launch';

type WorkflowStage = {
  id: WorkflowStageId;
  label: string;
  state: 'done' | 'active' | 'pending';
};

type ReadyCheck = {
  label: string;
  ok: boolean;
};

type StatusTone = 'ready' | 'working' | 'waiting' | 'success' | 'danger';

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
  const [buildResult, setBuildResult] = useState<BuildResult>();
  const [clarification, setClarification] = useState<ClarificationRequest>();

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

  const workflowStages = useMemo(
    () =>
      getWorkflowStages({
        brief,
        designOutput,
        files,
        clarification,
        buildResult,
        busy,
      }),
    [brief, designOutput, files, clarification, buildResult, busy],
  );

  const readyChecks = useMemo(
    () =>
      getReadyChecks({
        activeProject,
        activeProvider,
        brief,
        designOutput,
      }),
    [activeProject, activeProvider, brief, designOutput],
  );

  const statusTone = getStatusTone({ status, busy, clarification, buildResult });

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
      setBuildResult(undefined);
      setClarification(undefined);
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
      setBuildResult(undefined);
      setClarification(undefined);
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

  async function generateApp(options: GenerateOptions = {}) {
    const project = await ensureProject();
    if (!project) {
      setStatus('Create or import a project first.');
      return;
    }

    setBusy('generate');
    setBuildResult(undefined);
    if (!options.skipClarification) {
      setClarification(undefined);
    }
    setVibeProgress({ label: 'Preparing project context', step: 1, total: activeProvider?.endpoint ? 6 : 5 });
    try {
      let generated: GeneratedFile[];
      let realBuild = true;
      if (!activeProvider?.endpoint) {
        setVibeProgress({ label: 'Building local fallback files', step: 2, total: 5 });
        generated = createFallbackApp(brief, designOutput);
        realBuild = false;
        setStatus('Generated fallback starter because no provider is configured');
      } else {
        setVibeProgress({ label: 'Reading proposal and existing files', step: 2, total: 6 });
        const existingFiles = options.existingFiles ?? (await window.studio.readProjectFiles(project.path));

        if (!options.skipClarification) {
          setVibeProgress({ label: 'Checking for open questions', step: 3, total: 6 });
          const questions = await requestClarifyingQuestions(activeProvider, existingFiles);
          if (questions.length) {
            setClarification({
              projectId: project.id,
              questions,
              answer: '',
              existingFiles,
            });
            setView('code');
            setStatus('The coding agent has a few questions before building.');
            setVibeProgress({ label: 'Waiting for your answers', step: 3, total: 6 });
            return;
          }
        }

        setVibeProgress({ label: `Vibe coding with ${activeProvider.name}`, step: 4, total: 6 });
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
                `Clarifications:\n${options.clarificationAnswer || 'No extra clarification. Proceed with reasonable product assumptions.'}`,
                `Existing files:\n${JSON.stringify(existingFiles.slice(0, 20))}`,
                'Return only complete file blocks and no extra prose.',
                'Use this exact format for every file:',
                '```file:index.html',
                '<!doctype html>...',
                '```',
                '```file:styles.css',
                '/* complete css */',
                '```',
                '```file:app.js',
                '// complete javascript',
                '```',
              ].join('\n\n'),
            },
          ],
        });
        setVibeProgress({ label: 'Parsing generated file manifest', step: 5, total: 6 });
        try {
          generated = extractGeneratedFiles(response);
        } catch (error) {
          setStatus('The model returned malformed JSON. Repairing the file manifest...');
          setVibeProgress({ label: 'Repairing malformed model output', step: 5, total: 6 });
          const repaired = await repairGeneratedFileManifest(activeProvider, response, readError(error));
          try {
            generated = extractGeneratedFiles(repaired);
          } catch (repairError) {
            throw new Error(
              `The model returned malformed file output twice. ` +
                `Try another model from the dropdown or add "return fenced file blocks, not JSON" to the coding request. ` +
                `Latest parser error: ${readError(repairError)}`,
            );
          }
        }
      }

      setVibeProgress({ label: `Writing ${generated.length} files`, step: activeProvider?.endpoint ? 6 : 5, total: activeProvider?.endpoint ? 6 : 5 });
      const written = await window.studio.writeProjectFiles(project.path, generated);
      setFiles(written);
      setSelectedFile(written.find((file) => file.path.endsWith('index.html'))?.path ?? written[0]?.path ?? '');
      const result = makeBuildResult(project, written, realBuild, activeProvider?.name);
      setBuildResult(result);
      setClarification(undefined);
      setStatus(
        result.kind === 'real'
          ? `Real app built: ${written.length} files ready to launch`
          : `Starter app built: ${written.length} files ready to launch`,
      );
      setView('code');
      setVibeProgress({ label: 'Build complete. Launch deck ready.', step: activeProvider?.endpoint ? 6 : 5, total: activeProvider?.endpoint ? 6 : 5 });
    } catch (error) {
      setStatus(readError(error));
      setVibeProgress({ label: 'Vibe coding stopped', step: 0, total: activeProvider?.endpoint ? 6 : 5 });
    } finally {
      setBusy(undefined);
      window.setTimeout(() => setVibeProgress(undefined), 2200);
    }
  }

  async function requestClarifyingQuestions(provider: Provider, existingFiles: GeneratedFile[]) {
    const response = await window.studio.chat({
      provider,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior product-minded coding agent. Decide whether you need clarification before building. Ask only questions whose answers would materially change architecture, workflows, data, integrations, or user-facing behavior.',
        },
        {
          role: 'user',
          content: [
            `Brief:\n${brief || 'No brief provided.'}`,
            `OpenDesign output:\n${designOutput || 'No OpenDesign output yet.'}`,
            `User coding request:\n${chatPrompt || 'No coding request provided.'}`,
            `Existing files:\n${JSON.stringify(existingFiles.slice(0, 12).map((file) => ({ path: file.path, size: file.content.length })))}`,
            'Return only JSON in this shape:',
            '{"questions":["question 1","question 2"]}',
            'Return {"questions":[]} when you can proceed with reasonable assumptions.',
            'Ask at most 3 concise questions.',
          ].join('\n\n'),
        },
      ],
    });

    return parseClarificationQuestions(response);
  }

  async function repairGeneratedFileManifest(provider: Provider, brokenResponse: string, parseError: string) {
    return window.studio.chat({
      provider,
      messages: [
        {
          role: 'system',
          content:
            'You repair malformed code-generation output. Do not write new code unless needed to preserve the original files. Convert the provided response into complete fenced file blocks.',
        },
        {
          role: 'user',
          content: [
            `Parse error:\n${parseError}`,
            'The previous answer was intended to contain generated app files, but its JSON was invalid.',
            'Rewrite it as file fences only, with no prose before or after.',
            'Use this exact format:',
            '```file:index.html',
            '<!doctype html>...',
            '```',
            '```file:styles.css',
            '/* complete css */',
            '```',
            '```file:app.js',
            '// complete javascript',
            '```',
            `Previous answer:\n${brokenResponse}`,
          ].join('\n\n'),
        },
      ],
    });
  }

  function updateClarificationAnswer(answer: string) {
    setClarification((current) => (current ? { ...current, answer } : current));
  }

  function cancelClarification() {
    setClarification(undefined);
    setStatus('Vibe coding paused.');
  }

  function buildWithClarification(answerOverride?: string) {
    if (!clarification) {
      return;
    }
    const answer = answerOverride ?? clarification.answer.trim();
    const formatted = [
      ...clarification.questions.map((question, index) => `Q${index + 1}: ${question}`),
      `User answer: ${answer || 'Proceed with your best product assumptions.'}`,
    ].join('\n');
    const existingFiles = clarification.existingFiles;
    setClarification(undefined);
    void generateApp({
      skipClarification: true,
      clarificationAnswer: formatted,
      existingFiles,
    });
  }

  async function launchBuiltApp() {
    if (!buildResult?.previewPath) {
      setStatus('No index.html file was generated to launch.');
      return;
    }
    await window.studio.openPath(buildResult.previewPath);
    setStatus('Launched generated app in your default browser');
  }

  async function openActiveProjectFolder() {
    if (!activeProject) {
      setStatus('Create or import a project first.');
      return;
    }
    await window.studio.openPath(activeProject.path);
    setStatus('Opened project folder');
  }

  async function copyLaunchPrompt() {
    if (!buildResult) {
      return;
    }
    await navigator.clipboard.writeText(buildResult.launchPrompt);
    setStatus('Copied the next-run prompt');
  }

  async function saveConfig() {
    await persistConfig(configDraft, 'Settings saved');
  }

  async function persistConfig(config: AppConfig, message: string) {
    setBusy('settings');
    try {
      const next = await window.studio.saveConfig(config);
      setState(next);
      setConfigDraft(next.config);
      setStatus(message);
    } finally {
      setBusy(undefined);
    }
  }

  function selectProvider(providerId: string) {
    void persistConfig({ ...state.config, activeProviderId: providerId }, 'Model route updated');
  }

  function selectModel(model: string) {
    if (!activeProvider) {
      return;
    }
    const providers = state.config.providers.map((provider) =>
      provider.id === activeProvider.id ? { ...provider, model } : provider,
    );
    void persistConfig({ ...state.config, providers }, 'Model updated');
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
            <ModelPicker
              providers={state.config.providers}
              activeProvider={activeProvider}
              busy={busy}
              onProvider={selectProvider}
              onModel={selectModel}
            />
            {activeProject && (
              <button className="secondary" onClick={() => window.studio.openPath(activeProject.path)}>
                <ExternalLink size={16} />
                Folder
              </button>
            )}
          </div>
        </header>

        <WorkflowSpine stages={workflowStages} />
        <ReadyCheckStrip checks={readyChecks} />

        {clarification && (
          <ClarificationPanel
            variant="checkpoint"
            clarification={clarification}
            busy={busy}
            onAnswer={updateClarificationAnswer}
            onSubmit={() => buildWithClarification()}
            onAssume={() => buildWithClarification('Proceed with your best product assumptions.')}
            onCancel={cancelClarification}
          />
        )}

        {view === 'design' && (
          <DesignView
            brief={brief}
            source={source}
            designOutput={designOutput}
            proposalPreviewFile={proposalPreviewFile}
            logs={logs}
            busy={busy}
            status={status}
            statusTone={statusTone}
            vibeProgress={vibeProgress}
            workflowStages={workflowStages}
            onBrief={setBrief}
            onSource={setSource}
            onDesignOutput={setDesignOutput}
            onRunOpenDesign={runOpenDesign}
            onGenerate={() => void generateApp()}
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
            statusTone={statusTone}
            vibeProgress={vibeProgress}
            buildResult={buildResult}
            onSelectFile={setSelectedFile}
            onChatPrompt={setChatPrompt}
            onLoad={() => void loadFiles()}
            onGenerate={() => void generateApp()}
            onLaunch={() => void launchBuiltApp()}
            onOpenFolder={() => void openActiveProjectFolder()}
            onCopyPrompt={() => void copyLaunchPrompt()}
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

function ModelPicker(props: {
  providers: Provider[];
  activeProvider?: Provider;
  busy?: string;
  onProvider: (providerId: string) => void;
  onModel: (model: string) => void;
}) {
  const modelOptions = getModelOptions(props.providers, props.activeProvider?.model);

  return (
    <div className="model-picker">
      <div className="model-picker-icon">
        <Bot size={15} />
      </div>
      <label>
        <span>Provider</span>
        <select
          value={props.activeProvider?.id ?? ''}
          onChange={(event) => props.onProvider(event.target.value)}
          disabled={props.busy === 'settings' || !props.providers.length}
          title="Choose provider"
        >
          {!props.providers.length && <option value="">No provider</option>}
          {props.providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Model</span>
        <select
          value={props.activeProvider?.model ?? ''}
          onChange={(event) => props.onModel(event.target.value)}
          disabled={props.busy === 'settings' || !props.activeProvider}
          title="Choose model"
        >
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function WorkflowSpine({ stages }: { stages: WorkflowStage[] }) {
  return (
    <section className="workflow-spine" aria-label="Build workflow">
      {stages.map((stage) => (
        <div key={stage.id} className={`workflow-stage ${stage.state}`}>
          <span className="workflow-dot" />
          <strong>{stage.label}</strong>
        </div>
      ))}
    </section>
  );
}

function ReadyCheckStrip({ checks }: { checks: ReadyCheck[] }) {
  return (
    <section className="ready-strip" aria-label="Build readiness">
      {checks.map((check) => (
        <span key={check.label} className={check.ok ? 'ready-check ok' : 'ready-check waiting'}>
          <Check size={13} />
          {check.label}
        </span>
      ))}
    </section>
  );
}

function BuildRunway({ stages }: { stages: WorkflowStage[] }) {
  return (
    <div className="build-runway" aria-label="Live build runway">
      <div className="runway-copy">
        <p className="eyebrow">Build runway</p>
        <h3>Brief becomes launchable files</h3>
      </div>
      <div className="runway-track">
        {stages.map((stage) => (
          <div key={stage.id} className={`runway-step ${stage.state}`}>
            <span />
            <strong>{stage.label}</strong>
          </div>
        ))}
      </div>
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
  statusTone: StatusTone;
  vibeProgress?: VibeProgress;
  workflowStages: WorkflowStage[];
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
            <BuildRunway stages={props.workflowStages} />
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
            Build app
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
            <span className={`terminal-status ${props.statusTone}`}>{props.status}</span>
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
  statusTone: StatusTone;
  vibeProgress?: VibeProgress;
  buildResult?: BuildResult;
  onSelectFile: (path: string) => void;
  onChatPrompt: (value: string) => void;
  onLoad: () => void;
  onGenerate: () => void;
  onLaunch: () => void;
  onOpenFolder: () => void;
  onCopyPrompt: () => void;
}) {
  const [composerOpen, setComposerOpen] = useState(!props.files.length);
  const buildLabel = props.files.length ? 'Rebuild app' : 'Build app';

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
          {!props.files.length && (
            <div className="empty-state action-empty">
              <FileCode2 size={22} />
              <span>No app files yet.</span>
              <button className="secondary" onClick={props.onGenerate} disabled={!!props.busy}>
                {buildLabel}
              </button>
            </div>
          )}
        </div>
        <div className={composerOpen ? 'mini-composer open' : 'mini-composer'}>
          <button className="composer-toggle" onClick={() => setComposerOpen((current) => !current)}>
            <Sparkles size={15} />
            <span>{composerOpen ? 'Hide build prompt' : 'Edit build prompt'}</span>
          </button>
          {composerOpen && (
            <>
              <textarea value={props.chatPrompt} onChange={(event) => props.onChatPrompt(event.target.value)} />
              {props.vibeProgress && <VibeProgressStrip progress={props.vibeProgress} />}
              <button className="primary coral" onClick={props.onGenerate} disabled={!!props.busy}>
                {props.busy === 'generate' ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                {buildLabel}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="editor-pane">
        <div className="pane-title compact">
          <div>
            <p className="eyebrow">Editor</p>
            <h2>{props.selectedFile || 'No file'}</h2>
          </div>
          <span className={`status-chip ${props.statusTone}`}>{props.status}</span>
        </div>
        <pre className="code-block">{props.selectedContent || 'Select a generated file.'}</pre>
      </section>

      <section className={props.buildResult ? 'preview-pane has-build' : 'preview-pane'}>
        <div className="pane-title compact">
          <div>
            <p className="eyebrow">Runtime</p>
            <h2>Preview</h2>
          </div>
          <Play size={17} />
        </div>
        {props.buildResult && (
          <BuildCompletePanel
            result={props.buildResult}
            onLaunch={props.onLaunch}
            onOpenFolder={props.onOpenFolder}
            onCopyPrompt={props.onCopyPrompt}
          />
        )}
        {props.previewFile ? (
          <iframe title="Generated app preview" src={props.previewFile} />
        ) : (
          <div className="empty-preview action-empty">
            <Braces size={24} />
            <span>No runtime preview yet.</span>
            <button className="primary coral" onClick={props.onGenerate} disabled={!!props.busy}>
              {buildLabel}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ClarificationPanel(props: {
  variant?: 'inline' | 'checkpoint';
  clarification: ClarificationRequest;
  busy?: string;
  onAnswer: (value: string) => void;
  onSubmit: () => void;
  onAssume: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={props.variant === 'checkpoint' ? 'clarification-panel checkpoint' : 'clarification-panel'} aria-live="polite">
      <div className="clarification-heading">
        <HelpCircle size={17} />
        <div>
          <strong>Questions before coding</strong>
          <span>The agent wants these answered before it writes files.</span>
        </div>
      </div>
      <ol>
        {props.clarification.questions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ol>
      <textarea
        value={props.clarification.answer}
        onChange={(event) => props.onAnswer(event.target.value)}
        placeholder="Answer in plain English. Short is fine."
      />
      <div className="clarification-actions">
        <button className="primary coral" onClick={props.onSubmit} disabled={props.busy === 'generate'}>
          <Send size={15} />
          Answer and build
        </button>
        <button className="secondary" onClick={props.onAssume} disabled={props.busy === 'generate'}>
          Build with assumptions
        </button>
        <button className="secondary" onClick={props.onCancel} disabled={props.busy === 'generate'}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function BuildCompletePanel(props: {
  result: BuildResult;
  onLaunch: () => void;
  onOpenFolder: () => void;
  onCopyPrompt: () => void;
}) {
  const label = props.result.kind === 'real' ? 'Real app built' : 'Starter app built';
  const detail =
    props.result.kind === 'real'
      ? `Generated with ${props.result.providerName ?? 'the selected model'}`
      : 'Generated locally because no model endpoint was available';

  return (
    <div className="build-complete" aria-live="polite">
      <div className="build-complete-copy">
        <CheckCircle2 size={18} />
        <div>
          <strong>{label}</strong>
          <span>
            {detail}. {props.result.filesWritten} files written at {formatTime(props.result.completedAt)}.
          </span>
        </div>
      </div>
      <dl className="build-receipt">
        <div>
          <dt>Project</dt>
          <dd>{compactPath(props.result.projectPath)}</dd>
        </div>
        <div>
          <dt>Entry</dt>
          <dd>{props.result.previewPath ? compactPath(props.result.previewPath) : 'No index.html'}</dd>
        </div>
      </dl>
      <div className="launch-actions">
        <button className="primary" onClick={props.onLaunch} disabled={!props.result.previewPath}>
          <Rocket size={16} />
          Launch app
        </button>
        <button className="secondary" onClick={props.onOpenFolder}>
          <FolderOpen size={16} />
          Folder
        </button>
        <button className="secondary" onClick={props.onCopyPrompt}>
          <Copy size={16} />
          Refine
        </button>
      </div>
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

function getWorkflowStages(input: {
  brief: string;
  designOutput: string;
  files: GeneratedFile[];
  clarification?: ClarificationRequest;
  buildResult?: BuildResult;
  busy?: string;
}): WorkflowStage[] {
  const briefDone = !!input.brief.trim();
  const proposalDone = !!input.designOutput.trim();
  const questionDone = !input.clarification && (input.files.length > 0 || !!input.buildResult);
  const buildDone = input.files.some((file) => file.path.endsWith('index.html'));
  const launchDone = !!input.buildResult;
  const activeId: WorkflowStageId =
    input.clarification
      ? 'questions'
      : input.busy === 'generate'
        ? 'build'
        : input.busy === 'opendesign'
          ? 'proposal'
          : launchDone
            ? 'launch'
            : buildDone
              ? 'launch'
              : proposalDone
                ? 'build'
                : briefDone
                  ? 'proposal'
                  : 'brief';

  const items: Array<{ id: WorkflowStageId; label: string; done: boolean }> = [
    { id: 'brief', label: 'Brief', done: briefDone },
    { id: 'proposal', label: 'Proposal', done: proposalDone },
    { id: 'questions', label: 'Questions', done: questionDone },
    { id: 'build', label: 'Build', done: buildDone },
    { id: 'launch', label: 'Launch', done: launchDone },
  ];

  return items.map((item) => ({
    id: item.id,
    label: item.label,
    state: item.done ? 'done' : item.id === activeId ? 'active' : 'pending',
  }));
}

function getReadyChecks(input: {
  activeProject?: StudioProject;
  activeProvider?: Provider;
  brief: string;
  designOutput: string;
}): ReadyCheck[] {
  return [
    { label: 'Project folder', ok: !!input.activeProject },
    { label: 'Brief', ok: !!input.brief.trim() },
    { label: 'Model route', ok: !!input.activeProvider?.endpoint && !!input.activeProvider?.model },
    { label: 'Proposal', ok: !!input.designOutput.trim() },
  ];
}

function getStatusTone(input: {
  status: string;
  busy?: string;
  clarification?: ClarificationRequest;
  buildResult?: BuildResult;
}): StatusTone {
  const value = input.status.toLowerCase();
  if (input.clarification || value.includes('waiting') || value.includes('question')) {
    return 'waiting';
  }
  if (input.busy || value.includes('repairing')) {
    return 'working';
  }
  if (input.buildResult || value.includes('built') || value.includes('ready') || value.includes('saved')) {
    return 'success';
  }
  if (value.includes('failed') || value.includes('error') || value.includes('malformed') || value.includes('stopped')) {
    return 'danger';
  }
  return 'ready';
}

function compactPath(value: string) {
  return value.replace(/^([A-Z]:\\Users\\[^\\]+\\)/i, '~\\');
}

function getModelOptions(providers: Provider[], activeModel?: string) {
  const configured = providers.map((provider) => provider.model).filter(Boolean);
  const defaults = [
    'qwen2.5-coder:7b',
    'llama3.1:8b',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
    'claude-3-5-sonnet-latest',
  ];
  return [...new Set([activeModel, ...configured, ...defaults].filter(Boolean))] as string[];
}

function parseClarificationQuestions(raw: string) {
  const source = extractJsonSource(raw);
  if (source) {
    try {
      const parsed = JSON.parse(source) as { questions?: unknown };
      if (Array.isArray(parsed.questions)) {
        return parsed.questions
          .filter((question): question is string => typeof question === 'string')
          .map((question) => question.trim())
          .filter(Boolean)
          .slice(0, 3);
      }
    } catch {
      // Fall through to lightweight text extraction.
    }
  }

  return raw
    .split('\n')
    .map((line) => line.trim().replace(/^[-*\d.)\s]+/, ''))
    .filter((line) => line.endsWith('?'))
    .slice(0, 3);
}

function extractJsonSource(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = (fenced?.[1] ?? raw).trim();
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  return firstBrace >= 0 && lastBrace > firstBrace ? source.slice(firstBrace, lastBrace + 1) : '';
}

function makeBuildResult(
  project: StudioProject,
  written: GeneratedFile[],
  realBuild: boolean,
  providerName?: string,
): BuildResult {
  const indexFile = written.find((file) => file.path.endsWith('index.html'));
  const previewPath = indexFile ? toDiskPath(project.path, indexFile.path) : undefined;
  const promptSubject = realBuild ? 'the real generated app' : 'the generated starter app';

  return {
    kind: realBuild ? 'real' : 'starter',
    providerName,
    projectPath: project.path,
    previewPath,
    filesWritten: written.length,
    completedAt: new Date().toISOString(),
    launchPrompt: [
      `Launch ${promptSubject} from ${previewPath ?? project.path}.`,
      'Test the primary workflow like a first-time Windows user.',
      'Then improve the app with persistent state, empty/error states, keyboard focus, and one polished interaction that makes the product feel finished.',
    ].join('\n'),
  };
}

function toDiskPath(projectPath: string, filePath: string) {
  return `${projectPath.replace(/[\\/]+$/, '')}\\${filePath.replace(/\//g, '\\')}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
