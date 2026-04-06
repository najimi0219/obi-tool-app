const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Get file path from dropped File object (Electron webUtils)
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (e) {
      return null;
    }
  },

  // File operations
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file-dialog', defaultName),
  saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),

  // Recent files
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  addRecentFile: (filePath) => ipcRenderer.invoke('add-recent-file', filePath),

  // Image export and PDF merge
  saveImageDialog: (defaultName) => ipcRenderer.invoke('save-image-dialog', defaultName),
  openPdfMergeDialog: () => ipcRenderer.invoke('open-pdf-merge-dialog'),

  // Obi image persistence
  saveObiImage: (data, fileName) => ipcRenderer.invoke('save-obi-image', data, fileName),
  loadObiImage: () => ipcRenderer.invoke('load-obi-image'),
  clearObiImage: () => ipcRenderer.invoke('clear-obi-image'),

  // Dirty flag (未保存変更追跡)
  setDirty: (dirty) => ipcRenderer.invoke('set-dirty', dirty),

  // License management
  licenseLogin: (email, password) => ipcRenderer.invoke('license-login', email, password),
  licenseLogout: () => ipcRenderer.invoke('license-logout'),
  licenseRegister: (email, password) => ipcRenderer.invoke('license-register', email, password),
  licenseVerify: () => ipcRenderer.invoke('license-verify'),
  licenseInfo: () => ipcRenderer.invoke('license-info'),
  licenseCheckout: (promoCode) => ipcRenderer.invoke('license-checkout', promoCode),
  licensePortal: () => ipcRenderer.invoke('license-portal'),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Auto update
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateDownload: () => ipcRenderer.invoke('update-download'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => callback(data));
  },

  // Receive PDF path from main process (e.g., double-click open, drag & drop)
  onOpenPdf: (callback) => {
    ipcRenderer.on('open-pdf', (event, filePath) => callback(filePath));
  },
  // Receive image path from main process (drag & drop)
  onOpenObiImage: (callback) => {
    ipcRenderer.on('open-obi-image', (event, filePath) => callback(filePath));
  },

  // Platform detection
  isElectron: true
});
