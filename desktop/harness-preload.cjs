const { contextBridge, ipcRenderer } = require('electron');
// Narrow, credential-free API available only in the official Harness window.
contextBridge.exposeInMainWorld('blinkflowHarnessModels', {
  get: () => ipcRenderer.invoke('harness:models-get'),
  select: (imageModel) => ipcRenderer.invoke('harness:model-select', imageModel),
  onChange: (handler) => { const listener = (_event, state) => handler(state); ipcRenderer.on('harness:models-changed', listener); return () => ipcRenderer.removeListener('harness:models-changed', listener); },
});

contextBridge.exposeInMainWorld('blinkflowHarnessReferences', {
  selection: () => ipcRenderer.invoke('harness:selection-get'),
  onSelection: (handler) => { const listener = () => handler(); ipcRenderer.on('harness:selection-changed', listener); return () => ipcRenderer.removeListener('harness:selection-changed', listener); },
  resolve: (nodeId, projectId) => ipcRenderer.invoke('harness:reference-resolve', nodeId, projectId),
  get: () => ipcRenderer.invoke('harness:references-get'),
  ack: (id) => ipcRenderer.invoke('harness:references-ack', id),
  onChange: (handler) => { const listener = () => handler(); ipcRenderer.on('harness:references-changed', listener); return () => ipcRenderer.removeListener('harness:references-changed', listener); },
});
