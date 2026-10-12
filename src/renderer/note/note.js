'use strict';

const SAVE_DELAY_MS = 300;

const state = {
  note: null,
  title: 'New Note',
  collapsed: false,
  saveTimer: null,
  saveChain: Promise.resolve(),
  lastPersistedSnapshot: ''
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
    elements.stickyNote.classList.toggle('is-collapsed', state.collapsed);
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
    if (event.target.closest('.window-controls, .settings-menu')) {
      return;
    }

    void toggleCollapsed();
  });

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

async function toggleCollapsed() {
  closeSettings();

  try {
    const result = await window.stickyNote.toggleCollapsed();
    state.collapsed = Boolean(result?.collapsed);
    elements.stickyNote.classList.toggle('is-collapsed', state.collapsed);

    if (!state.collapsed) {
      elements.content.focus();
    }

    return state.collapsed;
  } catch (error) {
    console.error('Unable to collapse sticky note.', error);
    return state.collapsed;
  }
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
