'use strict';

const { ipcMain } = require('electron');
const channels = require('../../shared/ipcChannels');

const NOTE_HANDLE_CHANNELS = [
  channels.NOTE_GET_CURRENT,
  channels.NOTE_SAVE_CURRENT,
  channels.NOTE_TOGGLE_COLLAPSED,
  channels.NOTE_CLOSE
];

function requireCurrentNoteId(event, noteWindowManager) {
  const noteId = noteWindowManager.getNoteIdForWebContents(event.sender.id);

  if (!noteId) {
    throw new Error('Unable to resolve the current sticky note.');
  }

  return noteId;
}

function registerNoteIpc(noteStore, noteWindowManager) {
  ipcMain.handle(channels.NOTE_GET_CURRENT, async (event) => {
    const noteId = requireCurrentNoteId(event, noteWindowManager);
    const note = await noteStore.getById(noteId);

    if (!note) {
      throw new Error(`Unknown note: ${noteId}`);
    }

    return {
      ...note,
      collapsed: noteWindowManager.isCollapsedForWebContents(event.sender.id)
    };
  });

  ipcMain.handle(channels.NOTE_SAVE_CURRENT, (event, payload) => {
    const noteId = requireCurrentNoteId(event, noteWindowManager);
    const title = typeof payload?.title === 'string' ? payload.title : '';
    const content = typeof payload?.content === 'string' ? payload.content : '';

    return noteStore.updateContent(noteId, { title, content });
  });

  ipcMain.handle(channels.NOTE_TOGGLE_COLLAPSED, (event) => {
    requireCurrentNoteId(event, noteWindowManager);
    return noteWindowManager.toggleCollapsedForWebContents(event.sender.id);
  });

  ipcMain.on(channels.NOTE_MOVE_BY, (event, deltaX, deltaY) => {
    const noteId = noteWindowManager.getNoteIdForWebContents(event.sender.id);

    if (!noteId) {
      return;
    }

    noteWindowManager.moveByForWebContents(event.sender.id, deltaX, deltaY);
  });

  ipcMain.handle(channels.NOTE_CLOSE, (event) => {
    requireCurrentNoteId(event, noteWindowManager);
    const webContentsId = event.sender.id;

    setImmediate(() => {
      noteWindowManager.closeForWebContents(webContentsId);
    });

    return true;
  });
}

function disposeNoteIpc() {
  for (const channel of NOTE_HANDLE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.removeAllListeners(channels.NOTE_MOVE_BY);
}

module.exports = { registerNoteIpc, disposeNoteIpc };
