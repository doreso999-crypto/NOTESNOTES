'use strict';

const path = require('node:path');
const { BrowserWindow } = require('electron');

const HEADER_HEIGHT = 32;
const RESIZE_STEP = 16;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 352;
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1008;

function clamp(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), minimum), maximum);
}

function snapDimension(value, minimum, maximum, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const snapped = Math.round(value / RESIZE_STEP) * RESIZE_STEP;
  return clamp(snapped, minimum, maximum, fallback);
}

function getSnappedResizeBounds(newBounds, edge, collapsed) {
  const width = snapDimension(newBounds.width, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH);
  const height = collapsed
    ? HEADER_HEIGHT
    : snapDimension(newBounds.height, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT);

  let x = newBounds.x;
  let y = newBounds.y;

  if (typeof edge === 'string' && edge.includes('left')) {
    x = newBounds.x + newBounds.width - width;
  }

  if (typeof edge === 'string' && edge.includes('top')) {
    y = newBounds.y + newBounds.height - height;
  }

  return { x, y, width, height };
}

function boundsEqual(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
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
    const initialWidth = snapDimension(windowState.width, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH);
    const expandedHeight = snapDimension(windowState.height, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT);

    const noteWindow = new BrowserWindow({
      width: initialWidth,
      height: HEADER_HEIGHT,
      minWidth: MIN_WIDTH,
      minHeight: HEADER_HEIGHT,
      maxWidth: MAX_WIDTH,
      maxHeight: HEADER_HEIGHT,
      show: false,
      frame: false,
      roundedCorners: false,
      skipTaskbar: true,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: false,
      backgroundColor: '#f6df76',
      title: note.title || 'New Note',
      ...(Number.isFinite(windowState.x) && Number.isFinite(windowState.y)
        ? { x: Math.round(windowState.x), y: Math.round(windowState.y) }
        : {}),
      webPreferences: {
        preload: path.join(__dirname, '../../preload/notePreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    this.windows.set(note.id, noteWindow);
    this.expandedHeights.set(note.id, expandedHeight);
    this.collapsedNotes.add(note.id);
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
      }, 150);

      this.boundsTimers.set(note.id, timer);
    };

    noteWindow.on('move', scheduleBoundsPersist);
    noteWindow.on('resize', scheduleBoundsPersist);

    noteWindow.on('will-resize', (event, newBounds, details) => {
      const snappedBounds = getSnappedResizeBounds(
        newBounds,
        details?.edge,
        this.collapsedNotes.has(note.id)
      );

      if (!boundsEqual(newBounds, snappedBounds)) {
        event.preventDefault();
        noteWindow.setBounds(snappedBounds, false);
      }
    });

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

    await noteWindow.loadFile(path.join(__dirname, '../../renderer/note/index.html'));
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

  isCollapsedForWebContents(webContentsId) {
    const noteId = this.getNoteIdForWebContents(webContentsId);
    return Boolean(noteId && this.collapsedNotes.has(noteId));
  }

  toggleCollapsedForWebContents(webContentsId) {
    const noteId = this.getNoteIdForWebContents(webContentsId);
    const noteWindow = this.getWindowForWebContents(webContentsId);

    if (!noteId || !noteWindow) {
      throw new Error('Sticky note window is no longer available.');
    }

    const bounds = noteWindow.getBounds();
    const snappedWidth = snapDimension(bounds.width, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH);

    if (this.collapsedNotes.has(noteId)) {
      const expandedHeight = snapDimension(
        this.expandedHeights.get(noteId),
        MIN_HEIGHT,
        MAX_HEIGHT,
        DEFAULT_HEIGHT
      );

      this.collapsedNotes.delete(noteId);
      noteWindow.setMaximumSize(MAX_WIDTH, MAX_HEIGHT);
      noteWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
      noteWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: snappedWidth,
        height: expandedHeight
      });
      return { collapsed: false };
    }

    this.expandedHeights.set(
      noteId,
      snapDimension(bounds.height, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT)
    );
    this.collapsedNotes.add(noteId);
    noteWindow.setMinimumSize(MIN_WIDTH, HEADER_HEIGHT);
    noteWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: snappedWidth,
      height: HEADER_HEIGHT
    });
    noteWindow.setMaximumSize(MAX_WIDTH, HEADER_HEIGHT);
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
