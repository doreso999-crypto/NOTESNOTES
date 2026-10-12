'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'stickyNote',
  Object.freeze({
    getCurrent: () => ipcRenderer.invoke('note:get-current'),
    saveCurrent: (payload) => ipcRenderer.invoke('note:save-current', payload),
    setAlwaysOnTop: (enabled) => ipcRenderer.invoke('note:set-always-on-top', enabled),
    minimize: () => ipcRenderer.invoke('note:minimize'),
    close: () => ipcRenderer.invoke('note:close')
  })
);
