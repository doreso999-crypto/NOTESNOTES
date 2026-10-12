'use strict';

const { ipcMain } = require('electron');
const channels = require('../../shared/ipcChannels');

const NOTE_CHANNELS = [
  channels.NOTE_GET_CURRENT,
  channels.NOTE_SAVE_CURRENT,
  channels.NOTE_SET_ALWAYS_ON_TOP,
  channels.NOTE_MINIMIZE,
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

    return note;
  });

  ipcMain.handle(channels.NOTE_SAVE_CURRENT, (event, payload) => {
    const noteId = requireCurrentNoteId(event, noteWindowManager);
    const title = typeof payload?.title === 'string' ? payload.title : '';
    const content = typeof payload?.content === 'string' ? payload.content : '';

    return noteStore.updateContent(noteId, { title, content });
  });

  ipcMain.handle(channels.NOTE_SET_ALWAYS_ON_TOP, async (event, enabled) => {
    const noteId = requireCurrentNoteId(event, noteWindowManager);
    const value = Boolean(enabled);

    noteWindowManager.setAlwaysOnTopForWebContents(event.sender.id, value);
    await noteStore.setAlwaysOnTop(noteId, value);
    return value;
  });

  ipcMain.handle(channels.NOTE_MINIMIZE, (event) => {
    noteWindowManager.minimizeForWebContents(event.sender.id);
  });

  ipcMain.handle(channels.NOTE_CLOSE, (event) => {
    noteWindowManager.closeForWebContents(event.sender.id);
  });
}

function disposeNoteIpc() {
  for (const channel of NOTE_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
}

module.exports = { registerNoteIpc, disposeNoteIpc };
