import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import {
  Bot,
  Braces,
  Check,
  CheckCircle2,
  Code2,
  ExternalLink,
  FileCode2,
  FolderInput,
  FolderOpen,
  HelpCircle,
  Loader2,
  MessageSquare,
  Minimize2,
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
  Wand2,
  X,
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
  launchEntryPath?: string;
  stack: string;
  language: string;
  launchKind: string;
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
type AssistantMode = 'auto' | 'design' | 'runtime';

type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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
    'Turn the OpenDesign output and brief into a complete functional app. Choose the language, framework, and runtime that best fit the request, and make it feel production-ready.',
  );
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState<string>();
  const [logs, setLogs] = useState<string[]>([]);
  const [configDraft, setConfigDraft] = useState<AppConfig>(defaultState.config);
  const [projectRailWidth, setProjectRailWidth] = useState(292);
  const [vibeProgress, setVibeProgress] = useState<VibeProgress>();
  const [buildResult, setBuildResult] = useState<BuildResult>();
  const [clarification, setClarification] = useState<ClarificationRequest>();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('auto');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: 'assistant-ready',
      role: 'assistant',
      content: 'Tell me what to change. I can rewrite design notes or patch the live preview files.',
    },
  ]);
  const [previewRevision, setPreviewRevision] = useState(0);

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
  const activeStageId = workflowStages.find((stage) => stage.state === 'active')?.id ?? workflowStages.at(-1)?.id ?? 'brief';

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
    const index = getRuntimePreviewFile(files);
    return index ? `file:///${activeProject.path.replace(/\\/g, '/')}/${index.path}?v=${previewRevision}` : '';
  }, [activeProject, files, previewRevision]);

  const proposalPreviewFile = useMemo(() => {
    if (!activeProject) {
      return '';
    }
    const proposal = files.find((file) => file.path.endsWith('opendesign-proposal.html'));
    return proposal ? `file:///${activeProject.path.replace(/\\/g, '/')}/${proposal.path}?v=${previewRevision}` : '';
  }, [activeProject, files, previewRevision]);

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
                'Choose the most appropriate language, framework, and runtime for this request.',
                'Examples: Electron/JavaScript for polished local desktop UI, Python for automation/data tools, Node for CLI/server utilities, static HTML/CSS/JS for simple standalone web artifacts, or another stack when clearly better.',
                'Always include opendesign-app.json. It must describe the chosen stack and how the studio should launch it.',
                'Manifest shape:',
                '{"schemaVersion":1,"name":"App name","stack":"electron|python|node|static-web|custom","language":"javascript|python|...","entry":"relative/path","launch":{"kind":"electron-window|browser|command|none","entry":"relative/path","command":"optional command"}}',
                'If the user asks for a Windows/local desktop app, prefer Electron unless another native stack is clearly better.',
                'If you choose Electron, include package.json, electron/main.cjs, electron/preload.cjs, renderer/index.html, renderer/styles.css, and renderer/app.js.',
                'If you choose command launch, keep dependencies minimal and include a clear start command in opendesign-app.json.',
                'Every local href or src used by HTML must have a matching file block at that exact relative path. If HTML says href="styles.css", return ```file:styles.css. If HTML says src="script.js", return ```file:script.js.',
                'The generated app must feel production-ready for its chosen platform, with real interactions, realistic states, and no default unstyled scaffold UI.',
                'Return only complete file blocks and no extra prose.',
                'Use this file-block format:',
                '```file:opendesign-app.json',
                '{"schemaVersion":1,"stack":"electron","language":"javascript","entry":"renderer/index.html","launch":{"kind":"electron-window","entry":"renderer/index.html"}}',
                '```',
                '```file:relative/path.ext',
                'complete file contents',
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

        const outputIssues = getGeneratedOutputIssues(generated);
        if (outputIssues.length) {
          setStatus('The model returned an incomplete app. Repairing the app manifest and launch files...');
          setVibeProgress({ label: 'Repairing generated app', step: 5, total: 6 });
          const repaired = await repairGeneratedFileManifest(activeProvider, response, outputIssues.join('\n'));
          generated = extractGeneratedFiles(repaired);
          const remainingIssues = getGeneratedOutputIssues(generated);
          const hardIssues = remainingIssues.filter(isHardOutputIssue);
          if (hardIssues.length) {
            generated = completeLaunchableOutput(generated, brief, designOutput);
            const finalHardIssues = getGeneratedOutputIssues(generated).filter(isHardOutputIssue);
            if (finalHardIssues.length) {
              throw new Error(
                `The model did not produce a complete launchable app. Missing output: ${finalHardIssues.join('; ')}`,
              );
            }
          }
          const polishIssues = getGeneratedOutputIssues(generated).filter((issue) => !isHardOutputIssue(issue));
          if (polishIssues.length) {
            setStatus(`Built with automatic polish safeguards: ${polishIssues.join('; ')}`);
          }
          if (!generated.length) {
            throw new Error(
              'The model did not produce any app files.',
            );
          }
        }

        setVibeProgress({ label: 'Reviewing basic app functionality', step: 5, total: 6 });
        generated = reviewAndCompleteBasicFunctionality(generated, brief, designOutput);
        const functionalityIssues = getBasicFunctionalityIssues(generated);
        if (functionalityIssues.length) {
          setStatus(`Built with basic functionality safeguards: ${functionalityIssues.join('; ')}`);
        }
      }

      setVibeProgress({ label: `Writing ${generated.length} app files`, step: activeProvider?.endpoint ? 6 : 5, total: activeProvider?.endpoint ? 6 : 5 });
      const written = await window.studio.writeProjectFiles(project.path, generated);
      const prepared = await window.studio.prepareGeneratedApp(project.path, written, project.name);
      setFiles(prepared);
      const runtimeEntry = getRuntimePreviewFile(prepared);
      setSelectedFile(
        runtimeEntry?.path ??
          prepared[0]?.path ??
          '',
      );
      const result = makeBuildResult(project, prepared, realBuild, activeProvider?.name);
      setBuildResult(result);
      setClarification(undefined);
      setStatus(
        result.kind === 'real'
          ? `${result.stack} app built: ${prepared.length} files ready to launch`
          : `${result.stack} starter built: ${prepared.length} files ready to launch`,
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
            'You repair or upgrade code-generation output. Choose or preserve the most appropriate language/framework for the user request. Convert the provided response into complete fenced file blocks for a launchable, polished app. Always include opendesign-app.json with stack and launch instructions. Every local href/src in HTML must have a matching file block at that exact relative path. Replace default scaffold UI with styled, production-feeling screens.',
        },
        {
          role: 'user',
          content: [
            `Parse error:\n${parseError}`,
            'The previous answer was intended to contain generated app files, but its JSON was invalid.',
            'Rewrite it as file fences only, with no prose before or after. Preserve or choose the most appropriate stack for the user request.',
            'If the HTML references styles.css, script.js, app.js, images, or any other local asset, include that exact file block. Do not leave dangling links.',
            'If the UI is a plain table/form scaffold, upgrade the HTML/CSS into a polished application surface with navigation, empty states, responsive layout, and real visual hierarchy.',
            'Use this exact format:',
            '```file:opendesign-app.json',
            '{"schemaVersion":1,"stack":"electron|python|node|static-web|custom","language":"javascript|python|...","entry":"relative/path","launch":{"kind":"electron-window|browser|command|none","entry":"relative/path","command":"optional command"}}',
            '```',
            '```file:relative/path.ext',
            'complete file contents',
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
    if (!activeProject) {
      setStatus('Create or import a project first.');
      return;
    }
    const result = await window.studio.launchGeneratedApp(activeProject.path);
    if (result.command) {
      setStatus(`Launched ${result.kind} app with ${result.command}`);
    } else {
      setStatus(`Launched ${result.kind} app from ${result.entryPath ? compactPath(result.entryPath) : activeProject.name}`);
    }
  }

  async function openActiveProjectFolder() {
    if (!activeProject) {
      setStatus('Create or import a project first.');
      return;
    }
    await window.studio.openPath(activeProject.path);
    setStatus('Opened project folder');
  }

  function openRefineAssistant() {
    if (!buildResult) {
      return;
    }
    setAssistantMode('runtime');
    setAssistantPrompt('');
    setAssistantOpen(true);
    setAssistantMessages((current) => [
      ...current,
      {
        id: `assistant-refine-${Date.now()}`,
        role: 'assistant',
        content: [
          'What would you like to adjust in the app?',
          '',
          'I can change layout, styling, copy, flows, button behavior, state, or the runtime preview files directly.',
        ].join('\n'),
      },
    ]);
    setStatus('Refine chat opened. Tell the assistant what to adjust.');
  }

  async function runMiniAssistant() {
    const prompt = assistantPrompt.trim();
    if (!prompt) {
      return;
    }
    if (!activeProvider?.endpoint) {
      setStatus('Select a model route before using the mini assistant.');
      return;
    }

    const mode = resolveAssistantMode(assistantMode, prompt, files);
    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
    };
    setAssistantMessages((current) => [...current, userMessage]);
    setAssistantPrompt('');
    setBusy('assistant');
    setStatus(mode === 'design' ? 'Mini assistant is reshaping the design notes...' : 'Mini assistant is patching the preview...');

    try {
      if (mode === 'design') {
        const currentFiles = activeProject ? (files.length ? files : await window.studio.readProjectFiles(activeProject.path)) : [];
        const hasProposalPreview = currentFiles.some((file) => file.path.endsWith('opendesign-proposal.html'));
        const response = await window.studio.chat({
          provider: activeProvider,
          messages: [
            {
              role: 'system',
              content:
                'You are an embedded product design assistant. Rewrite the OpenDesign handoff notes so the coding agent can act on the user request. Be specific about layout, interaction, states, visual hierarchy, and runtime behavior. Return a fenced ```design-notes block with the revised notes. If a proposal preview exists, you may also return a complete ```file:opendesign-proposal.html block to update the visual proposal preview. Do not include prose outside fences.',
            },
            {
              role: 'user',
              content: [
                `Current brief:\n${brief || 'No brief yet.'}`,
                `Current handoff notes:\n${designOutput || 'No handoff notes yet.'}`,
                `Current proposal preview exists: ${hasProposalPreview ? 'yes' : 'no'}`,
                hasProposalPreview ? `Current proposal file:\n${summarizeFilesForAssistant(currentFiles.filter((file) => file.path.endsWith('opendesign-proposal.html')), 'opendesign-proposal.html')}` : '',
                `Requested change:\n${prompt}`,
              ].join('\n\n'),
            },
          ],
        });
        const nextOutput = extractDesignNotes(response) || response.trim();
        const changedFiles = extractOptionalGeneratedFiles(response);
        if (activeProject && changedFiles.length) {
          await window.studio.writeProjectFiles(activeProject.path, changedFiles);
          setFiles(await window.studio.readProjectFiles(activeProject.path));
          setPreviewRevision((current) => current + 1);
        }
        setDesignOutput(nextOutput);
        setStatus(
          changedFiles.length
            ? 'Mini assistant updated the design handoff and proposal preview.'
            : 'Mini assistant updated the design handoff.',
        );
        setAssistantMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: changedFiles.length
              ? 'Updated the design handoff notes and refreshed the proposal preview.'
              : 'Updated the design handoff notes. Build or patch the runtime when you are ready.',
          },
        ]);
        return;
      }

      const project = await ensureProject();
      if (!project) {
        setStatus('Create or import a project first.');
        return;
      }
      const currentFiles = files.length ? files : await window.studio.readProjectFiles(project.path);
      const response = await window.studio.chat({
        provider: activeProvider,
        messages: [
          {
            role: 'system',
            content:
              'You are an embedded runtime-edit assistant inside OpenDesign Vibe Studio. Make direct on-the-fly changes to the generated app. Return only complete fenced file blocks for files you changed or created. Do not include prose. Preserve the existing stack unless the user explicitly asks to change it. Include opendesign-app.json only when launch metadata changes.',
          },
          {
            role: 'user',
            content: [
              `Brief:\n${brief || 'No brief yet.'}`,
              `OpenDesign handoff:\n${designOutput || 'No handoff notes yet.'}`,
              `Active project:\n${project.path}`,
              `Selected file:\n${selectedFile || 'None'}`,
              `Requested on-the-fly change:\n${prompt}`,
              `Current files:\n${summarizeFilesForAssistant(currentFiles, selectedFile)}`,
              'Return file fences like:',
              '```file:renderer/styles.css',
              'complete replacement file content',
              '```',
            ].join('\n\n'),
          },
        ],
      });

      let changedFiles: GeneratedFile[];
      try {
        changedFiles = extractGeneratedFiles(response);
      } catch (error) {
        const repaired = await repairAssistantFileBlocks(activeProvider, response, readError(error));
        changedFiles = extractGeneratedFiles(repaired);
      }
      if (!changedFiles.length) {
        throw new Error('Mini assistant did not return any file blocks to apply.');
      }

      const merged = mergeGeneratedFiles(currentFiles, changedFiles);
      await window.studio.writeProjectFiles(project.path, changedFiles);
      const prepared = await window.studio.prepareGeneratedApp(project.path, merged, project.name);
      setFiles(prepared);
      setSelectedFile(changedFiles[0]?.path ?? prepared[0]?.path ?? '');
      setBuildResult(makeBuildResult(project, prepared, true, activeProvider.name));
      setPreviewRevision((current) => current + 1);
      setView('code');
      setStatus(`Mini assistant applied ${changedFiles.length} file ${changedFiles.length === 1 ? 'change' : 'changes'}.`);
      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `Applied ${changedFiles.length} file ${changedFiles.length === 1 ? 'change' : 'changes'} and refreshed the preview.`,
        },
      ]);
    } catch (error) {
      const message = readError(error);
      setStatus(message);
      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: message,
        },
      ]);
    } finally {
      setBusy(undefined);
    }
  }

  async function repairAssistantFileBlocks(provider: Provider, brokenResponse: string, parseError: string) {
    return window.studio.chat({
      provider,
      messages: [
        {
          role: 'system',
          content:
            'You repair malformed runtime edit output. Convert the previous answer into complete fenced file blocks only. Return only files that should be changed or created.',
        },
        {
          role: 'user',
          content: [
            `Parser error:\n${parseError}`,
            'Rewrite the previous answer using only this format:',
            '```file:relative/path.ext',
            'complete replacement file content',
            '```',
            `Previous answer:\n${brokenResponse}`,
          ].join('\n\n'),
        },
      ],
    });
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

      <main className={`workspace view-${view} stage-${activeStageId}`}>
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
            onRefine={openRefineAssistant}
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

      <MiniAssistant
        open={assistantOpen}
        mode={assistantMode}
        prompt={assistantPrompt}
        messages={assistantMessages}
        busy={busy === 'assistant'}
        providerName={activeProvider?.name}
        modelName={activeProvider?.model}
        onOpen={() => setAssistantOpen(true)}
        onClose={() => setAssistantOpen(false)}
        onMode={setAssistantMode}
        onPrompt={setAssistantPrompt}
        onSend={() => void runMiniAssistant()}
      />
    </div>
  );
}

function MiniAssistant(props: {
  open: boolean;
  mode: AssistantMode;
  prompt: string;
  messages: AssistantMessage[];
  busy: boolean;
  providerName?: string;
  modelName?: string;
  onOpen: () => void;
  onClose: () => void;
  onMode: (mode: AssistantMode) => void;
  onPrompt: (value: string) => void;
  onSend: () => void;
}) {
  if (!props.open) {
    return (
      <button className="assistant-fab" onClick={props.onOpen} title="Open mini assistant">
        <MessageSquare size={19} />
        <span>Assistant</span>
      </button>
    );
  }

  return (
    <aside className="assistant-panel" aria-label="Mini assistant">
      <header className="assistant-header">
        <div>
          <p className="eyebrow">Live assistant</p>
          <h2>Change the app</h2>
        </div>
        <button className="ghost-icon" onClick={props.onClose} title="Close assistant">
          <Minimize2 size={15} />
        </button>
      </header>

      <div className="assistant-route">
        <Wand2 size={15} />
        <span>{props.providerName ? `${props.providerName} / ${props.modelName}` : 'No model route'}</span>
      </div>

      <div className="assistant-mode" role="group" aria-label="Assistant mode">
        {(['auto', 'design', 'runtime'] as AssistantMode[]).map((mode) => (
          <button
            key={mode}
            className={props.mode === mode ? 'active' : ''}
            onClick={() => props.onMode(mode)}
            type="button"
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="assistant-log">
        {props.messages.map((message) => (
          <div key={message.id} className={`assistant-message ${message.role}`}>
            {message.content}
          </div>
        ))}
      </div>

      <form
        className="assistant-compose"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSend();
        }}
      >
        <textarea
          value={props.prompt}
          onChange={(event) => props.onPrompt(event.target.value)}
          placeholder="Try: make the preview denser, add a dark mode toggle, tighten the sidebar, or update the handoff notes."
          disabled={props.busy}
        />
        <div className="assistant-actions">
          <button className="secondary" type="button" onClick={() => props.onPrompt('')} disabled={props.busy}>
            <X size={15} />
            Clear
          </button>
          <button className="primary coral" type="submit" disabled={props.busy || !props.prompt.trim()}>
            {props.busy ? <Loader2 className="spin" size={15} /> : <Send size={15} />}
            Apply
          </button>
        </div>
      </form>
    </aside>
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
  const designState = props.designOutput.trim()
    ? props.proposalPreviewFile
      ? 'has-preview'
      : 'has-notes'
    : 'needs-brief';

  return (
    <div className={`design-grid ${designState}`}>
      <section className="canvas-pane resizable-panel">
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

      <section className="output-pane resizable-panel">
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
  onRefine: () => void;
}) {
  const [composerOpen, setComposerOpen] = useState(!props.files.length);
  const buildLabel = props.files.length ? 'Rebuild app' : 'Build app';
  const codeState = !props.files.length ? 'needs-build' : props.buildResult ? 'has-runtime' : 'has-files';

  return (
    <div className={`code-grid ${codeState}`}>
      <section className="file-browser resizable-panel">
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

      <section className="editor-pane resizable-panel">
        <div className="pane-title compact">
          <div>
            <p className="eyebrow">Editor</p>
            <h2>{props.selectedFile || 'No file'}</h2>
          </div>
          <span className={`status-chip ${props.statusTone}`}>{props.status}</span>
        </div>
        <pre className="code-block">{props.selectedContent || 'Select a generated file.'}</pre>
      </section>

      <section className={props.buildResult ? 'preview-pane has-build resizable-panel' : 'preview-pane resizable-panel'}>
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
            onRefine={props.onRefine}
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
  onRefine: () => void;
}) {
  const label = props.result.kind === 'real' ? `${props.result.stack} app built` : `${props.result.stack} starter built`;
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
          <dt>Stack</dt>
          <dd>{props.result.language} / {props.result.launchKind}</dd>
        </div>
        <div>
          <dt>Launch</dt>
          <dd>{props.result.launchEntryPath ? compactPath(props.result.launchEntryPath) : 'Command or manual'}</dd>
        </div>
      </dl>
      <div className="launch-actions">
        <button className="primary" onClick={props.onLaunch} disabled={props.result.launchKind === 'none'}>
          <Rocket size={16} />
          Launch app
        </button>
        <button className="secondary" onClick={props.onOpenFolder}>
          <FolderOpen size={16} />
          Folder
        </button>
        <button className="secondary" onClick={props.onRefine}>
          <MessageSquare size={16} />
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
      <section className="settings-main resizable-panel">
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

      <section className="settings-side resizable-panel">
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

function resolveAssistantMode(mode: AssistantMode, prompt: string, files: GeneratedFile[]): Exclude<AssistantMode, 'auto'> {
  if (mode !== 'auto') {
    return mode;
  }
  const value = prompt.toLowerCase();
  if (/\b(brief|handoff|proposal|design notes|design spec|visual direction|user flow)\b/.test(value)) {
    return 'design';
  }
  if (!files.length && /\b(notes|design|plan|spec|concept)\b/.test(value)) {
    return 'design';
  }
  return 'runtime';
}

function mergeGeneratedFiles(existing: GeneratedFile[], changes: GeneratedFile[]) {
  const byPath = new Map(existing.map((file) => [file.path, file]));
  for (const file of changes) {
    byPath.set(file.path, file);
  }
  return Array.from(byPath.values());
}

function extractOptionalGeneratedFiles(raw: string) {
  try {
    return extractGeneratedFiles(raw);
  } catch {
    return [];
  }
}

function extractDesignNotes(raw: string) {
  const match = raw.match(/```design-notes\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? '';
}

function summarizeFilesForAssistant(files: GeneratedFile[], selectedFile: string) {
  const ordered = [
    ...files.filter((file) => file.path === selectedFile),
    ...files.filter((file) => file.path !== selectedFile),
  ];
  return ordered
    .slice(0, 18)
    .map((file) => {
      const content = file.content.length > 9000 ? `${file.content.slice(0, 9000)}\n/* ...truncated... */` : file.content;
      return `--- ${file.path} ---\n${content}`;
    })
    .join('\n\n');
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
  const buildDone =
    !!input.buildResult ||
    input.files.some((file) => file.path.toLowerCase() === 'opendesign-app.json') ||
    input.files.some((file) => file.path.endsWith('index.html'));
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

function getGeneratedOutputIssues(files: GeneratedFile[]) {
  const paths = new Set(files.map((file) => file.path.toLowerCase()));
  const issues: string[] = [];
  const manifest = readGeneratedManifest(files);
  const htmlFile = getRuntimePreviewFile(files);
  const cssFile =
    files.find((file) => file.path.toLowerCase() === 'renderer/styles.css') ??
    files.find((file) => file.path.toLowerCase().endsWith('styles.css'));
  const jsFile =
    files.find((file) => file.path.toLowerCase() === 'renderer/app.js') ??
    files.find((file) => file.path.toLowerCase().endsWith('app.js'));

  if (!manifest) {
    issues.push('opendesign-app.json is required with stack, language, and launch instructions');
    return issues;
  }

  const launchKind = String(manifest.launch?.kind || '').trim();
  const stack = String(manifest.stack || '').toLowerCase();
  if (!manifest.stack) {
    issues.push('opendesign-app.json must include stack');
  }
  if (!manifest.language) {
    issues.push('opendesign-app.json must include language');
  }
  if (!launchKind) {
    issues.push('opendesign-app.json launch.kind is required');
  }

  if (launchKind === 'command' && !manifest.launch?.command) {
    issues.push('command launch requires launch.command');
  }
  if ((launchKind === 'browser' || launchKind === 'electron-window') && !manifest.launch?.entry && !manifest.entry) {
    issues.push(`${launchKind} launch requires launch.entry`);
  }

  if (stack.includes('electron')) {
    if (!paths.has('package.json')) {
      issues.push('package.json is required for Electron apps');
    }
    if (!paths.has('electron/main.cjs')) {
      issues.push('electron/main.cjs must create the BrowserWindow');
    }
    if (!paths.has('electron/preload.cjs')) {
      issues.push('electron/preload.cjs should expose safe desktop metadata');
    }
  }

  if ((stack.includes('web') || stack.includes('electron') || launchKind === 'browser' || launchKind === 'electron-window') && !htmlFile) {
    issues.push('HTML renderer entry is required for visual web/Electron apps');
  }
  if (htmlFile && cssFile && !/href=["'][^"']*styles\.css["']/i.test(htmlFile.content)) {
    issues.push('HTML entry must load the CSS file');
  }
  if (htmlFile && jsFile && !/<script\b[^>]*\bsrc=["'][^"']+["']/i.test(htmlFile.content)) {
    issues.push('HTML entry must load the app JavaScript file');
  }
  const assetIssues = getHtmlAssetIssues(htmlFile, files);
  if (assetIssues.length) {
    issues.push(...assetIssues);
  }
  if (cssFile && cssFile.content.replace(/\s/g, '').length < 900) {
    issues.push('CSS is too thin; visual app output may look like unstyled browser HTML');
  }
  if (htmlFile && /<table[^>]*>\s*<thead>\s*<tr>\s*<th>Name<\/th>/i.test(htmlFile.content)) {
    issues.push('visual UI looks like a default scaffold instead of a polished app');
  }

  return issues;
}

function isHardOutputIssue(issue: string) {
  return (
    issue.includes('opendesign-app.json') ||
    issue.includes('requires') ||
    issue.includes('required') ||
    issue.includes('must include') ||
    issue.includes('must create') ||
    issue.includes('must load') ||
    issue.includes('references missing local asset')
  );
}

function completeLaunchableOutput(files: GeneratedFile[], brief: string, designOutput: string) {
  const completed = mergeGeneratedFiles([], files);
  const htmlFile = getRuntimePreviewFile(completed);
  if (!htmlFile) {
    return completed;
  }
  const existingPaths = new Set(completed.map((file) => file.path.toLowerCase()));
  const refs = extractLocalHtmlAssetRefs(htmlFile.content);
  const additions: GeneratedFile[] = [];

  for (const ref of refs) {
    const resolved = resolveAssetPath(htmlFile.path, ref);
    if (!resolved || existingPaths.has(resolved.toLowerCase()) || hasFallbackAsset(existingPaths, ref)) {
      continue;
    }
    if (/\.css$/i.test(resolved)) {
      additions.push({
        path: resolved,
        content: buildAutoCompletedCss(brief, designOutput),
      });
      existingPaths.add(resolved.toLowerCase());
    }
    if (/\.(?:js|mjs|cjs)$/i.test(resolved)) {
      additions.push({
        path: resolved,
        content: buildAutoCompletedScript(),
      });
      existingPaths.add(resolved.toLowerCase());
    }
  }

  return mergeGeneratedFiles(completed, additions);
}

function reviewAndCompleteBasicFunctionality(files: GeneratedFile[], brief: string, designOutput: string) {
  let completed = completeLaunchableOutput(files, brief, designOutput);
  const htmlFile = getRuntimePreviewFile(completed);
  if (!htmlFile || !hasInteractiveHtml(htmlFile.content)) {
    return completed;
  }

  const additions: GeneratedFile[] = [];
  const scriptRefs = extractLocalScriptRefs(htmlFile.content);
  let nextHtml = htmlFile.content;

  if (!scriptRefs.length) {
    const fallbackRef = 'app.js';
    const fallbackPath = resolveAssetPath(htmlFile.path, fallbackRef);
    nextHtml = injectScriptRef(nextHtml, fallbackRef);
    if (fallbackPath) {
      additions.push({ path: fallbackPath, content: buildAutoCompletedScript() });
    }
  }

  completed = mergeGeneratedFiles(completed, additions);
  if (nextHtml !== htmlFile.content) {
    completed = mergeGeneratedFiles(completed, [{ path: htmlFile.path, content: nextHtml }]);
  }

  const refreshedHtml = getRuntimePreviewFile(completed);
  if (!refreshedHtml) {
    return completed;
  }

  const scriptFiles = getScriptFilesForHtml(refreshedHtml, completed);
  const patchedScripts = scriptFiles.map((scriptFile) => {
    if (hasUsefulScriptBehavior(scriptFile.content, refreshedHtml.content)) {
      return scriptFile;
    }
    const separator = scriptFile.content.trim() ? '\n\n' : '';
    return {
      path: scriptFile.path,
      content: `${scriptFile.content.trimEnd()}${separator}${buildAutoCompletedScript()}`,
    };
  });

  return mergeGeneratedFiles(completed, patchedScripts);
}

function getBasicFunctionalityIssues(files: GeneratedFile[]) {
  const htmlFile = getRuntimePreviewFile(files);
  if (!htmlFile || !hasInteractiveHtml(htmlFile.content)) {
    return [];
  }
  const issues: string[] = [];
  const scriptFiles = getScriptFilesForHtml(htmlFile, files);
  if (!scriptFiles.length) {
    issues.push('added a basic interaction script');
    return issues;
  }
  if (scriptFiles.some((file) => !hasUsefulScriptBehavior(file.content, htmlFile.content))) {
    issues.push('patched placeholder button handlers');
  }
  return issues;
}

function hasInteractiveHtml(html: string) {
  return /<(button|input|select|textarea|form)\b/i.test(html) || /\bdata-section=/i.test(html);
}

function extractLocalScriptRefs(html: string) {
  const refs: string[] = [];
  const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html)) !== null) {
    const ref = match[1].trim();
    if (!ref || ref.startsWith('#') || /^(?:[a-z]+:)?\/\//i.test(ref) || /^(?:data|blob):/i.test(ref)) {
      continue;
    }
    const cleanRef = ref.split(/[?#]/)[0];
    if (cleanRef && !cleanRef.startsWith('/')) {
      refs.push(cleanRef);
    }
  }
  return [...new Set(refs)];
}

function getScriptFilesForHtml(htmlFile: GeneratedFile, files: GeneratedFile[]) {
  const refs = extractLocalScriptRefs(htmlFile.content);
  return refs
    .map((ref) => {
      const resolved = resolveAssetPath(htmlFile.path, ref);
      return resolved ? files.find((file) => file.path.toLowerCase() === resolved.toLowerCase()) : undefined;
    })
    .filter((file): file is GeneratedFile => !!file);
}

function hasUsefulScriptBehavior(script: string, html: string) {
  if (/addEventListener|onclick|onchange|onsubmit|querySelector|getElementById/i.test(script)) {
    return true;
  }
  if (/\bdata-section=/i.test(html) && /data-section|section-/.test(script)) {
    return true;
  }
  return false;
}

function injectScriptRef(html: string, scriptRef: string) {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `  <script src="${scriptRef}"></script>\n</body>`);
  }
  return `${html.trimEnd()}\n<script src="${scriptRef}"></script>\n`;
}

function buildAutoCompletedCss(brief: string, designOutput: string) {
  const themeHint = `${brief} ${designOutput}`.toLowerCase();
  const accent = themeHint.includes('router') || themeHint.includes('model') ? '#0b6f78' : '#165d66';
  return `:root {
  color-scheme: light;
  --bg: #eef4f0;
  --panel: rgba(255, 255, 255, 0.92);
  --ink: #14201f;
  --muted: #60756f;
  --line: #c8d7d0;
  --accent: ${accent};
  --accent-2: #f05a4f;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  margin: 0;
  background:
    linear-gradient(90deg, rgba(22, 93, 102, 0.08) 1px, transparent 1px),
    linear-gradient(rgba(22, 93, 102, 0.08) 1px, transparent 1px),
    var(--bg);
  background-size: 28px 28px;
  color: var(--ink);
}

.app {
  width: min(1180px, calc(100vw - 36px));
  min-height: calc(100vh - 36px);
  margin: 18px auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  box-shadow: 0 24px 70px rgba(20, 32, 31, 0.16);
  overflow: hidden;
}

.title-bar,
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 68px;
  border-bottom: 1px solid var(--line);
  padding: 0 18px;
  background: #15272b;
  color: #f4f7f2;
}

.title,
h1 {
  margin: 0;
  font-size: clamp(1.1rem, 2vw, 1.45rem);
  font-weight: 850;
  letter-spacing: 0;
}

.main {
  display: grid;
  grid-template-columns: minmax(178px, 0.28fr) minmax(0, 1fr);
  min-height: calc(100vh - 106px);
}

.nav,
nav {
  display: grid;
  align-content: start;
  gap: 8px;
  border-right: 1px solid var(--line);
  padding: 16px;
  background: #f8fbf7;
}

button,
.btn {
  min-height: 38px;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 0 12px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

.nav button,
.nav-btn,
nav button {
  width: 100%;
  justify-content: flex-start;
  border-color: transparent;
  background: transparent;
  color: var(--muted);
  text-align: left;
}

.nav button.active,
.nav-btn.active,
nav button.active {
  background: #e8f3ef;
  color: var(--accent);
}

.workspace,
main,
section.workspace {
  min-width: 0;
  padding: clamp(18px, 3vw, 34px);
}

.content {
  display: grid;
  gap: 16px;
  max-width: 980px;
}

.hidden,
[hidden],
[style*="display:none"] {
  display: none !important;
}

h2,
h3 {
  margin: 0;
  letter-spacing: 0;
}

h2 {
  font-size: clamp(1.35rem, 2.4vw, 2.1rem);
}

h3 {
  margin-top: 12px;
  color: var(--accent);
}

.form-group {
  display: grid;
  gap: 7px;
}

label {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

input,
select,
textarea {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 0 11px;
  background: white;
  color: var(--ink);
  font: inherit;
}

table {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: white;
}

th,
td {
  border-bottom: 1px solid #e4ece8;
  padding: 11px;
  text-align: left;
}

th {
  color: var(--muted);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

pre,
.sample-box {
  overflow: auto;
  border-radius: 8px;
  background: #15272b;
  color: #e6f1ec;
  padding: 14px;
}

@media (max-width: 760px) {
  .main {
    grid-template-columns: 1fr;
  }

  .nav,
  nav {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}
`;
}

function buildAutoCompletedScript() {
  return `(() => {
  if (window.__opendesignBasicFunctionality) {
    return;
  }
  window.__opendesignBasicFunctionality = true;

  const state = {
    endpoints: JSON.parse(localStorage.getItem('opendesign:endpoints') || '[]'),
    models: ['gpt-4.1', 'claude-3-5-sonnet', 'llama-3.1-local', 'qwen2.5-coder'],
  };

  const byId = (id) => document.getElementById(id);
  const valueOf = (id) => byId(id)?.value?.trim() || '';
  const setText = (selector, text) => {
    const target = document.querySelector(selector);
    if (target) {
      target.textContent = text;
    }
  };

  function flash(button, label = 'Done') {
    if (!button) {
      return;
    }
    const original = button.dataset.originalText || button.textContent || 'Ready';
    button.dataset.originalText = original;
    button.textContent = label;
    window.setTimeout(() => {
      button.textContent = original;
    }, 950);
  }

  function showSection(name) {
    const sectionButtons = document.querySelectorAll('[data-section]');
    const sections = Array.from(document.querySelectorAll('[id^="section-"]'));
    sectionButtons.forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-section') === name);
    });
    sections.forEach((section) => {
      const active = section.id === 'section-' + name;
      section.classList.toggle('hidden', !active);
      section.style.display = active ? '' : 'none';
    });
  }

  function persist() {
    localStorage.setItem('opendesign:endpoints', JSON.stringify(state.endpoints));
  }

  function renderEndpoints() {
    const list = byId('endpoint-list');
    const tbody = byId('endpoints-tbody');
    const select = byId('select-endpoint');

    if (list) {
      list.innerHTML = '';
      state.endpoints.forEach((endpoint) => {
        const item = document.createElement('li');
        item.textContent = endpoint.name + ' - ' + endpoint.url + ' - Ready';
        list.appendChild(item);
      });
    }

    if (tbody) {
      tbody.innerHTML = '';
      state.endpoints.forEach((endpoint, index) => {
        const row = document.createElement('tr');
        row.innerHTML = '<td>' + endpoint.name + '</td><td>' + endpoint.url + '</td><td>Ready</td><td><button data-remove-endpoint="' + index + '">Remove</button></td>';
        tbody.appendChild(row);
      });
    }

    if (select) {
      select.innerHTML = '';
      state.endpoints.forEach((endpoint) => {
        const option = document.createElement('option');
        option.value = endpoint.name;
        option.textContent = endpoint.name;
        select.appendChild(option);
      });
    }
  }

  function renderModels() {
    const modelSelect = byId('model-select');
    const tbody = byId('models-tbody');
    if (modelSelect) {
      modelSelect.innerHTML = '';
      state.models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
      });
    }
    if (tbody) {
      tbody.innerHTML = '';
      state.models.forEach((model) => {
        const row = document.createElement('tr');
        row.innerHTML = '<td>' + model + '</td><td>Demo provider</td><td>128k</td><td>Available</td>';
        tbody.appendChild(row);
      });
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) {
      return;
    }

    const section = button.getAttribute('data-section');
    if (section) {
      showSection(section);
      return;
    }

    if (button.id === 'add-endpoint-btn') {
      byId('endpoint-name')?.focus();
      return;
    }

    if (button.id === 'save-endpoint') {
      const endpoint = {
        name: valueOf('endpoint-name') || 'Local endpoint',
        url: valueOf('endpoint-url') || 'http://localhost:11434/v1',
        key: valueOf('endpoint-key'),
      };
      state.endpoints.push(endpoint);
      persist();
      renderEndpoints();
      flash(button, 'Saved');
      return;
    }

    if (button.id === 'refresh-models' || /fetch models/i.test(button.textContent || '')) {
      renderModels();
      flash(button, 'Models loaded');
      return;
    }

    if (button.id === 'save-config') {
      flash(button, 'Config saved');
      setText('#sample-request', JSON.stringify({ model: state.models[0], messages: [{ role: 'user', content: 'Hello' }] }, null, 2));
      return;
    }

    if (button.id === 'start-session') {
      setText('#sample-request', JSON.stringify({ route: 'auto', prompt: 'Explain this request' }, null, 2));
      setText('#sample-response', JSON.stringify({ provider: state.endpoints[0]?.name || 'demo', status: 'routed', latencyMs: 42 }, null, 2));
      flash(button, 'Session ready');
      return;
    }

    const removeIndex = button.getAttribute('data-remove-endpoint');
    if (removeIndex !== null) {
      state.endpoints.splice(Number(removeIndex), 1);
      persist();
      renderEndpoints();
      renderModels();
      return;
    }

    if (/save|start|fetch|refresh/i.test(button.textContent || '')) {
      flash(button);
    }
  });

  renderEndpoints();
  renderModels();
  if (document.querySelector('[data-section].active')) {
    showSection(document.querySelector('[data-section].active').getAttribute('data-section'));
  }
})();
`;
}

function readGeneratedManifest(files: GeneratedFile[]) {
  const manifestFile = files.find((file) => file.path.toLowerCase() === 'opendesign-app.json');
  if (!manifestFile) {
    return undefined;
  }
  try {
    return JSON.parse(manifestFile.content) as {
      stack?: string;
      language?: string;
      entry?: string;
      launch?: {
        kind?: string;
        entry?: string;
        command?: string;
      };
    };
  } catch {
    return undefined;
  }
}

function getRuntimePreviewFile(files: GeneratedFile[]) {
  const manifest = readGeneratedManifest(files);
  const manifestEntry = manifest?.launch?.entry ?? manifest?.entry;
  if (manifestEntry?.toLowerCase().endsWith('.html')) {
    const match = files.find((file) => file.path.toLowerCase() === manifestEntry.toLowerCase());
    if (match) {
      return match;
    }
  }
  return (
    files.find((file) => file.path.toLowerCase() === 'renderer/index.html') ??
    files.find((file) => file.path.toLowerCase().endsWith('index.html')) ??
    files.find((file) => file.path.toLowerCase().endsWith('.html'))
  );
}

function getHtmlAssetIssues(htmlFile: GeneratedFile | undefined, files: GeneratedFile[]) {
  if (!htmlFile) {
    return [];
  }
  const paths = new Set(files.map((file) => file.path.toLowerCase()));
  const refs = extractLocalHtmlAssetRefs(htmlFile.content);
  const issues: string[] = [];
  for (const ref of refs) {
    const resolved = resolveAssetPath(htmlFile.path, ref);
    if (!resolved || paths.has(resolved.toLowerCase()) || hasFallbackAsset(paths, ref)) {
      continue;
    }
    issues.push(`HTML entry references missing local asset: ${ref}`);
  }
  return issues;
}

function extractLocalHtmlAssetRefs(html: string) {
  const refs: string[] = [];
  const attributePattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(html)) !== null) {
    const ref = match[1].trim();
    if (!ref || ref.startsWith('#') || /^(?:[a-z]+:)?\/\//i.test(ref) || /^(?:data|blob|mailto):/i.test(ref)) {
      continue;
    }
    const cleanRef = ref.split(/[?#]/)[0];
    if (cleanRef && !cleanRef.startsWith('/')) {
      refs.push(cleanRef);
    }
  }
  return [...new Set(refs)];
}

function resolveAssetPath(htmlPath: string, ref: string) {
  const baseParts = htmlPath.split('/').slice(0, -1);
  const parts = [...baseParts, ...ref.split('/')];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join('/');
}

function hasFallbackAsset(paths: Set<string>, ref: string) {
  const basename = ref.split('/').pop()?.toLowerCase() ?? '';
  if (!basename) {
    return false;
  }
  return (
    paths.has(basename) ||
    (basename === 'script.js' && paths.has('app.js')) ||
    (basename === 'app.js' && paths.has('script.js'))
  );
}

function makeBuildResult(
  project: StudioProject,
  written: GeneratedFile[],
  realBuild: boolean,
  providerName?: string,
): BuildResult {
  const manifest = readGeneratedManifest(written);
  const indexFile = getRuntimePreviewFile(written);
  const launchEntry = manifest?.launch?.entry ?? manifest?.entry ?? indexFile?.path;
  const launchEntryPath = launchEntry ? toDiskPath(project.path, launchEntry) : undefined;
  const previewPath = indexFile ? toDiskPath(project.path, indexFile.path) : undefined;
  const stack = manifest?.stack ?? 'custom';
  const language = manifest?.language ?? 'mixed';
  const launchKind = manifest?.launch?.kind ?? (previewPath ? 'browser' : 'none');
  const promptSubject = realBuild ? `the generated ${stack} app` : `the generated ${stack} starter app`;

  return {
    kind: realBuild ? 'real' : 'starter',
    providerName,
    projectPath: project.path,
    previewPath,
    launchEntryPath,
    stack,
    language,
    launchKind,
    filesWritten: written.length,
    completedAt: new Date().toISOString(),
    launchPrompt: [
      `Launch ${promptSubject} using ${launchKind}${launchEntryPath ? ` at ${launchEntryPath}` : ''}.`,
      'Test the primary workflow like a first-time user on the chosen platform.',
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
