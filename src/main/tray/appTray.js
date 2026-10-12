'use strict';

const path = require('node:path');
const { Menu, Tray, nativeImage } = require('electron');

let tray = null;

function createAppTray({ onShowDashboard, onQuit }) {
  if (tray) {
    return tray;
  }

  const iconPath = path.join(__dirname, '../../../assets/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    throw new Error(`Unable to load tray icon: ${iconPath}`);
  }

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip('StickyNotes Pro');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show Dashboard',
        click: onShowDashboard
      },
      { type: 'separator' },
      {
        label: 'Quit StickyNotes Pro',
        click: onQuit
      }
    ])
  );

  tray.on('click', onShowDashboard);
  return tray;
}

function destroyAppTray() {
  if (!tray) {
    return;
  }

  tray.destroy();
  tray = null;
}

module.exports = { createAppTray, destroyAppTray };
