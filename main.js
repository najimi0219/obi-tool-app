const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// ===== Windows: Single Instance Lock =====
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
let pendingPdfPath = null;

// ===== PDF path from command line args =====
function getPdfFromArgs(argv) {
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg && !arg.startsWith('-') && arg.toLowerCase().endsWith('.pdf')) {
      const resolved = path.resolve(arg);
      if (fs.existsSync(resolved)) return resolved;
    }
  }
  return null;
}

// Check args on launch
pendingPdfPath = getPdfFromArgs(process.argv);

// ===== Second instance handling (file association double-click) =====
app.on('second-instance', (event, commandLine) => {
  const pdfPath = getPdfFromArgs(commandLine);
  if (pdfPath && mainWindow) {
    mainWindow.webContents.send('open-pdf', pdfPath);
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ===== Window Creation =====
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Obi-Tool - マイソク業者情報削除ツール',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    backgroundColor: '#f5f3ef'
  });

  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Show when ready (faster perceived startup)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // If launched with a PDF arg, send it to renderer
    if (pendingPdfPath) {
      mainWindow.webContents.send('open-pdf', pendingPdfPath);
      pendingPdfPath = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Build application menu
  buildMenu();
}

// ===== Application Menu =====
function buildMenu() {
  const template = [
    {
      label: 'ファイル',
      submenu: [
        {
          label: 'PDFを開く...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'PDFファイルを選択',
              filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
              properties: ['openFile']
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('open-pdf', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: '終了',
          accelerator: 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '設定',
      submenu: [
        {
          label: 'PDFの既定アプリに設定',
          click: () => {
            setAsDefaultPdfApp();
          }
        },
        {
          label: 'PDF関連付けを解除',
          click: () => {
            removeDefaultPdfApp();
          }
        },
        { type: 'separator' },
        {
          label: '開発者ツール',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'ヘルプ',
      submenu: [
        {
          label: 'Obi-Toolについて',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Obi-Toolについて',
              message: 'Obi-Tool v1.0.0',
              detail: 'マイソク業者情報削除ツール\n\nPDFのマイソクから業者情報を自動検出・削除します。'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ===== PDF File Association (Windows) =====
function setAsDefaultPdfApp() {
  if (process.platform === 'win32') {
    // Use Windows' built-in default app settings
    try {
      // Open Windows default apps settings page for .pdf
      shell.openExternal('ms-settings:defaultapps');
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'PDF関連付け設定',
        message: 'Windowsの既定のアプリ設定が開きます。',
        detail: '「.pdf」を検索して、Obi-Tool を既定のアプリに設定してください。\n\n※ インストーラーでインストールした場合は、Obi-Tool が選択肢に表示されます。'
      });
    } catch (e) {
      dialog.showErrorBox('エラー', '設定を開けませんでした: ' + e.message);
    }
  }
}

function removeDefaultPdfApp() {
  if (process.platform === 'win32') {
    try {
      shell.openExternal('ms-settings:defaultapps');
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'PDF関連付け解除',
        message: 'Windowsの既定のアプリ設定が開きます。',
        detail: '「.pdf」を検索して、別のアプリ（Adobe Acrobat等）を既定に設定してください。'
      });
    } catch (e) {
      dialog.showErrorBox('エラー', '設定を開けませんでした: ' + e.message);
    }
  }
}

// ===== IPC Handlers =====
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'PDFファイルを選択',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return { success: true, data: data.buffer, name: path.basename(filePath) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('save-file-dialog', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存先を選択',
    defaultPath: defaultName || 'output.pdf',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

ipcMain.handle('save-file', async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, Buffer.from(data));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-app-info', () => {
  return {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform
  };
});

// ===== App Lifecycle =====
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// Windows: handle file open via OS
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('open-pdf', filePath);
  } else {
    pendingPdfPath = filePath;
  }
});
