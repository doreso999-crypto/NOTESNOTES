'use strict';

const { ipcMain } = require('electron');
const channels = require('../../shared/ipcChannels');

const DASHBOARD_CHANNELS = [
  channels.LIST_NOTES,
  channels.CREATE_NOTE,
  channels.DUPLICATE_NOTE,
  channels.SET_ARCHIVED,
  channels.DELETE_NOTE,
  channels.OPEN_NOTE
];

function requireNoteId(noteId) {
  if (typeof noteId !== 'string' || noteId.trim() === '') {
    throw new TypeError('A valid note ID is required.');
  }

  return noteId;
}

function registerDashboardIpc(noteStore, noteWindowManager) {
  ipcMain.handle(channels.LIST_NOTES, () => noteStore.list());

  ipcMain.handle(channels.CREATE_NOTE, async () => {
    const note = await noteStore.create();
    await noteWindowManager.open(note);
    return note;
  });

  ipcMain.handle(channels.DUPLICATE_NOTE, (_event, noteId) => {
    return noteStore.duplicate(requireNoteId(noteId));
  });

  ipcMain.handle(channels.SET_ARCHIVED, async (_event, noteId, archived) => {
    const validNoteId = requireNoteId(noteId);
    const shouldArchive = Boolean(archived);
    const note = await noteStore.setArchived(validNoteId, shouldArchive);

    if (shouldArchive) {
      noteWindowManager.close(validNoteId);
    }

    return note;
  });

  ipcMain.handle(channels.DELETE_NOTE, async (_event, noteId) => {
    const validNoteId = requireNoteId(noteId);
    noteWindowManager.close(validNoteId);
    return noteStore.delete(validNoteId);
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
  for (const channel of DASHBOARD_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
}

module.exports = { registerDashboardIpc, disposeDashboardIpc };
