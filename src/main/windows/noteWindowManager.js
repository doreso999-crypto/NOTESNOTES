'use strict';

class NoteWindowManager {
  constructor() {
    this.windows = new Map();
  }

  async open(note) {
    // Reserved for the next phase. Each note will be represented by an
    // independent top-level BrowserWindow stored in this map by note ID.
    return {
      ok: false,
      code: 'NOTE_WINDOW_NOT_IMPLEMENTED',
      noteId: note.id
    };
  }
}

module.exports = { NoteWindowManager };
