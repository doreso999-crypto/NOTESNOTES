'use strict';

const path = require('node:path');
const { app } = require('electron');
const {
  createDashboardWindow,
  showDashboardWindow
} = require('./windows/dashboardWindow');
const { NoteWindowManager } = require('./windows/noteWindowManager');
const { createAppTray, destroyAppTray } = require('./tray/appTray');
const {
  registerDashboardIpc,
  disposeDashboardIpc
} = require('./ipc/dashboardIpc');
const { registerNoteIpc, disposeNoteIpc } = require('./ipc/noteIpc');
const { NoteStore } = require('./services/noteStore');

const hasSingleInstanceLock = app.requestSingleInstanceLock();

let noteStore = null;
let noteWindowManager = null;

async function initializeApplication() {
  noteStore = new NoteStore(path.join(app.getPath('userData'), 'notes.json'));
  await noteStore.initialize();

  noteWindowManager = new NoteWindowManager(noteStore);
  registerDashboardIpc(noteStore, noteWindowManager);
  registerNoteIpc(noteStore, noteWindowManager);

  createDashboardWindow();
  createAppTray({
    onShowDashboard: showDashboardWindow,
    onQuit: () => app.quit()
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (app.isReady()) {
      showDashboardWindow();
    }
  });

  app.whenReady().then(initializeApplication).catch((error) => {
    console.error('Failed to initialize StickyNotes Pro.', error);
    app.quit();
  });

  app.on('activate', () => {
    if (app.isReady()) {
      showDashboardWindow();
    }
  });

  // Keep the app resident in the tray when all dashboard/note windows close.
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    disposeDashboardIpc();
    disposeNoteIpc();
    destroyAppTray();
  });
}
