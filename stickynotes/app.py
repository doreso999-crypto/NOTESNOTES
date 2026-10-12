from __future__ import annotations

import sys

from PySide6.QtCore import QObject, Qt
from PySide6.QtGui import QAction, QColor, QIcon, QPainter, QPen, QPixmap
from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from .dashboard import DashboardWindow
from .note_window import NoteWindow
from .storage import NoteStore


class StickyNotesApplication(QObject):
    def __init__(self, app: QApplication) -> None:
        super().__init__()
        self.app = app
        self.store = NoteStore()
        self.windows: dict[str, NoteWindow] = {}
        self.quitting = False

        self.dashboard = DashboardWindow(
            self.store,
            on_new=self.new_note,
            on_open=self.open_note,
            on_duplicate=self.duplicate_note,
            on_archive=self.set_archived,
            on_delete=self.delete_note,
        )

        self.tray = QSystemTrayIcon(self._make_icon(), self)
        self.tray.setToolTip("StickyNotes Pro")
        self.tray.activated.connect(self._tray_activated)
        self._rebuild_tray_menu()
        self.tray.show()

    def start(self) -> None:
        self.dashboard.show_dashboard()

        for note in self.store.all():
            if note.get("open", False) and not note.get("archived", False):
                self.open_note(note["id"], focus=False)

    def new_note(self) -> None:
        note = self.store.create()
        self.open_note(note["id"])
        self.dashboard.refresh()
        self._rebuild_tray_menu()

    def open_note(self, note_id: str, focus: bool = True) -> None:
        note = self.store.get(note_id)
        if note is None:
            return

        window = self.windows.get(note_id)
        if window is None:
            window = NoteWindow(
                self.store,
                note,
                on_title_changed=self._on_note_title_changed,
                is_quitting=lambda: self.quitting,
            )
            self.windows[note_id] = window

        self.store.update(note_id, open=True)
        window.show()
        window.raise_()
        if focus:
            window.activateWindow()
        self.dashboard.refresh()

    def duplicate_note(self, note_id: str) -> None:
        duplicate = self.store.duplicate(note_id)
        self.open_note(duplicate["id"])
        self.dashboard.refresh()
        self._rebuild_tray_menu()

    def set_archived(self, note_id: str, archived: bool) -> None:
        window = self.windows.get(note_id)
        if archived and window is not None and window.isVisible():
            window.close()

        try:
            self.store.set_archived(note_id, archived)
        except KeyError:
            return

        self.dashboard.refresh()
        self._rebuild_tray_menu()

    def delete_note(self, note_id: str) -> None:
        window = self.windows.get(note_id)
        if window is not None:
            if window.isVisible():
                window.close()
            window.deleteLater()
            self.windows.pop(note_id, None)

        self.store.delete(note_id)
        self.dashboard.refresh()
        self._rebuild_tray_menu()

    def show_all_notes(self) -> None:
        for note in self.store.all():
            if not note.get("archived", False):
                self.open_note(note["id"], focus=False)

    def show_dashboard(self) -> None:
        self.dashboard.show_dashboard()

    def quit(self) -> None:
        self.quitting = True
        for window in self.windows.values():
            if window.isVisible():
                window.save_text()
                window.save_window_state(open_state=True)
        self.tray.hide()
        self.app.quit()

    def _on_note_title_changed(self) -> None:
        self.dashboard.refresh()
        self._rebuild_tray_menu()

    def _rebuild_tray_menu(self) -> None:
        menu = QMenu()

        dashboard_action = QAction("Open Dashboard", menu)
        dashboard_action.triggered.connect(self.show_dashboard)
        menu.addAction(dashboard_action)

        new_action = QAction("New Note", menu)
        new_action.triggered.connect(self.new_note)
        menu.addAction(new_action)

        show_all_action = QAction("Show All Notes", menu)
        show_all_action.triggered.connect(self.show_all_notes)
        menu.addAction(show_all_action)

        notes = [note for note in self.store.all() if not note.get("archived", False)]
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
            self.show_dashboard()

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
