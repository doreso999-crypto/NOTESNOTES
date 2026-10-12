'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const channels = Object.freeze({
  LIST_NOTES: 'notes:list',
  CREATE_NOTE: 'notes:create',
  DUPLICATE_NOTE: 'notes:duplicate',
  SET_ARCHIVED: 'notes:set-archived',
  DELETE_NOTE: 'notes:delete',
  OPEN_NOTE: 'notes:open'
});

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
