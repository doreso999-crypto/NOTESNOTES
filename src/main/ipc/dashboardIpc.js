'use strict';

const { ipcMain } = require('electron');
const channels = require('../../shared/ipcChannels');

function requireNoteId(noteId) {
  if (typeof noteId !== 'string' || noteId.trim() === '') {
    throw new TypeError('A valid note ID is required.');
  }

  return noteId;
}

function registerDashboardIpc(noteStore, noteWindowManager) {
  ipcMain.handle(channels.LIST_NOTES, () => noteStore.list());
  ipcMain.handle(channels.CREATE_NOTE, () => noteStore.create());

  ipcMain.handle(channels.DUPLICATE_NOTE, (_event, noteId) => {
    return noteStore.duplicate(requireNoteId(noteId));
  });

  ipcMain.handle(channels.SET_ARCHIVED, (_event, noteId, archived) => {
    return noteStore.setArchived(requireNoteId(noteId), Boolean(archived));
  });

  ipcMain.handle(channels.DELETE_NOTE, (_event, noteId) => {
    return noteStore.delete(requireNoteId(noteId));
  });

  ipcMain.handle(channels.OPEN_NOTE, async (_event, noteId) => {
    const note = await noteStore.getById(requireNoteId(noteId));

    if (!note) {
      throw new Error(`Unknown note: ${noteId}`);
    }

    return noteWindowManager.open(note);
  });
}

function disposeDashboardIpc() {
  for (const channel of Object.values(channels)) {
    ipcMain.removeHandler(channel);
  }
}

module.exports = { registerDashboardIpc, disposeDashboardIpc };
