'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'stickyNote',
  Object.freeze({
    getCurrent: () => ipcRenderer.invoke('note:get-current'),
    saveCurrent: (payload) => ipcRenderer.invoke('note:save-current', payload),
    toggleCollapsed: () => ipcRenderer.invoke('note:toggle-collapsed'),
    moveBy: (deltaX, deltaY) => ipcRenderer.send('note:move-by', deltaX, deltaY),
    close: () => ipcRenderer.invoke('note:close')
  })
);
