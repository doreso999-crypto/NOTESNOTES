from __future__ import annotations

from datetime import datetime
from typing import Callable

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QComboBox,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from .storage import NoteStore


class NoteCard(QFrame):
    def __init__(
        self,
        note: dict,
        *,
        archived: bool,
        list_mode: bool,
        on_open: Callable[[str], None],
        on_duplicate: Callable[[str], None],
        on_archive: Callable[[str, bool], None],
        on_delete: Callable[[str], None],
    ) -> None:
        super().__init__()
        self.note_id = note["id"]
        self.setObjectName("noteCard")
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.setMinimumHeight(118 if list_mode else 168)

        root = QVBoxLayout(self)
        root.setContentsMargins(16, 14, 16, 14)
        root.setSpacing(8)

        top = QHBoxLayout()
        title = QLabel(note["title"])
        title.setObjectName("cardTitle")
        title.setTextInteractionFlags(Qt.TextInteractionFlag.NoTextInteraction)
        top.addWidget(title, 1)

        status = QLabel("ARCHIVED" if archived else "ACTIVE")
        status.setObjectName("archivedBadge" if archived else "activeBadge")
        status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        top.addWidget(status)
        root.addLayout(top)

        preview_text = " ".join(note.get("content", "").strip().split())
        if not preview_text:
            preview_text = "No content yet"
        if len(preview_text) > 180:
            preview_text = preview_text[:177] + "..."

        preview = QLabel(preview_text)
        preview.setObjectName("cardPreview")
        preview.setWordWrap(True)
        preview.setMaximumHeight(42 if list_mode else 62)
        root.addWidget(preview)

        meta = QLabel(
            f"Created {self._format_date(note.get('created'))}   •   "
            f"Modified {self._format_date(note.get('modified'))}"
        )
        meta.setObjectName("cardMeta")
        root.addWidget(meta)

        actions = QHBoxLayout()
        actions.setSpacing(6)

        open_button = QPushButton("Open")
        open_button.setObjectName("primarySmallButton")
        open_button.clicked.connect(lambda: on_open(self.note_id))
        actions.addWidget(open_button)

        duplicate_button = QPushButton("Duplicate")
        duplicate_button.setObjectName("smallButton")
        duplicate_button.clicked.connect(lambda: on_duplicate(self.note_id))
        actions.addWidget(duplicate_button)

        archive_button = QPushButton("Restore" if archived else "Archive")
        archive_button.setObjectName("smallButton")
        archive_button.clicked.connect(lambda: on_archive(self.note_id, not archived))
        actions.addWidget(archive_button)

        delete_button = QPushButton("Delete")
        delete_button.setObjectName("dangerSmallButton")
        delete_button.clicked.connect(lambda: on_delete(self.note_id))
        actions.addWidget(delete_button)

        actions.addStretch(1)
        root.addLayout(actions)

    @staticmethod
    def _format_date(value: str | None) -> str:
        if not value:
            return "—"
        try:
            parsed = datetime.fromisoformat(value)
            return parsed.astimezone().strftime("%b %d, %Y %I:%M %p")
        except ValueError:
            return value


class DashboardWindow(QMainWindow):
    def __init__(
        self,
        store: NoteStore,
        *,
        on_new: Callable[[], None],
        on_open: Callable[[str], None],
        on_duplicate: Callable[[str], None],
        on_archive: Callable[[str, bool], None],
        on_delete: Callable[[str], None],
    ) -> None:
        super().__init__()
        self.store = store
        self.on_new = on_new
        self.on_open = on_open
        self.on_duplicate = on_duplicate
        self.on_archive = on_archive
        self.on_delete = on_delete
        self.current_filter = "active"
        self.view_mode = "grid"
        self._last_snapshot = ""

        self.setWindowTitle("StickyNotes Pro")
        self.resize(1080, 720)
        self.setMinimumSize(760, 520)

        root_widget = QWidget()
        root_widget.setObjectName("dashboardRoot")
        self.setCentralWidget(root_widget)
        root = QVBoxLayout(root_widget)
        root.setContentsMargins(28, 24, 28, 24)
        root.setSpacing(18)

        header = QHBoxLayout()
        heading_wrap = QVBoxLayout()
        heading_wrap.setSpacing(2)

        title = QLabel("StickyNotes Pro")
        title.setObjectName("dashboardTitle")
        heading_wrap.addWidget(title)

        subtitle = QLabel("All your notes in one place")
        subtitle.setObjectName("dashboardSubtitle")
        heading_wrap.addWidget(subtitle)
        header.addLayout(heading_wrap)
        header.addStretch(1)

        new_button = QPushButton("+  New Note")
        new_button.setObjectName("newNoteButton")
        new_button.clicked.connect(self.on_new)
        header.addWidget(new_button)
        root.addLayout(header)

        controls = QHBoxLayout()
        controls.setSpacing(10)

        self.search = QLineEdit()
        self.search.setObjectName("searchBox")
        self.search.setPlaceholderText("Search notes...")
        self.search.textChanged.connect(self.refresh)
        controls.addWidget(self.search, 1)

        self.active_button = QPushButton("Active")
        self.active_button.setCheckable(True)
        self.active_button.setChecked(True)
        self.active_button.setObjectName("filterButton")
        self.active_button.clicked.connect(lambda: self._set_filter("active"))
        controls.addWidget(self.active_button)

        self.archived_button = QPushButton("Archived")
        self.archived_button.setCheckable(True)
        self.archived_button.setObjectName("filterButton")
        self.archived_button.clicked.connect(lambda: self._set_filter("archived"))
        controls.addWidget(self.archived_button)

        self.sort_combo = QComboBox()
        self.sort_combo.setObjectName("sortCombo")
        self.sort_combo.addItem("Modified", "modified")
        self.sort_combo.addItem("Created", "created")
        self.sort_combo.addItem("Title", "title")
        self.sort_combo.currentIndexChanged.connect(self.refresh)
        controls.addWidget(self.sort_combo)

        self.grid_button = QToolButton()
        self.grid_button.setText("Grid")
        self.grid_button.setCheckable(True)
        self.grid_button.setChecked(True)
        self.grid_button.setObjectName("viewButton")
        self.grid_button.clicked.connect(lambda: self._set_view("grid"))
        controls.addWidget(self.grid_button)

        self.list_button = QToolButton()
        self.list_button.setText("List")
        self.list_button.setCheckable(True)
        self.list_button.setObjectName("viewButton")
        self.list_button.clicked.connect(lambda: self._set_view("list"))
        controls.addWidget(self.list_button)

        root.addLayout(controls)

        self.summary = QLabel()
        self.summary.setObjectName("summaryLabel")
        root.addWidget(self.summary)

        self.scroll = QScrollArea()
        self.scroll.setObjectName("notesScroll")
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        root.addWidget(self.scroll, 1)

        self.cards_host = QWidget()
        self.cards_host.setObjectName("cardsHost")
        self.scroll.setWidget(self.cards_host)
        self.cards_layout = QGridLayout(self.cards_host)
        self.cards_layout.setContentsMargins(0, 0, 0, 0)
        self.cards_layout.setHorizontalSpacing(14)
        self.cards_layout.setVerticalSpacing(14)
        self.cards_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        self.setStyleSheet(self._stylesheet())

        self.refresh_timer = QTimer(self)
        self.refresh_timer.setInterval(700)
        self.refresh_timer.timeout.connect(self._refresh_if_changed)
        self.refresh_timer.start()

        self.refresh()

    def closeEvent(self, event) -> None:
        event.ignore()
        self.hide()

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        if self.view_mode == "grid":
            self.refresh()

    def show_dashboard(self) -> None:
        self.show()
        self.raise_()
        self.activateWindow()
        self.refresh()

    def refresh(self) -> None:
        notes = self._filtered_notes()
        active_count = sum(not note.get("archived", False) for note in self.store.all())
        archived_count = sum(note.get("archived", False) for note in self.store.all())
        self.summary.setText(
            f"{active_count} active   •   {archived_count} archived   •   {len(notes)} shown"
        )

        while self.cards_layout.count():
            item = self.cards_layout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.deleteLater()

        if not notes:
            empty = QFrame()
            empty.setObjectName("emptyState")
            empty_layout = QVBoxLayout(empty)
            empty_layout.setContentsMargins(30, 70, 30, 70)
            empty_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

            empty_title = QLabel(
                "No archived notes" if self.current_filter == "archived" else "No notes yet"
            )
            empty_title.setObjectName("emptyTitle")
            empty_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_layout.addWidget(empty_title)

            empty_text = QLabel(
                "Archived notes will appear here."
                if self.current_filter == "archived"
                else "Create a note to get started."
            )
            empty_text.setObjectName("emptyText")
            empty_text.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_layout.addWidget(empty_text)

            self.cards_layout.addWidget(empty, 0, 0, 1, 1)
            return

        columns = 1
        if self.view_mode == "grid":
            usable_width = max(1, self.scroll.viewport().width())
            columns = 3 if usable_width >= 980 else 2 if usable_width >= 650 else 1

        for index, note in enumerate(notes):
            card = NoteCard(
                note,
                archived=bool(note.get("archived", False)),
                list_mode=self.view_mode == "list",
                on_open=self.on_open,
                on_duplicate=self.on_duplicate,
                on_archive=self.on_archive,
                on_delete=self._confirm_delete,
            )
            row = index // columns
            column = index % columns
            self.cards_layout.addWidget(card, row, column)

        for column in range(columns):
            self.cards_layout.setColumnStretch(column, 1)

        self._last_snapshot = self._snapshot()

    def _filtered_notes(self) -> list[dict]:
        notes = self.store.all()
        archived = self.current_filter == "archived"
        query = self.search.text().strip().lower()

        notes = [note for note in notes if bool(note.get("archived", False)) == archived]

        if query:
            notes = [
                note
                for note in notes
                if query in note.get("title", "").lower()
                or query in note.get("content", "").lower()
            ]

        sort_key = self.sort_combo.currentData() or "modified"
        if sort_key == "title":
            notes.sort(key=lambda note: note.get("title", "").lower())
        else:
            notes.sort(key=lambda note: note.get(sort_key, ""), reverse=True)
        return notes

    def _set_filter(self, value: str) -> None:
        self.current_filter = value
        self.active_button.setChecked(value == "active")
        self.archived_button.setChecked(value == "archived")
        self.refresh()

    def _set_view(self, value: str) -> None:
        self.view_mode = value
        self.grid_button.setChecked(value == "grid")
        self.list_button.setChecked(value == "list")
        self.refresh()

    def _confirm_delete(self, note_id: str) -> None:
        note = self.store.get(note_id)
        if note is None:
            return
        result = QMessageBox.question(
            self,
            "Delete note permanently?",
            f"Delete “{note['title']}”? This cannot be undone.",
            QMessageBox.StandardButton.Delete if hasattr(QMessageBox.StandardButton, "Delete") else QMessageBox.StandardButton.Yes,
            QMessageBox.StandardButton.No,
        )
        accepted = result in {QMessageBox.StandardButton.Yes}
        if hasattr(QMessageBox.StandardButton, "Delete"):
            accepted = accepted or result == QMessageBox.StandardButton.Delete
        if accepted:
            self.on_delete(note_id)

    def _snapshot(self) -> str:
        return repr(
            [
                (
                    note.get("id"),
                    note.get("title"),
                    note.get("content"),
                    note.get("modified"),
                    note.get("archived"),
                )
                for note in self.store.all()
            ]
        )

    def _refresh_if_changed(self) -> None:
        snapshot = self._snapshot()
        if snapshot != self._last_snapshot:
            self.refresh()

    @staticmethod
    def _stylesheet() -> str:
        return """
        QWidget#dashboardRoot {
            background: #f5f6f8;
            color: #202124;
            font-family: "Segoe UI", Arial, sans-serif;
        }
        QLabel#dashboardTitle {
            font-size: 26px;
            font-weight: 700;
            color: #17181a;
        }
        QLabel#dashboardSubtitle,
        QLabel#summaryLabel {
            color: #777b82;
            font-size: 12px;
        }
        QPushButton#newNoteButton {
            background: #f0d65f;
            border: 1px solid #dbc246;
            border-radius: 7px;
            padding: 9px 16px;
            font-weight: 700;
            color: #2c2609;
        }
        QPushButton#newNoteButton:hover { background: #e8ca48; }
        QLineEdit#searchBox,
        QComboBox#sortCombo {
            background: white;
            border: 1px solid #d8dbe0;
            border-radius: 7px;
            padding: 8px 10px;
            min-height: 18px;
        }
        QPushButton#filterButton,
        QToolButton#viewButton {
            background: white;
            border: 1px solid #d8dbe0;
            border-radius: 7px;
            padding: 8px 12px;
            color: #4e5258;
        }
        QPushButton#filterButton:checked,
        QToolButton#viewButton:checked {
            background: #fff4b0;
            border-color: #d8bd3f;
            color: #332d0d;
            font-weight: 700;
        }
        QScrollArea#notesScroll { background: transparent; }
        QWidget#cardsHost { background: transparent; }
        QFrame#noteCard {
            background: white;
            border: 1px solid #dedfe3;
            border-radius: 9px;
        }
        QLabel#cardTitle {
            font-size: 15px;
            font-weight: 700;
            color: #222326;
        }
        QLabel#cardPreview {
            color: #60646b;
            font-size: 12px;
        }
        QLabel#cardMeta {
            color: #9a9da2;
            font-size: 10px;
        }
        QLabel#activeBadge,
        QLabel#archivedBadge {
            border-radius: 5px;
            padding: 3px 6px;
            font-size: 9px;
            font-weight: 700;
        }
        QLabel#activeBadge {
            color: #66540a;
            background: #fff3a6;
        }
        QLabel#archivedBadge {
            color: #666a70;
            background: #eceef1;
        }
        QPushButton#smallButton,
        QPushButton#primarySmallButton,
        QPushButton#dangerSmallButton {
            border-radius: 5px;
            padding: 5px 9px;
            font-size: 11px;
        }
        QPushButton#smallButton {
            background: #f7f7f8;
            border: 1px solid #dedfe3;
            color: #555960;
        }
        QPushButton#primarySmallButton {
            background: #fff1a0;
            border: 1px solid #dbc246;
            color: #3b330d;
            font-weight: 700;
        }
        QPushButton#dangerSmallButton {
            background: #fff5f3;
            border: 1px solid #edcbc5;
            color: #a24638;
        }
        QFrame#emptyState {
            background: white;
            border: 1px dashed #d6d8dc;
            border-radius: 9px;
        }
        QLabel#emptyTitle {
            font-size: 17px;
            font-weight: 700;
            color: #3b3d41;
        }
        QLabel#emptyText {
            color: #8a8e95;
            font-size: 12px;
        }
        """
