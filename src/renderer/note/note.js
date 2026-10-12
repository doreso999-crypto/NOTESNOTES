'use strict';

const SAVE_DELAY_MS = 300;

const state = {
  note: null,
  title: 'New Note',
  collapsed: false,
  saveTimer: null,
  saveChain: Promise.resolve(),
  toggleChain: Promise.resolve(),
  lastPersistedSnapshot: '',
  dragPointerId: null,
  lastScreenX: 0,
  lastScreenY: 0
};

const elements = {
  stickyNote: document.querySelector('#sticky-note'),
  header: document.querySelector('#note-header'),
  noteName: document.querySelector('#note-name'),
  content: document.querySelector('#note-content'),
  settingsButton: document.querySelector('#settings-button'),
  settingsMenu: document.querySelector('#settings-menu'),
  renameForm: document.querySelector('#rename-form'),
  renameInput: document.querySelector('#rename-input'),
  closeButton: document.querySelector('#close-button')
};

async function initialize() {
  bindEvents();

  try {
    const note = await window.stickyNote.getCurrent();
    state.note = note;
    state.title = note.title?.trim() || 'New Note';
    state.collapsed = Boolean(note.collapsed);
    elements.content.value = note.content ?? '';
    elements.renameInput.value = state.title;
    state.lastPersistedSnapshot = getEditorSnapshot();
    renderCollapsedState();
    renderTitle();

    if (!state.collapsed) {
      elements.content.focus();
    }
  } catch (error) {
    console.error('Unable to load sticky note.', error);
  }
}

function bindEvents() {
  elements.content.addEventListener('input', scheduleSave);

  elements.settingsButton.addEventListener('click', () => {
    void toggleSettings();
  });

  elements.renameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleRename();
  });

  elements.renameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSettings();
    }
  });

  elements.closeButton.addEventListener('click', () => {
    void handleClose();
  });

  elements.header.addEventListener('dblclick', (event) => {
    if (isHeaderControlTarget(event.target)) {
      return;
    }

    event.preventDefault();
    void toggleCollapsed();
  });

  elements.header.addEventListener('pointerdown', handleHeaderPointerDown);
  elements.header.addEventListener('pointermove', handleHeaderPointerMove);
  elements.header.addEventListener('pointerup', handleHeaderPointerEnd);
  elements.header.addEventListener('pointercancel', handleHeaderPointerEnd);

  document.addEventListener('pointerdown', (event) => {
    if (
      !elements.settingsMenu.hidden &&
      !elements.settingsMenu.contains(event.target) &&
      !elements.settingsButton.contains(event.target)
    ) {
      closeSettings();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
  });
}

function isHeaderControlTarget(target) {
  return Boolean(target.closest('.window-controls, .settings-menu'));
}

function handleHeaderPointerDown(event) {
  if (event.button !== 0 || isHeaderControlTarget(event.target)) {
    return;
  }

  state.dragPointerId = event.pointerId;
  state.lastScreenX = event.screenX;
  state.lastScreenY = event.screenY;
  elements.header.setPointerCapture(event.pointerId);
}

function handleHeaderPointerMove(event) {
  if (state.dragPointerId !== event.pointerId || (event.buttons & 1) !== 1) {
    return;
  }

  const deltaX = event.screenX - state.lastScreenX;
  const deltaY = event.screenY - state.lastScreenY;

  state.lastScreenX = event.screenX;
  state.lastScreenY = event.screenY;

  if (deltaX !== 0 || deltaY !== 0) {
    window.stickyNote.moveBy(deltaX, deltaY);
  }
}

function handleHeaderPointerEnd(event) {
  if (state.dragPointerId !== event.pointerId) {
    return;
  }

  if (elements.header.hasPointerCapture(event.pointerId)) {
    elements.header.releasePointerCapture(event.pointerId);
  }

  state.dragPointerId = null;
}

function scheduleSave() {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }

  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    void saveNow().catch((error) => {
      console.error('Unable to save sticky note.', error);
    });
  }, SAVE_DELAY_MS);
}

function saveNow() {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }

  const snapshot = getEditorSnapshot();

  if (snapshot === state.lastPersistedSnapshot) {
    return state.saveChain;
  }

  const payload = {
    title: state.title,
    content: elements.content.value
  };

  state.saveChain = state.saveChain
    .catch(() => undefined)
    .then(async () => {
      const savedNote = await window.stickyNote.saveCurrent(payload);
      state.note = savedNote;
      state.lastPersistedSnapshot = snapshot;
      return savedNote;
    });

  return state.saveChain;
}

async function handleRename() {
  const nextTitle = elements.renameInput.value.trim();

  if (!nextTitle) {
    elements.renameInput.value = state.title;
    elements.renameInput.focus();
    elements.renameInput.select();
    return;
  }

  state.title = nextTitle;
  renderTitle();

  try {
    await saveNow();
    closeSettings();
  } catch (error) {
    console.error('Unable to rename sticky note.', error);
  }
}

function toggleCollapsed() {
  closeSettings();

  state.toggleChain = state.toggleChain
    .catch(() => undefined)
    .then(async () => {
      const result = await window.stickyNote.toggleCollapsed();
      state.collapsed = Boolean(result?.collapsed);
      renderCollapsedState();

      if (!state.collapsed) {
        elements.content.focus();
      }

      return state.collapsed;
    })
    .catch((error) => {
      console.error('Unable to toggle sticky note.', error);
      return state.collapsed;
    });

  return state.toggleChain;
}

async function handleClose() {
  try {
    await saveNow();
    await window.stickyNote.close();
  } catch (error) {
    console.error('Unable to close sticky note.', error);
  }
}

async function toggleSettings() {
  if (state.collapsed) {
    await toggleCollapsed();
  }

  const shouldOpen = elements.settingsMenu.hidden;
  elements.settingsMenu.hidden = !shouldOpen;
  elements.settingsButton.setAttribute('aria-expanded', String(shouldOpen));

  if (shouldOpen) {
    elements.renameInput.value = state.title;
    elements.renameInput.focus();
    elements.renameInput.select();
  }
}

function closeSettings() {
  elements.settingsMenu.hidden = true;
  elements.settingsButton.setAttribute('aria-expanded', 'false');
  elements.renameInput.value = state.title;
}

function renderCollapsedState() {
  elements.stickyNote.classList.toggle('is-collapsed', state.collapsed);
}

function renderTitle() {
  elements.noteName.textContent = state.title;
  document.title = `${state.title} — StickyNotes Pro`;
}

function getEditorSnapshot() {
  return JSON.stringify({
    title: state.title,
    content: elements.content.value
  });
}

initialize();
