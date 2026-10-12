'use strict';

const state = {
  notes: [],
  filter: 'active',
  sort: 'modified',
  view: 'grid',
  query: ''
};

const elements = {
  newNoteButton: document.querySelector('#new-note-button'),
  searchInput: document.querySelector('#note-search'),
  sortSelect: document.querySelector('#note-sort'),
  filterButtons: [...document.querySelectorAll('[data-filter]')],
  viewButtons: [...document.querySelectorAll('[data-view]')],
  noteGrid: document.querySelector('#note-grid'),
  noteTemplate: document.querySelector('#note-card-template'),
  noteCount: document.querySelector('#note-count'),
  emptyState: document.querySelector('#empty-state'),
  emptyStateTitle: document.querySelector('#empty-state-title'),
  emptyStateCopy: document.querySelector('#empty-state-copy'),
  operationStatus: document.querySelector('#operation-status')
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

async function initialize() {
  bindEvents();
  await refreshNotes();
}

function bindEvents() {
  elements.newNoteButton.addEventListener('click', handleCreateNote);

  elements.searchInput.addEventListener('input', (event) => {
    state.query = event.currentTarget.value;
    renderNotes();
  });

  elements.sortSelect.addEventListener('change', (event) => {
    state.sort = event.currentTarget.value;
    renderNotes();
  });

  for (const button of elements.filterButtons) {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      updateSegmentedControl(elements.filterButtons, button);
      renderNotes();
    });
  }

  for (const button of elements.viewButtons) {
    button.addEventListener('click', () => {
      state.view = button.dataset.view;
      updateSegmentedControl(elements.viewButtons, button);
      renderViewMode();
    });
  }

  elements.noteGrid.addEventListener('click', handleNoteAction);
}

function updateSegmentedControl(buttons, activeButton) {
  for (const button of buttons) {
    const isActive = button === activeButton;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
}

async function refreshNotes() {
  try {
    state.notes = await window.stickyNotes.listNotes();
    renderNotes();
  } catch (error) {
    setStatus(`Unable to load notes: ${error.message}`);
  }
}

async function handleCreateNote() {
  try {
    await window.stickyNotes.createNote();
    state.filter = 'active';
    state.query = '';
    elements.searchInput.value = '';
    updateSegmentedControl(
      elements.filterButtons,
      elements.filterButtons.find((button) => button.dataset.filter === 'active')
    );
    await refreshNotes();
    setStatus('New note created.');
  } catch (error) {
    setStatus(`Unable to create note: ${error.message}`);
  }
}

async function handleNoteAction(event) {
  const button = event.target.closest('button[data-action]');

  if (!button) {
    return;
  }

  const card = button.closest('.note-card');
  const note = state.notes.find((item) => item.id === card?.dataset.noteId);

  if (!note) {
    setStatus('That note is no longer available.');
    return;
  }

  try {
    switch (button.dataset.action) {
      case 'open':
        await handleOpenNote(note);
        break;
      case 'duplicate':
        await window.stickyNotes.duplicateNote(note.id);
        await refreshNotes();
        setStatus(`Duplicated “${displayTitle(note)}”.`);
        break;
      case 'archive':
        await window.stickyNotes.setArchived(note.id, !note.archived);
        await refreshNotes();
        setStatus(note.archived ? 'Note restored.' : 'Note archived.');
        break;
      case 'delete':
        await handleDeleteNote(note);
        break;
      default:
        break;
    }
  } catch (error) {
    setStatus(`Action failed: ${error.message}`);
  }
}

async function handleOpenNote(note) {
  const result = await window.stickyNotes.openNote(note.id);

  if (result?.ok) {
    setStatus(`Opened “${displayTitle(note)}”.`);
    return;
  }

  if (result?.code === 'NOTE_WINDOW_NOT_IMPLEMENTED') {
    setStatus('Sticky-note windows are intentionally reserved for the next build phase.');
    return;
  }

  setStatus('The note could not be opened.');
}

async function handleDeleteNote(note) {
  const confirmed = window.confirm(
    `Permanently delete “${displayTitle(note)}”? This cannot be undone.`
  );

  if (!confirmed) {
    return;
  }

  await window.stickyNotes.deleteNote(note.id);
  await refreshNotes();
  setStatus('Note permanently deleted.');
}

function renderNotes() {
  const visibleNotes = getVisibleNotes();
  elements.noteGrid.replaceChildren();

  for (const note of visibleNotes) {
    const fragment = elements.noteTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.note-card');

    card.dataset.noteId = note.id;
    fragment.querySelector('[data-field="title"]').textContent = displayTitle(note);
    fragment.querySelector('[data-field="preview"]').textContent = displayPreview(note);
    fragment.querySelector('[data-field="created"]').textContent = formatDate(note.createdAt);
    fragment.querySelector('[data-field="modified"]').textContent = formatDate(note.modifiedAt);
    fragment.querySelector('[data-field="status"]').textContent = note.archived
      ? 'Archived'
      : 'Active';
    fragment.querySelector('[data-action="archive"]').textContent = note.archived
      ? 'Restore'
      : 'Archive';

    elements.noteGrid.append(fragment);
  }

  const noun = visibleNotes.length === 1 ? 'note' : 'notes';
  elements.noteCount.textContent = `${visibleNotes.length} ${noun}`;
  renderEmptyState(visibleNotes.length === 0);
  renderViewMode();
}

function getVisibleNotes() {
  const normalizedQuery = state.query.trim().toLocaleLowerCase();

  return state.notes
    .filter((note) => {
      const matchesArchiveState = state.filter === 'archived' ? note.archived : !note.archived;

      if (!matchesArchiveState) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = `${note.title ?? ''} ${note.content ?? ''}`.toLocaleLowerCase();
      return searchableText.includes(normalizedQuery);
    })
    .sort(compareNotes);
}

function compareNotes(first, second) {
  if (state.sort === 'title') {
    return displayTitle(first).localeCompare(displayTitle(second), undefined, {
      sensitivity: 'base'
    });
  }

  const key = state.sort === 'created' ? 'createdAt' : 'modifiedAt';
  return new Date(second[key]).getTime() - new Date(first[key]).getTime();
}

function renderViewMode() {
  elements.noteGrid.classList.toggle('note-grid--list', state.view === 'list');
}

function renderEmptyState(isEmpty) {
  elements.emptyState.hidden = !isEmpty;

  if (!isEmpty) {
    return;
  }

  if (state.query.trim()) {
    elements.emptyStateTitle.textContent = 'No matching notes';
    elements.emptyStateCopy.textContent = 'Try a different search term or filter.';
    return;
  }

  if (state.filter === 'archived') {
    elements.emptyStateTitle.textContent = 'No archived notes';
    elements.emptyStateCopy.textContent = 'Archived notes will appear here.';
    return;
  }

  elements.emptyStateTitle.textContent = 'No active notes';
  elements.emptyStateCopy.textContent = 'Create your first note from the New Note button.';
}

function displayTitle(note) {
  const title = note.title?.trim();
  return title || 'Untitled note';
}

function displayPreview(note) {
  const content = note.content?.replace(/\s+/g, ' ').trim();
  return content || 'No content yet.';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : dateFormatter.format(date);
}

function setStatus(message) {
  elements.operationStatus.textContent = message;
}

initialize();
