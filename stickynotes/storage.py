from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from PySide6.QtCore import QStandardPaths


DEFAULT_WIDTH = 320
DEFAULT_HEIGHT = 352


class NoteStore:
    def __init__(self) -> None:
        data_dir = Path(QStandardPaths.writableLocation(QStandardPaths.AppDataLocation))
        data_dir.mkdir(parents=True, exist_ok=True)
        self.path = data_dir / "notes.json"
        self.notes: list[dict] = []
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            self.notes = []
            return

        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = []

        if not isinstance(payload, list):
            payload = []

        self.notes = [self._normalize(note) for note in payload if isinstance(note, dict)]

    def save(self) -> None:
        temp_path = self.path.with_suffix(".tmp")
        temp_path.write_text(
            json.dumps(self.notes, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        os.replace(temp_path, self.path)

    def all(self) -> list[dict]:
        return deepcopy(self.notes)

    def get(self, note_id: str) -> dict | None:
        for note in self.notes:
            if note["id"] == note_id:
                return deepcopy(note)
        return None

    def create(self) -> dict:
        note = {
            "id": str(uuid4()),
            "title": self._next_default_title(),
            "content": "",
            "x": None,
            "y": None,
            "width": DEFAULT_WIDTH,
            "height": DEFAULT_HEIGHT,
            "collapsed": False,
            "open": True,
        }
        self.notes.insert(0, note)
        self.save()
        return deepcopy(note)

    def update(self, note_id: str, **changes) -> dict:
        for note in self.notes:
            if note["id"] == note_id:
                note.update(changes)
                normalized = self._normalize(note)
                note.clear()
                note.update(normalized)
                self.save()
                return deepcopy(note)
        raise KeyError(note_id)

    def _next_default_title(self) -> str:
        used = {str(note.get("title", "")).strip() for note in self.notes}
        if "New Note" not in used:
            return "New Note"

        number = 2
        while f"New Note {number}" in used:
            number += 1
        return f"New Note {number}"

    @staticmethod
    def _normalize(note: dict) -> dict:
        width = note.get("width", DEFAULT_WIDTH)
        height = note.get("height", DEFAULT_HEIGHT)
        return {
            "id": str(note.get("id") or uuid4()),
            "title": str(note.get("title") or "New Note"),
            "content": str(note.get("content") or ""),
            "x": note.get("x") if isinstance(note.get("x"), int) else None,
            "y": note.get("y") if isinstance(note.get("y"), int) else None,
            "width": width if isinstance(width, int) else DEFAULT_WIDTH,
            "height": height if isinstance(height, int) else DEFAULT_HEIGHT,
            "collapsed": bool(note.get("collapsed", False)),
            "open": bool(note.get("open", True)),
        }
