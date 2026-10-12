'use strict';

const SAVE_DELAY_MS = 300;

const state = {
  note: null,
  saveTimer: null,
  saveChain: Promise.resolve(),
  lastPersistedSnapshot: ''
};

const elements = {
  title: document.querySelector('#note-title'),
  content: document.querySelector('#note-content'),
  pinButton: document.querySelector('#pin-button'),
  minimizeButton: document.querySelector('#minimize-button'),
  closeButton: document.querySelector('#close-button'),
  saveStatus: document.querySelector('#save-status'),
  modifiedTime: document.querySelector('#modified-time')
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

async function initialize() {
  bindEvents();

  try {
    const note = await window.stickyNote.getCurrent();
    state.note = note;
    elements.title.value = note.title ?? '';
    elements.content.value = note.content ?? '';
    state.lastPersistedSnapshot = getEditorSnapshot();
    updatePinButton(Boolean(note.alwaysOnTop));
    updateWindowTitle();
    updateModifiedTime(note.modifiedAt);
    setSaveStatus('Saved');

    if (!note.content && (!note.title || note.title === 'Untitled note')) {
      elements.title.focus();
      elements.title.select();
    } else {
      elements.content.focus();
    }
  } catch (error) {
    setSaveStatus(`Unable to load note: ${error.message}`);
  }
}

function bindEvents() {
  elements.title.addEventListener('input', handleEditorInput);
  elements.content.addEventListener('input', handleEditorInput);

  elements.title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      elements.content.focus();
    }
  });

  elements.title.addEventListener('blur', saveNow);
  elements.content.addEventListener('blur', saveNow);

  elements.pinButton.addEventListener('click', handlePinToggle);
  elements.minimizeButton.addEventListener('click', () => {
    window.stickyNote.minimize();
  });
  elements.closeButton.addEventListener('click', handleClose);

  window.addEventListener('beforeunload', () => {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
  });
}

function handleEditorInput() {
  updateWindowTitle();
  scheduleSave();
}

function scheduleSave() {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }

  setSaveStatus('Unsaved');
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    void saveNow();
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
    title: elements.title.value,
    content: elements.content.value
  };

  setSaveStatus('Saving…');

  state.saveChain = state.saveChain
    .catch(() => undefined)
    .then(async () => {
      const savedNote = await window.stickyNote.saveCurrent(payload);
      state.note = savedNote;
      state.lastPersistedSnapshot = snapshot;
      updateModifiedTime(savedNote.modifiedAt);

      if (snapshot === getEditorSnapshot()) {
        setSaveStatus('Saved');
      }

      return savedNote;
    })
    .catch((error) => {
      setSaveStatus(`Save failed: ${error.message}`);
      throw error;
    });

  return state.saveChain;
}

async function handlePinToggle() {
  const nextValue = elements.pinButton.getAttribute('aria-pressed') !== 'true';

  try {
    const enabled = await window.stickyNote.setAlwaysOnTop(nextValue);
    updatePinButton(enabled);
  } catch (error) {
    setSaveStatus(`Pin failed: ${error.message}`);
  }
}

async function handleClose() {
  try {
    await saveNow();
    await window.stickyNote.close();
  } catch (error) {
    setSaveStatus(`Close paused: ${error.message}`);
  }
}

function updatePinButton(enabled) {
  elements.pinButton.setAttribute('aria-pressed', String(enabled));
  elements.pinButton.textContent = enabled ? 'Pinned' : 'Pin';
  elements.pinButton.title = enabled ? 'Stop keeping on top' : 'Keep on top';
}

function updateWindowTitle() {
  const title = elements.title.value.trim() || 'Untitled note';
  document.title = `${title} — StickyNotes Pro`;
}

function updateModifiedTime(value) {
  const date = new Date(value);
  elements.modifiedTime.textContent = Number.isNaN(date.getTime())
    ? ''
    : `Modified ${dateFormatter.format(date)}`;
}

function getEditorSnapshot() {
  return JSON.stringify({
    title: elements.title.value,
    content: elements.content.value
  });
}

function setSaveStatus(message) {
  elements.saveStatus.textContent = message;
}

initialize();
