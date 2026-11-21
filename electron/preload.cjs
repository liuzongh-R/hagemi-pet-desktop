'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hagemiDesktop', {
  platform: process.platform,
  setInteractive(interactive) {
    ipcRenderer.send('hagemi:interactive', Boolean(interactive));
  },
  setModalOpen(open) {
    ipcRenderer.send('hagemi:modal', Boolean(open));
  },
  openSoundDir() {
    ipcRenderer.send('hagemi:open-sound-dir');
  },
  centerOnCursor() {
    ipcRenderer.send('hagemi:center-cursor');
  },
  nextDisplay() {
    ipcRenderer.send('hagemi:next-display');
  },
  focusAntigravity() {
    ipcRenderer.send('hagemi:focus-app');
  },
  edgeCheck(screenX, screenY) {
    ipcRenderer.send('hagemi:edge-check', Number(screenX) || 0, Number(screenY) || 0);
  },
});
