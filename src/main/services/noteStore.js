'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_WINDOW_STATE = Object.freeze({
  x: null,
  y: null,
  width: 320,
  height: 360
});

function clone(value) {
  return structuredClone(value);
}

function getNextNewNoteTitle(notes) {
  let highestNumber = 0;

  for (const note of notes) {
    const title = typeof note.title === 'string' ? note.title.trim() : '';

    if (title === 'New Note') {
      highestNumber = Math.max(highestNumber, 1);
      continue;
    }

    const match = /^New Note (\d+)$/.exec(title);

    if (match) {
      highestNumber = Math.max(highestNumber, Number(match[1]));
    }
  }

  return highestNumber === 0 ? 'New Note' : `New Note ${highestNumber + 1}`;
}

function createDefaultNote(title) {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    title,
    content: '',
    createdAt: now,
    modifiedAt: now,
    archived: false,
    window: { ...DEFAULT_WINDOW_STATE },
    alwaysOnTop: false
  };
}

class NoteStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.notes = [];
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        throw new TypeError('Notes data must be an array.');
      }

      this.notes = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      await this.#persist();
    }
  }

  async list() {
    await this.writeQueue;
    return clone(this.notes);
  }

  async getById(noteId) {
    await this.writeQueue;
    const note = this.notes.find((item) => item.id === noteId);
    return note ? clone(note) : null;
  }

  async create() {
    return this.#mutate(() => {
      const note = createDefaultNote(getNextNewNoteTitle(this.notes));
      this.notes.unshift(note);
      return note;
    });
  }

  async duplicate(noteId) {
    return this.#mutate(() => {
      const source = this.#requireNote(noteId);
      const now = new Date().toISOString();
      const duplicate = {
        ...clone(source),
        id: randomUUID(),
        title: `Copy of ${source.title || 'New Note'}`,
        createdAt: now,
        modifiedAt: now,
        archived: false,
        window: {
          x: null,
          y: null,
          width: source.window?.width ?? DEFAULT_WINDOW_STATE.width,
          height: source.window?.height ?? DEFAULT_WINDOW_STATE.height
        }
      };

      this.notes.unshift(duplicate);
      return duplicate;
    });
  }

  async setArchived(noteId, archived) {
    return this.#mutate(() => {
      const note = this.#requireNote(noteId);
      note.archived = Boolean(archived);
      note.modifiedAt = new Date().toISOString();
      return note;
    });
  }

  async delete(noteId) {
    return this.#mutate(() => {
      const index = this.notes.findIndex((item) => item.id === noteId);

      if (index === -1) {
        throw new Error(`Unknown note: ${noteId}`);
      }

      const [deleted] = this.notes.splice(index, 1);
      return deleted;
    });
  }

  async updateContent(noteId, { title, content }) {
    return this.#mutate(() => {
      const note = this.#requireNote(noteId);

      if (typeof title === 'string') {
        note.title = title;
      }

      if (typeof content === 'string') {
        note.content = content;
      }

      note.modifiedAt = new Date().toISOString();
      return note;
    });
  }

  async updateWindowState(noteId, windowState) {
    return this.#mutate(() => {
      const note = this.#requireNote(noteId);
      note.window = {
        x: Number.isFinite(windowState.x) ? Math.round(windowState.x) : null,
        y: Number.isFinite(windowState.y) ? Math.round(windowState.y) : null,
        width: Number.isFinite(windowState.width)
          ? Math.round(windowState.width)
          : DEFAULT_WINDOW_STATE.width,
        height: Number.isFinite(windowState.height)
          ? Math.round(windowState.height)
          : DEFAULT_WINDOW_STATE.height
      };
      return note;
    });
  }

  async setAlwaysOnTop(noteId, alwaysOnTop) {
    return this.#mutate(() => {
      const note = this.#requireNote(noteId);
      note.alwaysOnTop = Boolean(alwaysOnTop);
      return note;
    });
  }

  #requireNote(noteId) {
    const note = this.notes.find((item) => item.id === noteId);

    if (!note) {
      throw new Error(`Unknown note: ${noteId}`);
    }

    return note;
  }

  #mutate(mutator) {
    const operation = this.writeQueue.then(async () => {
      const result = mutator();
      await this.#persist();
      return clone(result);
    });

    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async #persist() {
    const payload = JSON.stringify(this.notes, null, 2);
    await fs.writeFile(this.filePath, `${payload}\n`, 'utf8');
  }
}

module.exports = { NoteStore };
