from __future__ import annotations

from collections.abc import Callable

from PySide6.QtCore import QPoint, QRect, QSize, Qt, QTimer
from PySide6.QtGui import QCloseEvent, QMouseEvent, QPainter, QResizeEvent
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPlainTextEdit,
    QPushButton,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from .storage import DEFAULT_COLOR, NoteStore

HEADER_HEIGHT = 28
COLLAPSED_HEIGHT = 30
SETTINGS_HEIGHT = 118
MIN_WIDTH = 224
MIN_EXPANDED_HEIGHT = 160
MAX_WIDTH = 1200
MAX_HEIGHT = 1008
RESIZE_STEP = 16
SNAP_DISTANCE = 9
ALIGN_DISTANCE = 6
MIN_SNAP_OVERLAP = 24
SNAP_RELEASE_CHECK_MS = 60

TEXT_COLOR = "#342b08"
DANGER_HOVER = "#e6a06f"

NOTE_PALETTES = {
    "yellow": {
        "body": "#fff2a8",
        "header": "#f6df76",
        "border": "#c7b45f",
        "hover": "#ead15f",
    },
    "pink": {
        "body": "#ffdce7",
        "header": "#f5bcd0",
        "border": "#cb91a5",
        "hover": "#eaaac0",
    },
    "blue": {
        "body": "#dcefff",
        "header": "#b9dcf7",
        "border": "#8bb6d6",
        "hover": "#a7d1ef",
    },
    "green": {
        "body": "#def5d5",
        "header": "#bfe8ad",
        "border": "#94bf82",
        "hover": "#afe09a",
    },
    "purple": {
        "body": "#eadfff",
        "header": "#d2bff3",
        "border": "#a995ce",
        "hover": "#c5afea",
    },
    "gray": {
        "body": "#e9ecef",
        "header": "#cfd4d8",
        "border": "#9fa5ab",
        "hover": "#c0c5ca",
    },
}


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
        self.menu_button.clicked.connect(self.owner.toggle_settings)

        self.close_button = QToolButton(self)
        self.close_button.setText("×")
        self.close_button.setToolTip("Close")
        self.close_button.clicked.connect(self.owner.close)

        self.apply_theme()

    def apply_theme(self) -> None:
        hover = self.owner.colors["hover"]
        common = f"""
            QToolButton {{
                border: 0;
                border-radius: 0;
                background: transparent;
                color: {TEXT_COLOR};
                font-size: 15px;
                padding: 0;
            }}
            QToolButton:hover {{ background: {hover}; }}
        """
        self.menu_button.setStyleSheet(common)
        self.close_button.setStyleSheet(
            common + f"QToolButton:hover {{ background: {DANGER_HOVER}; }}"
        )
        self.update()

    def resizeEvent(self, event: QResizeEvent) -> None:
        button_size = HEADER_HEIGHT
        self.close_button.setGeometry(self.width() - button_size, 0, button_size, button_size)
        self.menu_button.setGeometry(
            self.width() - (button_size * 2), 0, button_size, button_size
        )
        super().resizeEvent(event)

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.fillRect(self.rect(), self.owner.colors["header"])
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
        if self._press_global is not None and event.buttons() & Qt.MouseButton.LeftButton:
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
        if event.button() == Qt.MouseButton.LeftButton:
            self.owner.request_position_snap()
        super().mouseReleaseEvent(event)

    def mouseDoubleClickEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._press_global = None
            self.owner.toggle_collapsed()
            event.accept()
            return
        super().mouseDoubleClickEvent(event)


class SettingsPanel(QFrame):
    def __init__(self, owner: "NoteWindow") -> None:
        super().__init__(owner)
        self.owner = owner
        self.setObjectName("settingsPanel")
        self.setFixedHeight(SETTINGS_HEIGHT)

        root = QVBoxLayout(self)
        root.setContentsMargins(10, 8, 10, 8)
        root.setSpacing(6)

        name_label = QLabel("Note name")
        name_label.setObjectName("settingsLabel")
        root.addWidget(name_label)

        name_row = QHBoxLayout()
        name_row.setSpacing(6)
        self.name_input = QLineEdit(owner.note_title)
        self.name_input.setObjectName("settingsName")
        self.name_input.returnPressed.connect(owner.apply_settings_name)
        name_row.addWidget(self.name_input, 1)

        save_button = QPushButton("Save")
        save_button.setObjectName("settingsSave")
        save_button.clicked.connect(owner.apply_settings_name)
        name_row.addWidget(save_button)
        root.addLayout(name_row)

        color_label = QLabel("Color")
        color_label.setObjectName("settingsLabel")
        root.addWidget(color_label)

        colors_row = QHBoxLayout()
        colors_row.setSpacing(7)
        self.color_buttons: dict[str, QToolButton] = {}
        for color_name, palette in NOTE_PALETTES.items():
            button = QToolButton()
            button.setFixedSize(24, 24)
            button.setToolTip(color_name.title())
            button.clicked.connect(
                lambda checked=False, selected=color_name: owner.set_note_color(selected)
            )
            self.color_buttons[color_name] = button
            colors_row.addWidget(button)
        colors_row.addStretch(1)
        root.addLayout(colors_row)

        self.apply_theme()

    def sync(self) -> None:
        self.name_input.setText(self.owner.note_title)
        self.apply_theme()

    def apply_theme(self) -> None:
        colors = self.owner.colors
        self.setStyleSheet(
            f"""
            QFrame#settingsPanel {{
                background: {colors['body']};
                border-top: 1px solid {colors['border']};
                border-bottom: 1px solid {colors['border']};
                border-left: 0;
                border-right: 0;
            }}
            QLabel#settingsLabel {{
                background: transparent;
                color: {TEXT_COLOR};
                font-size: 10px;
                font-weight: 700;
            }}
            QLineEdit#settingsName {{
                background: {colors['header']};
                color: {TEXT_COLOR};
                border: 1px solid {colors['border']};
                border-radius: 0;
                padding: 4px 6px;
            }}
            QPushButton#settingsSave {{
                background: {colors['header']};
                color: {TEXT_COLOR};
                border: 1px solid {colors['border']};
                border-radius: 0;
                padding: 4px 9px;
                font-weight: 700;
            }}
            QPushButton#settingsSave:hover {{ background: {colors['hover']}; }}
            """
        )

        for color_name, button in self.color_buttons.items():
            palette = NOTE_PALETTES[color_name]
            selected = color_name == self.owner.note_color
            border_width = 3 if selected else 1
            button.setStyleSheet(
                f"""
                QToolButton {{
                    background: {palette['body']};
                    border: {border_width}px solid {palette['border']};
                    border-radius: 0;
                    padding: 0;
                }}
                """
            )


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
        snap_targets: Callable[[], list[QRect]],
    ) -> None:
        super().__init__()
        self.store = store
        self.note_id = note["id"]
        self.note_title = note["title"]
        self.note_color = note.get("color", DEFAULT_COLOR)
        if self.note_color not in NOTE_PALETTES:
            self.note_color = DEFAULT_COLOR
        self._collapsed = bool(note.get("collapsed", False))
        self._expanded_height = max(MIN_EXPANDED_HEIGHT, int(note.get("height", 352)))
        self._on_title_changed = on_title_changed
        self._is_quitting = is_quitting
        self._snap_targets = snap_targets
        self._snapping = False
        self._position_snapping = False
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

        self._position_snap_timer = QTimer(self)
        self._position_snap_timer.setSingleShot(True)
        self._position_snap_timer.setInterval(SNAP_RELEASE_CHECK_MS)
        self._position_snap_timer.timeout.connect(self._snap_position_if_released)

        self.setObjectName("noteRoot")
        self.setWindowTitle(self.note_title)
        self.setWindowFlags(
            Qt.WindowType.Tool
            | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.NoDropShadowWindowHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, False)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAutoFillBackground(False)
        self.setMinimumWidth(MIN_WIDTH)
        self.setMaximumWidth(MAX_WIDTH)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(1, 1, 1, 1)
        layout.setSpacing(0)

        self.header = HeaderWidget(self)
        layout.addWidget(self.header)

        self.settings_panel = SettingsPanel(self)
        self.settings_panel.hide()
        layout.addWidget(self.settings_panel)

        self.editor = QPlainTextEdit(self)
        self.editor.setPlainText(note.get("content", ""))
        self.editor.setPlaceholderText("Write a note...")
        self.editor.setFrameShape(QFrame.Shape.NoFrame)
        self.editor.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.editor.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.editor.setLineWrapMode(QPlainTextEdit.LineWrapMode.WidgetWidth)
        self.editor.textChanged.connect(self._text_save_timer.start)
        layout.addWidget(self.editor, 1)

        self._apply_theme()
        self._handles = self._create_resize_handles()

        width = self._snap(int(note.get("width", 320)), MIN_WIDTH, MAX_WIDTH)
        if isinstance(note.get("x"), int) and isinstance(note.get("y"), int):
            self.move(note["x"], note["y"])
        self.resize(width, COLLAPSED_HEIGHT if self._collapsed else self._expanded_height)
        self._apply_collapsed_state(initial=True)

    @property
    def colors(self) -> dict[str, str]:
        return NOTE_PALETTES[self.note_color]

    def _apply_theme(self) -> None:
        colors = self.colors
        self.setStyleSheet(
            f"""
            QWidget#noteRoot {{
                background: {colors['body']};
                border: 1px solid {colors['border']};
                border-radius: 0;
            }}
            QPlainTextEdit {{
                border: 0;
                border-radius: 0;
                background: {colors['body']};
                color: {TEXT_COLOR};
                padding: 10px;
                font-size: 14px;
                selection-background-color: {colors['header']};
            }}
            """
        )
        if hasattr(self, "header"):
            self.header.apply_theme()
        if hasattr(self, "settings_panel"):
            self.settings_panel.apply_theme()

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
        if not self._position_snapping:
            self.request_position_snap()

    def closeEvent(self, event: QCloseEvent) -> None:
        self.save_text()
        self.save_window_state(open_state=self._is_quitting())
        event.accept()

    def toggle_settings(self) -> None:
        if self.settings_panel.isVisible():
            self.close_settings()
            return

        self.settings_panel.sync()
        self.settings_panel.show()
        if self._collapsed:
            target_height = COLLAPSED_HEIGHT + SETTINGS_HEIGHT
            self.setMinimumHeight(target_height)
            self.setMaximumHeight(target_height)
            self.resize(self.width(), target_height)
        self.settings_panel.name_input.setFocus(Qt.FocusReason.MouseFocusReason)
        self.settings_panel.name_input.selectAll()
        self._raise_resize_handles()

    def close_settings(self) -> None:
        if not self.settings_panel.isVisible():
            return
        self.settings_panel.hide()
        if self._collapsed:
            self.setMinimumHeight(COLLAPSED_HEIGHT)
            self.setMaximumHeight(COLLAPSED_HEIGHT)
            self.resize(self.width(), COLLAPSED_HEIGHT)
        self._raise_resize_handles()

    def apply_settings_name(self) -> None:
        title = self.settings_panel.name_input.text().strip()
        if not title:
            self.settings_panel.name_input.setText(self.note_title)
            self.settings_panel.name_input.selectAll()
            return

        if title == self.note_title:
            return

        self.note_title = title
        self.setWindowTitle(title)
        self.header.update()
        self.store.update(self.note_id, title=title)
        self._on_title_changed()

    def set_note_color(self, color_name: str) -> None:
        if color_name not in NOTE_PALETTES or color_name == self.note_color:
            return
        self.note_color = color_name
        self.store.update(self.note_id, color=color_name)
        self._apply_theme()
        self.settings_panel.apply_theme()
        self.header.update()
        self._on_title_changed()

    def toggle_collapsed(self) -> None:
        self.close_settings()
        if not self._collapsed:
            self._expanded_height = max(MIN_EXPANDED_HEIGHT, self.height())
        self._collapsed = not self._collapsed
        self._apply_collapsed_state()
        self.store.update(self.note_id, collapsed=self._collapsed, height=self._expanded_height)

    def _apply_collapsed_state(self, initial: bool = False) -> None:
        if self._collapsed:
            self.editor.hide()
            target_height = (
                COLLAPSED_HEIGHT + SETTINGS_HEIGHT
                if self.settings_panel.isVisible()
                else COLLAPSED_HEIGHT
            )
            self.setMinimumHeight(target_height)
            self.setMaximumHeight(target_height)
            if not initial or self.height() != target_height:
                self.resize(self.width(), target_height)
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
        base_height = (
            COLLAPSED_HEIGHT + SETTINGS_HEIGHT
            if self._collapsed and self.settings_panel.isVisible()
            else COLLAPSED_HEIGHT if self._collapsed else MIN_EXPANDED_HEIGHT
        )
        base_size = QSize(MIN_WIDTH, base_height)
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
        if self._collapsed:
            target_height = (
                COLLAPSED_HEIGHT + SETTINGS_HEIGHT
                if self.settings_panel.isVisible()
                else COLLAPSED_HEIGHT
            )
        else:
            target_height = self._snap(self.height(), MIN_EXPANDED_HEIGHT, MAX_HEIGHT)

        if target_width == self.width() and target_height == self.height():
            return

        self._snapping = True
        self.resize(target_width, target_height)
        self._snapping = False

    def request_position_snap(self) -> None:
        if self._position_snapping:
            return
        self._position_snap_timer.start()

    def _snap_position_if_released(self) -> None:
        if QApplication.mouseButtons() & Qt.MouseButton.LeftButton:
            self._position_snap_timer.start()
            return
        self._snap_position()

    def _snap_position(self) -> None:
        if self._position_snapping:
            return

        if QApplication.keyboardModifiers() & Qt.KeyboardModifier.AltModifier:
            return

        targets = self._snap_targets()
        if not targets:
            return

        current = QRect(self.geometry())
        target_x = current.x()
        target_y = current.y()
        best_x_distance = SNAP_DISTANCE + 1
        best_y_distance = SNAP_DISTANCE + 1

        for other in targets:
            vertical_overlap = min(current.bottom(), other.bottom()) - max(current.top(), other.top()) + 1
            horizontal_overlap = min(current.right(), other.right()) - max(current.left(), other.left()) + 1

            if vertical_overlap >= MIN_SNAP_OVERLAP:
                for candidate_x in (other.right() + 1, other.left() - current.width()):
                    distance = abs(candidate_x - current.x())
                    if distance <= SNAP_DISTANCE and distance < best_x_distance:
                        best_x_distance = distance
                        target_x = candidate_x

                horizontal_edge_distance = min(
                    abs(current.left() - (other.right() + 1)),
                    abs((current.right() + 1) - other.left()),
                )
                if horizontal_edge_distance <= SNAP_DISTANCE:
                    for candidate_y in (other.top(), other.bottom() - current.height() + 1):
                        distance = abs(candidate_y - current.y())
                        if distance <= ALIGN_DISTANCE and distance < best_y_distance:
                            best_y_distance = distance
                            target_y = candidate_y

            if horizontal_overlap >= MIN_SNAP_OVERLAP:
                for candidate_y in (other.bottom() + 1, other.top() - current.height()):
                    distance = abs(candidate_y - current.y())
                    if distance <= SNAP_DISTANCE and distance < best_y_distance:
                        best_y_distance = distance
                        target_y = candidate_y

                vertical_edge_distance = min(
                    abs(current.top() - (other.bottom() + 1)),
                    abs((current.bottom() + 1) - other.top()),
                )
                if vertical_edge_distance <= SNAP_DISTANCE:
                    for candidate_x in (other.left(), other.right() - current.width() + 1):
                        distance = abs(candidate_x - current.x())
                        if distance <= ALIGN_DISTANCE and distance < best_x_distance:
                            best_x_distance = distance
                            target_x = candidate_x

        if target_x == current.x() and target_y == current.y():
            return

        self._position_snapping = True
        self.move(target_x, target_y)
        self._position_snapping = False
        self._state_save_timer.start()

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
