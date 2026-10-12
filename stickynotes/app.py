from __future__ import annotations

import sys

from PySide6.QtCore import QObject, Qt
from PySide6.QtGui import QAction, QColor, QIcon, QPainter, QPen, QPixmap
from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from .note_window import NoteWindow
from .storage import NoteStore


class StickyNotesApplication(QObject):
    def __init__(self, app: QApplication) -> None:
        super().__init__()
        self.app = app
        self.store = NoteStore()
        self.windows: dict[str, NoteWindow] = {}
        self.quitting = False

        self.tray = QSystemTrayIcon(self._make_icon(), self)
        self.tray.setToolTip("StickyNotes Pro")
        self.tray.activated.connect(self._tray_activated)
        self._rebuild_tray_menu()
        self.tray.show()

    def start(self) -> None:
        notes = self.store.all()
        if not notes:
            note = self.store.create()
            self.open_note(note["id"])
            return

        for note in notes:
            if note.get("open", True):
                self.open_note(note["id"])

    def new_note(self) -> None:
        note = self.store.create()
        self.open_note(note["id"])
        self._rebuild_tray_menu()

    def open_note(self, note_id: str) -> None:
        note = self.store.get(note_id)
        if note is None:
            return

        window = self.windows.get(note_id)
        if window is None:
            window = NoteWindow(
                self.store,
                note,
                on_title_changed=self._rebuild_tray_menu,
                is_quitting=lambda: self.quitting,
            )
            self.windows[note_id] = window

        self.store.update(note_id, open=True)
        window.show()
        window.raise_()
        window.activateWindow()

    def show_all_notes(self) -> None:
        for note in self.store.all():
            self.open_note(note["id"])

    def quit(self) -> None:
        self.quitting = True
        for window in self.windows.values():
            if window.isVisible():
                window.save_text()
                window.save_window_state(open_state=True)
        self.tray.hide()
        self.app.quit()

    def _rebuild_tray_menu(self) -> None:
        menu = QMenu()

        new_action = QAction("New Note", menu)
        new_action.triggered.connect(self.new_note)
        menu.addAction(new_action)

        show_all_action = QAction("Show All Notes", menu)
        show_all_action.triggered.connect(self.show_all_notes)
        menu.addAction(show_all_action)

        notes = self.store.all()
        if notes:
            notes_menu = menu.addMenu("Notes")
            for note in notes:
                action = QAction(note["title"], notes_menu)
                action.triggered.connect(
                    lambda checked=False, note_id=note["id"]: self.open_note(note_id)
                )
                notes_menu.addAction(action)

        menu.addSeparator()
        quit_action = QAction("Quit", menu)
        quit_action.triggered.connect(self.quit)
        menu.addAction(quit_action)

        self.tray.setContextMenu(menu)
        self._tray_menu = menu

    def _tray_activated(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            self.show_all_notes()

    @staticmethod
    def _make_icon() -> QIcon:
        pixmap = QPixmap(32, 32)
        pixmap.fill(QColor("#f6df76"))
        painter = QPainter(pixmap)
        painter.setPen(QPen(QColor("#6f6227"), 2))
        painter.drawRect(1, 1, 29, 29)
        painter.setPen(QColor("#342b08"))
        font = painter.font()
        font.setBold(True)
        font.setPointSize(12)
        painter.setFont(font)
        painter.drawText(pixmap.rect(), Qt.AlignmentFlag.AlignCenter, "S")
        painter.end()
        return QIcon(pixmap)


def run() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("StickyNotes Pro")
    app.setOrganizationName("StickyNotes Pro")
    app.setQuitOnLastWindowClosed(False)

    controller = StickyNotesApplication(app)
    controller.start()
    return app.exec()
