export type Provider = {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  headers?: string;
};

export type AppConfig = {
  activeProviderId?: string;
  providers: Provider[];
  openDesignCommand: string;
  coderSystemPrompt: string;
};

export type StudioProject = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type StudioState = {
  config: AppConfig;
  projects: StudioProject[];
};

export type GeneratedFile = {
  path: string;
  content: string;
};

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenDesignRun = {
  projectPath: string;
  brief: string;
  source?: string;
};

export type ElectronApi = {
  getState: () => Promise<StudioState>;
  saveConfig: (config: AppConfig) => Promise<StudioState>;
  createProject: (name: string) => Promise<StudioState>;
  importProject: () => Promise<StudioState>;
  openPath: (targetPath: string) => Promise<void>;
  readProjectFiles: (projectPath: string) => Promise<GeneratedFile[]>;
  writeProjectFiles: (projectPath: string, files: GeneratedFile[]) => Promise<GeneratedFile[]>;
  prepareDesktopApp: (projectPath: string, files: GeneratedFile[], appName: string) => Promise<GeneratedFile[]>;
  launchDesktopApp: (projectPath: string) => Promise<{ ok: boolean; entryPath?: string; command?: string; kind: string }>;
  prepareGeneratedApp: (projectPath: string, files: GeneratedFile[], appName: string) => Promise<GeneratedFile[]>;
  launchGeneratedApp: (projectPath: string) => Promise<{ ok: boolean; entryPath?: string; command?: string; kind: string }>;
  runOpenDesign: (payload: OpenDesignRun) => Promise<{ ok: boolean; output: string }>;
  chat: (payload: { provider: Provider; messages: LlmMessage[] }) => Promise<string>;
  onOpenDesignLog: (callback: (line: string) => void) => () => void;
};

declare global {
  interface Window {
    studio: ElectronApi;
  }
}
