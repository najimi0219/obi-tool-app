const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const licenseManager = require('./license-manager');
const { generateDeviceId, getDeviceName } = require('./device-id');

// ===== セキュリティ: ファイルパス検証 =====
function isValidFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  // パストラバーサル防止
  const resolved = path.resolve(filePath);
  // NULL バイト注入防止
  if (filePath.includes('\0')) return false;
  return true;
}

function validatePdfPath(filePath) {
  if (!isValidFilePath(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.pdf';
}

function validateImagePath(filePath) {
  if (!isValidFilePath(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(ext);
}

// ===== ファイルサイズ制限 (500MB) =====
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// ===== Windows: Single Instance Lock =====
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
let pendingPdfPath = null;
let currentMode = 'viewer'; // 'viewer' or 'admin'
let isDirty = false; // 未保存変更フラグ

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
      sandbox: true,
      navigateOnDragDrop: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    show: false,
    backgroundColor: '#f5f3ef'
  });

  // Electronのデフォルトズームを無効化（Ctrl+scrollは自前で処理）
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  });

  // Default: viewer mode (user-facing), switch to admin via menu
  mainWindow.loadFile(path.join(__dirname, 'app', 'viewer.html'));
  currentMode = 'viewer';

  // ファイルD&D: Electronのナビゲーション動作を横取りしてファイルパスを取得
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    // file:// URLからパスを抽出
    if (url.startsWith('file://')) {
      let filePath = decodeURIComponent(url.replace('file:///', ''));
      // Windows: file:///C:/path → C:/path
      if (process.platform === 'win32') {
        filePath = filePath.replace(/\//g, '\\');
      }
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.pdf') {
        mainWindow.webContents.send('open-pdf', filePath);
      } else if (['.jpg', '.jpeg', '.png', '.bmp', '.webp'].includes(ext)) {
        mainWindow.webContents.send('open-obi-image', filePath);
      }
    }
  });

  // Show when ready (faster perceived startup)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // If launched with a PDF arg, send it to renderer
    if (pendingPdfPath) {
      mainWindow.webContents.send('open-pdf', pendingPdfPath);
      pendingPdfPath = null;
    }
  });

  // 未保存変更がある場合は閉じる前に確認
  mainWindow.on('close', (e) => {
    if (isDirty) {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['保存せずに終了', 'キャンセル'],
        defaultId: 1,
        cancelId: 1,
        title: '未保存の変更があります',
        message: '編集内容が保存されていません。保存せずに終了しますか？'
      });
      if (choice === 0) {
        isDirty = false;
        mainWindow.close();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Build application menu
  buildMenu();

  // ===== 自動アップデート =====
  setupAutoUpdater();
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
      label: '表示',
      submenu: [
        {
          label: 'ビューアーモード',
          type: 'radio',
          checked: currentMode === 'viewer',
          click: () => {
            switchMode('viewer');
          }
        },
        {
          label: '管理者モード (開発)',
          type: 'radio',
          checked: currentMode === 'admin',
          click: () => {
            switchMode('admin');
          }
        },
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

// ===== Obi Image Persistence =====
function getObiStorePath() {
  return path.join(app.getPath('userData'), 'obi-image.dat');
}
function getObiMetaPath() {
  return path.join(app.getPath('userData'), 'obi-image-meta.json');
}

// ===== Recent Files Persistence =====
function getRecentFilesPath() {
  return path.join(app.getPath('userData'), 'recent-files.json');
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

ipcMain.handle('open-image-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '帯画像を選択',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    if (!isValidFilePath(filePath)) {
      return { success: false, error: '無効なファイルパスです' };
    }
    const resolved = path.resolve(filePath);
    // ファイルサイズチェック
    const stat = fs.statSync(resolved);
    if (stat.size > MAX_FILE_SIZE) {
      return { success: false, error: 'ファイルサイズが大きすぎます（上限: 500MB）' };
    }
    const data = fs.readFileSync(resolved);
    return { success: true, data: data.buffer, name: path.basename(resolved) };
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
    if (!isValidFilePath(filePath)) {
      return { success: false, error: '無効なファイルパスです' };
    }
    fs.writeFileSync(path.resolve(filePath), Buffer.from(data));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 帯画像を保存
ipcMain.handle('save-obi-image', async (event, data, fileName) => {
  try {
    fs.writeFileSync(getObiStorePath(), Buffer.from(data));
    fs.writeFileSync(getObiMetaPath(), JSON.stringify({ name: fileName, savedAt: new Date().toISOString() }));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 保存済み帯画像を読み込み
ipcMain.handle('load-obi-image', async () => {
  try {
    const storePath = getObiStorePath();
    const metaPath = getObiMetaPath();
    if (!fs.existsSync(storePath) || !fs.existsSync(metaPath)) {
      return { exists: false };
    }
    const data = fs.readFileSync(storePath);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    return { exists: true, data: data.buffer, name: meta.name };
  } catch (e) {
    return { exists: false, error: e.message };
  }
});

// 保存済み帯画像を削除
ipcMain.handle('clear-obi-image', async () => {
  try {
    if (fs.existsSync(getObiStorePath())) fs.unlinkSync(getObiStorePath());
    if (fs.existsSync(getObiMetaPath())) fs.unlinkSync(getObiMetaPath());
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===== Dirty Flag (未保存変更追跡) =====
ipcMain.handle('set-dirty', (event, dirty) => {
  isDirty = !!dirty;
  // タイトルバーに未保存マーク
  if (mainWindow) {
    const base = currentMode === 'admin' ? 'Obi-Tool - 管理者モード' : 'Obi-Tool';
    mainWindow.setTitle(isDirty ? `● ${base} — 未保存の変更あり` : base);
  }
});

ipcMain.handle('get-app-info', () => {
  return {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform
  };
});

// ===== License Handlers =====
ipcMain.handle('license-login', async (event, email, password) => {
  return await licenseManager.login(email, password);
});

ipcMain.handle('license-logout', async () => {
  return await licenseManager.logout();
});

ipcMain.handle('license-register', async (event, email, password) => {
  return await licenseManager.register(email, password);
});

ipcMain.handle('license-verify', async () => {
  return await licenseManager.verifyLicense();
});

ipcMain.handle('license-info', () => {
  return licenseManager.getLicenseInfo();
});

ipcMain.handle('license-checkout', async (event, promoCode) => {
  return await licenseManager.getCheckoutUrl(promoCode);
});

ipcMain.handle('license-portal', async () => {
  return await licenseManager.getPortalUrl();
});

ipcMain.handle('get-device-info', () => {
  return { deviceId: generateDeviceId(), deviceName: getDeviceName() };
});

// ===== Recent Files Handlers =====
ipcMain.handle('get-recent-files', async () => {
  try {
    const recentFilesPath = getRecentFilesPath();
    if (!fs.existsSync(recentFilesPath)) {
      return [];
    }
    const data = JSON.parse(fs.readFileSync(recentFilesPath, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
});

ipcMain.handle('add-recent-file', async (event, filePath) => {
  try {
    if (!isValidFilePath(filePath)) {
      return { success: false, error: '無効なファイルパスです' };
    }
    const recentFilesPath = getRecentFilesPath();
    let recentFiles = [];

    // Read existing recent files
    if (fs.existsSync(recentFilesPath)) {
      try {
        recentFiles = JSON.parse(fs.readFileSync(recentFilesPath, 'utf-8'));
        if (!Array.isArray(recentFiles)) {
          recentFiles = [];
        }
      } catch (e) {
        recentFiles = [];
      }
    }

    // Remove duplicates (same path)
    recentFiles = recentFiles.filter(item => item.path !== filePath);

    // Add new file to front
    const newItem = {
      path: filePath,
      name: path.basename(filePath),
      openedAt: new Date().toISOString()
    };
    recentFiles.unshift(newItem);

    // Keep only max 10 items
    recentFiles = recentFiles.slice(0, 10);

    // Save to file
    fs.writeFileSync(recentFilesPath, JSON.stringify(recentFiles, null, 2));
    return { success: true, recentFiles };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ===== Image Export Save Dialog =====
ipcMain.handle('save-image-dialog', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '画像を保存',
    defaultPath: defaultName || 'export.png',
    filters: [
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
    ]
  });
  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

// ===== PDF Merge Dialog =====
ipcMain.handle('open-pdf-merge-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'マージするPDFファイルを選択',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return null;
});

// ===== Mode Switching =====
function switchMode(mode) {
  if (mode === currentMode) return;
  // 未保存変更がある場合は確認
  if (isDirty) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['保存せずに切替', 'キャンセル'],
      defaultId: 1,
      cancelId: 1,
      title: '未保存の変更があります',
      message: 'モードを切り替えると編集内容が失われます。続行しますか？'
    });
    if (choice !== 0) return;
    isDirty = false;
  }
  currentMode = mode;
  if (mode === 'admin') {
    mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
    mainWindow.setTitle('Obi-Tool - 管理者モード');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'app', 'viewer.html'));
    mainWindow.setTitle('Obi-Tool');
  }
  // Rebuild menu to update radio button state
  buildMenu();
}

// ===== 自動アップデート =====
function setupAutoUpdater() {
  // 開発中はスキップ
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // アップデート確認（起動後10秒待ってから）
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10000);

  // 30分ごとにチェック
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        status: 'available',
        version: info.version
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', { status: 'up-to-date' });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        status: 'downloading',
        percent: Math.round(progress.percent)
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        status: 'downloaded',
        version: info.version
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error:', err.message);
  });
}

// IPC: アップデートダウンロード開始
ipcMain.handle('update-download', async () => {
  await autoUpdater.downloadUpdate();
  return { success: true };
});

// IPC: ダウンロード済みアップデートをインストール＆再起動
ipcMain.handle('update-install', () => {
  autoUpdater.quitAndInstall(false, true);
});

// IPC: 手動でアップデート確認
ipcMain.handle('update-check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
