'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const channels = require('../shared/ipcChannels');

contextBridge.exposeInMainWorld(
  'stickyNotes',
  Object.freeze({
    listNotes: () => ipcRenderer.invoke(channels.LIST_NOTES),
    createNote: () => ipcRenderer.invoke(channels.CREATE_NOTE),
    duplicateNote: (noteId) => ipcRenderer.invoke(channels.DUPLICATE_NOTE, noteId),
    setArchived: (noteId, archived) => {
      return ipcRenderer.invoke(channels.SET_ARCHIVED, noteId, archived);
    },
    deleteNote: (noteId) => ipcRenderer.invoke(channels.DELETE_NOTE, noteId),
    openNote: (noteId) => ipcRenderer.invoke(channels.OPEN_NOTE, noteId)
  })
);
