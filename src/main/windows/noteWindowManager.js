'use strict';

const path = require('node:path');
const { BrowserWindow } = require('electron');

const MIN_WIDTH = 240;
const MIN_HEIGHT = 220;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 360;
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1000;

function clamp(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), minimum), maximum);
}

class NoteWindowManager {
  constructor(noteStore) {
    this.noteStore = noteStore;
    this.windows = new Map();
    this.boundsTimers = new Map();
  }

  async open(note) {
    const existingWindow = this.windows.get(note.id);

    if (existingWindow && !existingWindow.isDestroyed()) {
      if (existingWindow.isMinimized()) {
        existingWindow.restore();
      }

      existingWindow.show();
      existingWindow.focus();
      return { ok: true, noteId: note.id, reused: true };
    }

    const windowState = note.window ?? {};
    const options = {
      width: clamp(windowState.width, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH),
      height: clamp(windowState.height, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT),
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      frame: false,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: Boolean(note.alwaysOnTop),
      backgroundColor: '#fff2a8',
      title: note.title || 'Untitled note',
      webPreferences: {
        preload: path.join(__dirname, '../../preload/notePreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    };

    if (Number.isFinite(windowState.x) && Number.isFinite(windowState.y)) {
      options.x = Math.round(windowState.x);
      options.y = Math.round(windowState.y);
    }

    const noteWindow = new BrowserWindow(options);
    this.windows.set(note.id, noteWindow);

    noteWindow.setMenuBarVisibility(false);

    const persistBounds = () => {
      if (noteWindow.isDestroyed()) {
        return;
      }

      const bounds = noteWindow.getBounds();
      this.noteStore.updateWindowState(note.id, bounds).catch((error) => {
        console.error(`Failed to persist window state for note ${note.id}.`, error);
      });
    };

    const scheduleBoundsPersist = () => {
      const existingTimer = this.boundsTimers.get(note.id);

      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        this.boundsTimers.delete(note.id);
        persistBounds();
      }, 250);

      this.boundsTimers.set(note.id, timer);
    };

    noteWindow.on('move', scheduleBoundsPersist);
    noteWindow.on('resize', scheduleBoundsPersist);

    noteWindow.on('close', () => {
      const timer = this.boundsTimers.get(note.id);

      if (timer) {
        clearTimeout(timer);
        this.boundsTimers.delete(note.id);
      }

      persistBounds();
    });

    noteWindow.on('closed', () => {
      this.windows.delete(note.id);
    });

    noteWindow.once('ready-to-show', () => {
      if (!noteWindow.isDestroyed()) {
        noteWindow.show();
        noteWindow.focus();
      }
    });

    await noteWindow.loadFile(
      path.join(__dirname, '../../renderer/note/index.html')
    );

    return { ok: true, noteId: note.id, reused: false };
  }

  close(noteId) {
    const noteWindow = this.windows.get(noteId);

    if (noteWindow && !noteWindow.isDestroyed()) {
      noteWindow.close();
    }
  }

  getNoteIdForWebContents(webContentsId) {
    for (const [noteId, noteWindow] of this.windows.entries()) {
      if (!noteWindow.isDestroyed() && noteWindow.webContents.id === webContentsId) {
        return noteId;
      }
    }

    return null;
  }

  getWindowForWebContents(webContentsId) {
    for (const noteWindow of this.windows.values()) {
      if (!noteWindow.isDestroyed() && noteWindow.webContents.id === webContentsId) {
        return noteWindow;
      }
    }

    return null;
  }

  setAlwaysOnTopForWebContents(webContentsId, enabled) {
    const noteWindow = this.getWindowForWebContents(webContentsId);

    if (!noteWindow) {
      throw new Error('Sticky note window is no longer available.');
    }

    noteWindow.setAlwaysOnTop(Boolean(enabled));
  }

  minimizeForWebContents(webContentsId) {
    const noteWindow = this.getWindowForWebContents(webContentsId);

    if (noteWindow) {
      noteWindow.minimize();
    }
  }

  closeForWebContents(webContentsId) {
    const noteWindow = this.getWindowForWebContents(webContentsId);

    if (noteWindow) {
      noteWindow.close();
    }
  }
}

module.exports = { NoteWindowManager };
