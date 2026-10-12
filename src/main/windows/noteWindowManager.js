'use strict';

const path = require('node:path');
const { BrowserWindow } = require('electron');

const HEADER_HEIGHT = 44;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 180;
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
    this.expandedHeights = new Map();
    this.collapsedNotes = new Set();
  }

  async open(note) {
    const existingWindow = this.windows.get(note.id);

    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.show();
      existingWindow.focus();
      return { ok: true, noteId: note.id, reused: true };
    }

    const windowState = note.window ?? {};
    const initialWidth = clamp(windowState.width, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH);
    const initialHeight = clamp(windowState.height, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT);

    const options = {
      width: initialWidth,
      height: initialHeight,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      frame: false,
      roundedCorners: false,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: false,
      backgroundColor: '#fff2a8',
      title: note.title || 'New Note',
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
    this.expandedHeights.set(note.id, initialHeight);

    noteWindow.setMenuBarVisibility(false);

    const persistBounds = () => {
      if (noteWindow.isDestroyed()) {
        return;
      }

      const bounds = noteWindow.getBounds();
      const persistedBounds = {
        ...bounds,
        height: this.collapsedNotes.has(note.id)
          ? this.expandedHeights.get(note.id) ?? DEFAULT_HEIGHT
          : bounds.height
      };

      this.noteStore.updateWindowState(note.id, persistedBounds).catch((error) => {
        console.error(`Failed to persist window state for note ${note.id}.`, error);
      });
    };

    const scheduleBoundsPersist = () => {
      if (!this.collapsedNotes.has(note.id) && !noteWindow.isDestroyed()) {
        this.expandedHeights.set(note.id, noteWindow.getBounds().height);
      }

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
      this.expandedHeights.delete(note.id);
      this.collapsedNotes.delete(note.id);
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

  toggleCollapsedForWebContents(webContentsId) {
    const noteId = this.getNoteIdForWebContents(webContentsId);
    const noteWindow = this.getWindowForWebContents(webContentsId);

    if (!noteId || !noteWindow) {
      throw new Error('Sticky note window is no longer available.');
    }

    const bounds = noteWindow.getBounds();

    if (this.collapsedNotes.has(noteId)) {
      const expandedHeight = clamp(
        this.expandedHeights.get(noteId),
        MIN_HEIGHT,
        MAX_HEIGHT,
        DEFAULT_HEIGHT
      );

      this.collapsedNotes.delete(noteId);
      noteWindow.setResizable(true);
      noteWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
      noteWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: expandedHeight
      });

      return { collapsed: false };
    }

    this.expandedHeights.set(note.id, clamp(bounds.height, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT));
    this.collapsedNotes.add(noteId);
    noteWindow.setMinimumSize(MIN_WIDTH, HEADER_HEIGHT);
    noteWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: HEADER_HEIGHT
    });
    noteWindow.setResizable(false);

    return { collapsed: true };
  }

  closeForWebContents(webContentsId) {
    const noteWindow = this.getWindowForWebContents(webContentsId);

    if (noteWindow) {
      noteWindow.close();
    }
  }
}

module.exports = { NoteWindowManager };
