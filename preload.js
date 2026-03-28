const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file-dialog', defaultName),
  saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Receive PDF path from main process (e.g., double-click open)
  onOpenPdf: (callback) => {
    ipcRenderer.on('open-pdf', (event, filePath) => callback(filePath));
  },

  // Platform detection
  isElectron: true
});
