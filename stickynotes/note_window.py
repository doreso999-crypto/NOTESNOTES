from __future__ import annotations

from collections.abc import Callable

from PySide6.QtCore import QPoint, QSize, Qt, QTimer
from PySide6.QtGui import QCloseEvent, QMouseEvent, QPainter, QResizeEvent
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QInputDialog,
    QLineEdit,
    QPlainTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from .storage import NoteStore

HEADER_HEIGHT = 28
COLLAPSED_HEIGHT = 30
MIN_WIDTH = 224
MIN_EXPANDED_HEIGHT = 160
MAX_WIDTH = 1200
MAX_HEIGHT = 1008
RESIZE_STEP = 16

NOTE_BACKGROUND = "#fff2a8"
HEADER_BACKGROUND = "#f6df76"
TEXT_COLOR = "#342b08"
BORDER_COLOR = "#c7b45f"
HOVER_COLOR = "#ead15f"
DANGER_HOVER = "#e6a06f"


class HeaderWidget(QWidget):
    def __init__(self, owner: "NoteWindow") -> None:
        super().__init__(owner)
        self.owner = owner
        self._press_global: QPoint | None = None
        self.setFixedHeight(HEADER_HEIGHT)
        self.setMouseTracking(True)

        self.menu_button = QToolButton(self)
        self.menu_button.setText("⋯")
        self.menu_button.setToolTip("Settings")
        self.menu_button.clicked.connect(self.owner.rename_note)

        self.close_button = QToolButton(self)
        self.close_button.setText("×")
        self.close_button.setToolTip("Close")
        self.close_button.clicked.connect(self.owner.close)

        common = f"""
            QToolButton {{
                border: 0;
                border-radius: 0;
                background: transparent;
                color: {TEXT_COLOR};
                font-size: 15px;
                padding: 0;
            }}
            QToolButton:hover {{ background: {HOVER_COLOR}; }}
        """
        self.menu_button.setStyleSheet(common)
        self.close_button.setStyleSheet(
            common + f"QToolButton:hover {{ background: {DANGER_HOVER}; }}"
        )

    def resizeEvent(self, event: QResizeEvent) -> None:
        button_size = HEADER_HEIGHT
        self.close_button.setGeometry(self.width() - button_size, 0, button_size, button_size)
        self.menu_button.setGeometry(
            self.width() - (button_size * 2), 0, button_size, button_size
        )
        super().resizeEvent(event)

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.fillRect(self.rect(), HEADER_BACKGROUND)
        painter.setPen(TEXT_COLOR)
        font = painter.font()
        font.setBold(True)
        font.setPointSize(9)
        painter.setFont(font)

        metrics = painter.fontMetrics()
        available_width = max(40, self.width() - 128)
        title = metrics.elidedText(
            self.owner.note_title,
            Qt.TextElideMode.ElideRight,
            available_width,
        )
        text_rect = self.rect().adjusted(64, 0, -64, 0)
        painter.drawText(text_rect, Qt.AlignmentFlag.AlignCenter, title)

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._press_global = event.globalPosition().toPoint()
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if (
            self._press_global is not None
            and event.buttons() & Qt.MouseButton.LeftButton
        ):
            distance = (event.globalPosition().toPoint() - self._press_global).manhattanLength()
            if distance >= QApplication.startDragDistance():
                handle = self.owner.windowHandle()
                self._press_global = None
                if handle is not None:
                    handle.startSystemMove()
                event.accept()
                return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        self._press_global = None
        super().mouseReleaseEvent(event)

    def mouseDoubleClickEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._press_global = None
            self.owner.toggle_collapsed()
            event.accept()
            return
        super().mouseDoubleClickEvent(event)


class ResizeHandle(QWidget):
    def __init__(self, owner: "NoteWindow", edges, cursor: Qt.CursorShape) -> None:
        super().__init__(owner)
        self.owner = owner
        self.edges = edges
        self.setCursor(cursor)
        self.setStyleSheet("background: transparent;")

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            handle = self.owner.windowHandle()
            if handle is not None:
                handle.startSystemResize(self.edges)
            event.accept()
            return
        super().mousePressEvent(event)


class NoteWindow(QWidget):
    def __init__(
        self,
        store: NoteStore,
        note: dict,
        on_title_changed: Callable[[], None],
        is_quitting: Callable[[], bool],
    ) -> None:
        super().__init__()
        self.store = store
        self.note_id = note["id"]
        self.note_title = note["title"]
        self._collapsed = bool(note.get("collapsed", False))
        self._expanded_height = max(MIN_EXPANDED_HEIGHT, int(note.get("height", 352)))
        self._on_title_changed = on_title_changed
        self._is_quitting = is_quitting
        self._snapping = False
        self._handles: dict[str, ResizeHandle] = {}

        self._text_save_timer = QTimer(self)
        self._text_save_timer.setSingleShot(True)
        self._text_save_timer.setInterval(250)
        self._text_save_timer.timeout.connect(self.save_text)

        self._state_save_timer = QTimer(self)
        self._state_save_timer.setSingleShot(True)
        self._state_save_timer.setInterval(250)
        self._state_save_timer.timeout.connect(self.save_window_state)

        self._snap_timer = QTimer(self)
        self._snap_timer.setSingleShot(True)
        self._snap_timer.setInterval(90)
        self._snap_timer.timeout.connect(self._snap_size)

        self.setObjectName("noteRoot")
        self.setWindowTitle(self.note_title)
        self.setWindowFlags(
            Qt.WindowType.Tool
            | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.NoDropShadowWindowHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, False)
        self.setMinimumWidth(MIN_WIDTH)
        self.setMaximumWidth(MAX_WIDTH)

        self.setStyleSheet(
            f"""
            QWidget#noteRoot {{
                background: {NOTE_BACKGROUND};
                border: 1px solid {BORDER_COLOR};
                border-radius: 0;
            }}
            QPlainTextEdit {{
                border: 0;
                border-radius: 0;
                background: {NOTE_BACKGROUND};
                color: {TEXT_COLOR};
                padding: 10px;
                font-size: 14px;
                selection-background-color: #dcc34f;
            }}
            """
        )

        layout = QVBoxLayout(self)
        layout.setContentsMargins(1, 1, 1, 1)
        layout.setSpacing(0)

        self.header = HeaderWidget(self)
        layout.addWidget(self.header)

        self.editor = QPlainTextEdit(self)
        self.editor.setPlainText(note.get("content", ""))
        self.editor.setPlaceholderText("Write a note...")
        self.editor.setFrameShape(QFrame.Shape.NoFrame)
        self.editor.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.editor.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.editor.setLineWrapMode(QPlainTextEdit.LineWrapMode.WidgetWidth)
        self.editor.textChanged.connect(self._text_save_timer.start)
        layout.addWidget(self.editor, 1)

        self._handles = self._create_resize_handles()

        width = self._snap(int(note.get("width", 320)), MIN_WIDTH, MAX_WIDTH)
        if isinstance(note.get("x"), int) and isinstance(note.get("y"), int):
            self.move(note["x"], note["y"])
        self.resize(width, COLLAPSED_HEIGHT if self._collapsed else self._expanded_height)
        self._apply_collapsed_state(initial=True)

    def _create_resize_handles(self) -> dict[str, ResizeHandle]:
        return {
            "left": ResizeHandle(self, Qt.Edge.LeftEdge, Qt.CursorShape.SizeHorCursor),
            "right": ResizeHandle(self, Qt.Edge.RightEdge, Qt.CursorShape.SizeHorCursor),
            "top": ResizeHandle(self, Qt.Edge.TopEdge, Qt.CursorShape.SizeVerCursor),
            "bottom": ResizeHandle(self, Qt.Edge.BottomEdge, Qt.CursorShape.SizeVerCursor),
            "tl": ResizeHandle(
                self,
                Qt.Edge.TopEdge | Qt.Edge.LeftEdge,
                Qt.CursorShape.SizeFDiagCursor,
            ),
            "tr": ResizeHandle(
                self,
                Qt.Edge.TopEdge | Qt.Edge.RightEdge,
                Qt.CursorShape.SizeBDiagCursor,
            ),
            "bl": ResizeHandle(
                self,
                Qt.Edge.BottomEdge | Qt.Edge.LeftEdge,
                Qt.CursorShape.SizeBDiagCursor,
            ),
            "br": ResizeHandle(
                self,
                Qt.Edge.BottomEdge | Qt.Edge.RightEdge,
                Qt.CursorShape.SizeFDiagCursor,
            ),
        }

    def showEvent(self, event) -> None:
        super().showEvent(event)
        self._configure_size_increment()
        QTimer.singleShot(0, self._raise_resize_handles)

    def resizeEvent(self, event: QResizeEvent) -> None:
        super().resizeEvent(event)
        if not self._collapsed:
            self._expanded_height = self.height()
        if self._handles:
            self._layout_resize_handles()
        self._state_save_timer.start()
        if not self._snapping:
            self._snap_timer.start()

    def moveEvent(self, event) -> None:
        super().moveEvent(event)
        self._state_save_timer.start()

    def closeEvent(self, event: QCloseEvent) -> None:
        self.save_text()
        self.save_window_state(open_state=self._is_quitting())
        event.accept()

    def rename_note(self) -> None:
        title, accepted = QInputDialog.getText(
            self,
            "Rename note",
            "Note name:",
            QLineEdit.EchoMode.Normal,
            self.note_title,
        )
        title = title.strip()
        if not accepted or not title:
            return

        self.note_title = title
        self.setWindowTitle(title)
        self.header.update()
        self.store.update(self.note_id, title=title)
        self._on_title_changed()

    def toggle_collapsed(self) -> None:
        if not self._collapsed:
            self._expanded_height = max(MIN_EXPANDED_HEIGHT, self.height())
        self._collapsed = not self._collapsed
        self._apply_collapsed_state()
        self.store.update(self.note_id, collapsed=self._collapsed, height=self._expanded_height)

    def _apply_collapsed_state(self, initial: bool = False) -> None:
        if self._collapsed:
            self.editor.hide()
            self.setMinimumHeight(COLLAPSED_HEIGHT)
            self.setMaximumHeight(COLLAPSED_HEIGHT)
            if not initial or self.height() != COLLAPSED_HEIGHT:
                self.resize(self.width(), COLLAPSED_HEIGHT)
        else:
            self.setMaximumHeight(MAX_HEIGHT)
            self.setMinimumHeight(MIN_EXPANDED_HEIGHT)
            self.editor.show()
            if not initial:
                self.resize(self.width(), self._expanded_height)
                self.editor.setFocus(Qt.FocusReason.MouseFocusReason)

        self._configure_size_increment()
        if self._handles:
            self._layout_resize_handles()
            self._raise_resize_handles()
        self.header.update()

    def _configure_size_increment(self) -> None:
        increment = QSize(RESIZE_STEP, 1 if self._collapsed else RESIZE_STEP)
        base_size = QSize(
            MIN_WIDTH,
            COLLAPSED_HEIGHT if self._collapsed else MIN_EXPANDED_HEIGHT,
        )
        self.setBaseSize(base_size)
        self.setSizeIncrement(increment)
        handle = self.windowHandle()
        if handle is not None:
            handle.setBaseSize(base_size)
            handle.setSizeIncrement(increment)

    def _layout_resize_handles(self) -> None:
        edge = 5
        corner = 9
        w = self.width()
        h = self.height()

        self._handles["left"].setGeometry(0, corner, edge, max(0, h - (corner * 2)))
        self._handles["right"].setGeometry(w - edge, corner, edge, max(0, h - (corner * 2)))
        self._handles["top"].setGeometry(corner, 0, max(0, w - (corner * 2)), edge)
        self._handles["bottom"].setGeometry(corner, h - edge, max(0, w - (corner * 2)), edge)
        self._handles["tl"].setGeometry(0, 0, corner, corner)
        self._handles["tr"].setGeometry(w - corner, 0, corner, corner)
        self._handles["bl"].setGeometry(0, h - corner, corner, corner)
        self._handles["br"].setGeometry(w - corner, h - corner, corner, corner)

        for name in ("top", "bottom", "tl", "tr", "bl", "br"):
            self._handles[name].setVisible(not self._collapsed)
        self._handles["left"].show()
        self._handles["right"].show()

    def _raise_resize_handles(self) -> None:
        for handle in self._handles.values():
            handle.raise_()

    def _snap_size(self) -> None:
        if self._snapping:
            return

        target_width = self._snap(self.width(), MIN_WIDTH, MAX_WIDTH)
        target_height = (
            COLLAPSED_HEIGHT
            if self._collapsed
            else self._snap(self.height(), MIN_EXPANDED_HEIGHT, MAX_HEIGHT)
        )

        if target_width == self.width() and target_height == self.height():
            return

        self._snapping = True
        self.resize(target_width, target_height)
        self._snapping = False

    def save_text(self) -> None:
        self.store.update(self.note_id, content=self.editor.toPlainText())

    def save_window_state(self, open_state: bool | None = None) -> None:
        changes = {
            "x": self.x(),
            "y": self.y(),
            "width": self.width(),
            "height": self._expanded_height,
            "collapsed": self._collapsed,
        }
        if open_state is not None:
            changes["open"] = open_state
        self.store.update(self.note_id, **changes)

    @staticmethod
    def _snap(value: int, minimum: int, maximum: int) -> int:
        value = max(minimum, min(maximum, value))
        snapped = round(value / RESIZE_STEP) * RESIZE_STEP
        return max(minimum, min(maximum, snapped))
