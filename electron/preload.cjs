const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  getState: () => ipcRenderer.invoke('studio:get-state'),
  saveConfig: (config) => ipcRenderer.invoke('studio:save-config', config),
  createProject: (name) => ipcRenderer.invoke('studio:create-project', name),
  importProject: () => ipcRenderer.invoke('studio:import-project'),
  openPath: (targetPath) => ipcRenderer.invoke('studio:open-path', targetPath),
  readProjectFiles: (projectPath) => ipcRenderer.invoke('studio:read-project-files', projectPath),
  writeProjectFiles: (projectPath, files) => ipcRenderer.invoke('studio:write-project-files', projectPath, files),
  prepareDesktopApp: (projectPath, files, appName) =>
    ipcRenderer.invoke('studio:prepare-desktop-app', projectPath, files, appName),
  launchDesktopApp: (projectPath) => ipcRenderer.invoke('studio:launch-desktop-app', projectPath),
  prepareGeneratedApp: (projectPath, files, appName) =>
    ipcRenderer.invoke('studio:prepare-generated-app', projectPath, files, appName),
  launchGeneratedApp: (projectPath) => ipcRenderer.invoke('studio:launch-generated-app', projectPath),
  runOpenDesign: (payload) => ipcRenderer.invoke('studio:run-opendesign', payload),
  chat: (payload) => ipcRenderer.invoke('studio:chat', payload),
  onOpenDesignLog: (callback) => {
    const listener = (_event, line) => callback(line);
    ipcRenderer.on('studio:opendesign-log', listener);
    return () => ipcRenderer.removeListener('studio:opendesign-log', listener);
  },
});
