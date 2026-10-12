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
const VALID_RESIZE_EDGES = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

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
    const initialWidth = snapDimension(
      windowState.width,
      MIN_WIDTH,
      MAX_WIDTH,
      DEFAULT_WIDTH
    );
    const expandedHeight = snapDimension(
      windowState.height,
      MIN_HEIGHT,
      MAX_HEIGHT,
      DEFAULT_HEIGHT
    );

    const options = {
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
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: false,
      backgroundColor: '#f6df76',
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
      }, 180);

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

    if (this.collapsedNotes.has(noteId)) {
      const expandedHeight = snapDimension(
        this.expandedHeights.get(noteId),
        MIN_HEIGHT,
        MAX_HEIGHT,
        DEFAULT_HEIGHT
      );

      this.collapsedNotes.delete(noteId);
      noteWindow.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
      noteWindow.setMaximumSize(MAX_WIDTH, MAX_HEIGHT);
      noteWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: snapDimension(bounds.width, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH),
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
    noteWindow.setMaximumSize(MAX_WIDTH, HEADER_HEIGHT);
    noteWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: snapDimension(bounds.width, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH),
      height: HEADER_HEIGHT
    });

    return { collapsed: true };
  }

  moveByForWebContents(webContentsId, deltaX, deltaY) {
    const noteWindow = this.getWindowForWebContents(webContentsId);

    if (!noteWindow || noteWindow.isDestroyed()) {
      return;
    }

    const xDelta = Number.isFinite(deltaX) ? Math.round(deltaX) : 0;
    const yDelta = Number.isFinite(deltaY) ? Math.round(deltaY) : 0;

    if (xDelta === 0 && yDelta === 0) {
      return;
    }

    const [x, y] = noteWindow.getPosition();
    noteWindow.setPosition(x + xDelta, y + yDelta, false);
  }

  resizeByForWebContents(webContentsId, edge, deltaX, deltaY) {
    const noteId = this.getNoteIdForWebContents(webContentsId);
    const noteWindow = this.getWindowForWebContents(webContentsId);

    if (!noteId || !noteWindow || !VALID_RESIZE_EDGES.has(edge)) {
      return;
    }

    const bounds = noteWindow.getBounds();
    const xDelta = Number.isFinite(deltaX) ? Math.round(deltaX) : 0;
    const yDelta = Number.isFinite(deltaY) ? Math.round(deltaY) : 0;
    const collapsed = this.collapsedNotes.has(noteId);

    let x = bounds.x;
    let y = bounds.y;
    let width = bounds.width;
    let height = bounds.height;

    if (edge.includes('e') && xDelta !== 0) {
      width = snapDimension(
        bounds.width + xDelta,
        MIN_WIDTH,
        MAX_WIDTH,
        bounds.width
      );
    }

    if (edge.includes('w') && xDelta !== 0) {
      const nextWidth = snapDimension(
        bounds.width - xDelta,
        MIN_WIDTH,
        MAX_WIDTH,
        bounds.width
      );
      x += bounds.width - nextWidth;
      width = nextWidth;
    }

    if (!collapsed && edge.includes('s') && yDelta !== 0) {
      height = snapDimension(
        bounds.height + yDelta,
        MIN_HEIGHT,
        MAX_HEIGHT,
        bounds.height
      );
    }

    if (!collapsed && edge.includes('n') && yDelta !== 0) {
      const nextHeight = snapDimension(
        bounds.height - yDelta,
        MIN_HEIGHT,
        MAX_HEIGHT,
        bounds.height
      );
      y += bounds.height - nextHeight;
      height = nextHeight;
    }

    if (collapsed) {
      height = HEADER_HEIGHT;
    } else {
      this.expandedHeights.set(noteId, height);
    }

    if (
      x === bounds.x &&
      y === bounds.y &&
      width === bounds.width &&
      height === bounds.height
    ) {
      return;
    }

    noteWindow.setBounds({ x, y, width, height }, false);
  }

  closeForWebContents(webContentsId) {
    const noteWindow = this.getWindowForWebContents(webContentsId);

    if (noteWindow) {
      noteWindow.close();
    }
  }
}

module.exports = { NoteWindowManager };
