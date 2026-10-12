'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'stickyNote',
  Object.freeze({
    getCurrent: () => ipcRenderer.invoke('note:get-current'),
    saveCurrent: (payload) => ipcRenderer.invoke('note:save-current', payload),
    toggleCollapsed: () => ipcRenderer.invoke('note:toggle-collapsed'),
    close: () => ipcRenderer.invoke('note:close')
  })
);
