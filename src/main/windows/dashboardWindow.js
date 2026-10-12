'use strict';

const path = require('node:path');
const { BrowserWindow } = require('electron');

let dashboardWindow = null;

function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    return dashboardWindow;
  }

  dashboardWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    title: 'StickyNotes Pro',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/dashboardPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  dashboardWindow.loadFile(
    path.join(__dirname, '../../renderer/dashboard/index.html')
  );

  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow?.show();
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  return dashboardWindow;
}

function showDashboardWindow() {
  const window = createDashboardWindow();

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
}

function getDashboardWindow() {
  return dashboardWindow;
}

module.exports = {
  createDashboardWindow,
  showDashboardWindow,
  getDashboardWindow
};
