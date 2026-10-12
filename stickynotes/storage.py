from __future__ import annotations

import json
import os
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from PySide6.QtCore import QStandardPaths


DEFAULT_WIDTH = 320
DEFAULT_HEIGHT = 352
DEFAULT_COLOR = "yellow"
VALID_COLORS = {"yellow", "pink", "blue", "green", "purple", "gray"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


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
        self.save()

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

    def create(self, *, title: str | None = None, content: str = "") -> dict:
        now = _utc_now()
        note = {
            "id": str(uuid4()),
            "title": title or self._next_default_title(),
            "content": content,
            "color": DEFAULT_COLOR,
            "created": now,
            "modified": now,
            "archived": False,
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
                if {"title", "content", "color", "archived"}.intersection(changes):
                    changes["modified"] = _utc_now()
                note.update(changes)
                normalized = self._normalize(note)
                note.clear()
                note.update(normalized)
                self.save()
                return deepcopy(note)
        raise KeyError(note_id)

    def duplicate(self, note_id: str) -> dict:
        source = self.get(note_id)
        if source is None:
            raise KeyError(note_id)

        title = f"{source['title']} Copy"
        used = {note["title"] for note in self.notes}
        if title in used:
            number = 2
            while f"{source['title']} Copy {number}" in used:
                number += 1
            title = f"{source['title']} Copy {number}"

        duplicate = self.create(title=title, content=source["content"])
        self.update(
            duplicate["id"],
            color=source.get("color", DEFAULT_COLOR),
            width=source["width"],
            height=source["height"],
            collapsed=source["collapsed"],
        )
        return self.get(duplicate["id"]) or duplicate

    def set_archived(self, note_id: str, archived: bool) -> dict:
        return self.update(note_id, archived=archived, open=False)

    def delete(self, note_id: str) -> bool:
        original_count = len(self.notes)
        self.notes = [note for note in self.notes if note["id"] != note_id]
        if len(self.notes) == original_count:
            return False
        self.save()
        return True

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
        created = note.get("created") if isinstance(note.get("created"), str) else _utc_now()
        modified = note.get("modified") if isinstance(note.get("modified"), str) else created
        color = note.get("color") if isinstance(note.get("color"), str) else DEFAULT_COLOR
        if color not in VALID_COLORS:
            color = DEFAULT_COLOR
        return {
            "id": str(note.get("id") or uuid4()),
            "title": str(note.get("title") or "New Note"),
            "content": str(note.get("content") or ""),
            "color": color,
            "created": created,
            "modified": modified,
            "archived": bool(note.get("archived", False)),
            "x": note.get("x") if isinstance(note.get("x"), int) else None,
            "y": note.get("y") if isinstance(note.get("y"), int) else None,
            "width": width if isinstance(width, int) else DEFAULT_WIDTH,
            "height": height if isinstance(height, int) else DEFAULT_HEIGHT,
            "collapsed": bool(note.get("collapsed", False)),
            "open": bool(note.get("open", True)),
        }
