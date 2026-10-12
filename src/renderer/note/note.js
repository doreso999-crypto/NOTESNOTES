'use strict';

const SAVE_DELAY_MS = 300;
const DOUBLE_CLICK_MS = 420;
const DOUBLE_CLICK_DISTANCE = 10;
const DRAG_THRESHOLD = 4;
const RESIZE_STEP = 16;

const state = {
  note: null,
  title: 'New Note',
  collapsed: false,
  saveTimer: null,
  saveChain: Promise.resolve(),
  toggleChain: Promise.resolve(),
  lastPersistedSnapshot: '',
  headerPointerId: null,
  headerStartScreenX: 0,
  headerStartScreenY: 0,
  headerLastScreenX: 0,
  headerLastScreenY: 0,
  headerMoved: false,
  headerSecondClickCandidate: false,
  lastHeaderClickAt: 0,
  lastHeaderClickScreenX: 0,
  lastHeaderClickScreenY: 0,
  resizePointerId: null,
  resizeHandle: null,
  resizeEdge: null,
  resizeLastScreenX: 0,
  resizeLastScreenY: 0
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
  closeButton: document.querySelector('#close-button'),
  resizeHandles: document.querySelectorAll('[data-resize-edge]')
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

  elements.header.addEventListener('pointerdown', handleHeaderPointerDown);
  elements.header.addEventListener('pointermove', handleHeaderPointerMove);
  elements.header.addEventListener('pointerup', handleHeaderPointerEnd);
  elements.header.addEventListener('pointercancel', handleHeaderPointerEnd);

  for (const handle of elements.resizeHandles) {
    handle.addEventListener('pointerdown', handleResizePointerDown);
    handle.addEventListener('pointermove', handleResizePointerMove);
    handle.addEventListener('pointerup', handleResizePointerEnd);
    handle.addEventListener('pointercancel', handleResizePointerEnd);
  }

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

  const now = performance.now();
  const clickDistance = Math.hypot(
    event.screenX - state.lastHeaderClickScreenX,
    event.screenY - state.lastHeaderClickScreenY
  );

  state.headerSecondClickCandidate =
    state.lastHeaderClickAt > 0 &&
    now - state.lastHeaderClickAt <= DOUBLE_CLICK_MS &&
    clickDistance <= DOUBLE_CLICK_DISTANCE;

  if (state.headerSecondClickCandidate) {
    state.lastHeaderClickAt = 0;
  }

  state.headerPointerId = event.pointerId;
  state.headerStartScreenX = event.screenX;
  state.headerStartScreenY = event.screenY;
  state.headerLastScreenX = event.screenX;
  state.headerLastScreenY = event.screenY;
  state.headerMoved = false;
  elements.header.setPointerCapture(event.pointerId);
}

function handleHeaderPointerMove(event) {
  if (
    state.headerPointerId !== event.pointerId ||
    (event.buttons & 1) !== 1
  ) {
    return;
  }

  const totalDistance = Math.hypot(
    event.screenX - state.headerStartScreenX,
    event.screenY - state.headerStartScreenY
  );

  if (!state.headerMoved && totalDistance < DRAG_THRESHOLD) {
    return;
  }

  state.headerMoved = true;
  state.headerSecondClickCandidate = false;
  state.lastHeaderClickAt = 0;

  const deltaX = event.screenX - state.headerLastScreenX;
  const deltaY = event.screenY - state.headerLastScreenY;

  state.headerLastScreenX = event.screenX;
  state.headerLastScreenY = event.screenY;

  if (deltaX !== 0 || deltaY !== 0) {
    window.stickyNote.moveBy(deltaX, deltaY);
  }
}

function handleHeaderPointerEnd(event) {
  if (state.headerPointerId !== event.pointerId) {
    return;
  }

  if (elements.header.hasPointerCapture(event.pointerId)) {
    elements.header.releasePointerCapture(event.pointerId);
  }

  if (
    !state.headerMoved &&
    event.type === 'pointerup' &&
    state.headerSecondClickCandidate
  ) {
    state.headerSecondClickCandidate = false;
    state.lastHeaderClickAt = 0;
    void toggleCollapsed();
  } else if (!state.headerMoved && event.type === 'pointerup') {
    state.lastHeaderClickAt = performance.now();
    state.lastHeaderClickScreenX = event.screenX;
    state.lastHeaderClickScreenY = event.screenY;
  } else {
    state.lastHeaderClickAt = 0;
    state.headerSecondClickCandidate = false;
  }

  state.headerPointerId = null;
  state.headerMoved = false;
}

function handleResizePointerDown(event) {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  state.resizePointerId = event.pointerId;
  state.resizeHandle = event.currentTarget;
  state.resizeEdge = event.currentTarget.dataset.resizeEdge;
  state.resizeLastScreenX = event.screenX;
  state.resizeLastScreenY = event.screenY;
  state.resizeHandle.setPointerCapture(event.pointerId);
}

function handleResizePointerMove(event) {
  if (
    state.resizePointerId !== event.pointerId ||
    !state.resizeEdge ||
    (event.buttons & 1) !== 1
  ) {
    return;
  }

  const rawDeltaX = event.screenX - state.resizeLastScreenX;
  const rawDeltaY = event.screenY - state.resizeLastScreenY;
  const usesHorizontalAxis =
    state.resizeEdge.includes('e') || state.resizeEdge.includes('w');
  const usesVerticalAxis =
    state.resizeEdge.includes('n') || state.resizeEdge.includes('s');

  const deltaX = usesHorizontalAxis ? snapPointerDelta(rawDeltaX) : 0;
  const deltaY = usesVerticalAxis ? snapPointerDelta(rawDeltaY) : 0;

  if (deltaX === 0 && deltaY === 0) {
    return;
  }

  state.resizeLastScreenX += deltaX;
  state.resizeLastScreenY += deltaY;
  window.stickyNote.resizeBy(state.resizeEdge, deltaX, deltaY);
}

function handleResizePointerEnd(event) {
  if (state.resizePointerId !== event.pointerId) {
    return;
  }

  if (
    state.resizeHandle &&
    state.resizeHandle.hasPointerCapture(event.pointerId)
  ) {
    state.resizeHandle.releasePointerCapture(event.pointerId);
  }

  state.resizePointerId = null;
  state.resizeHandle = null;
  state.resizeEdge = null;
}

function snapPointerDelta(value) {
  if (Math.abs(value) < RESIZE_STEP) {
    return 0;
  }

  return Math.trunc(value / RESIZE_STEP) * RESIZE_STEP;
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

  state.collapsed = !state.collapsed;
  renderCollapsedState();

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
