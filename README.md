# StickyNotes Pro

StickyNotes Pro is being rebuilt from scratch as a native desktop application using **Python + PySide6 / Qt 6**.

The current milestone intentionally contains only the sticky-note core. The previous Electron dashboard and renderer have been removed.

## Current features

- Native frameless sticky-note windows
- Square note edges
- 28 px header
- Centered note title
- `⋯` rename control and `×` close control
- Double-click the header to collapse/expand the text area
- Native window dragging through Qt
- Native edge/corner resizing through Qt
- Width/height snapping toward 16 px increments
- Collapsed notes stay header-height but remain horizontally resizable
- Hidden text-area scrollbars
- Multiple notes
- Automatic names: `New Note`, `New Note 2`, ...
- JSON persistence for content, title, position, size, and collapsed state
- System tray with New Note, Show All Notes, note list, and Quit
- Individual notes use Qt tool-window behavior so they do not create normal taskbar entries on Windows

## Windows setup

From Git Bash in the repository:

```bash
cd ~/NOTESNOTES
py -m venv .venv
source .venv/Scripts/activate
py -m pip install --upgrade pip
py -m pip install -r requirements.txt
py main.py
```

On later runs:

```bash
cd ~/NOTESNOTES
source .venv/Scripts/activate
py main.py
```

## Syntax check

```bash
py -m compileall -q main.py stickynotes
```

## Project layout

```text
main.py
requirements.txt
stickynotes/
  __init__.py
  app.py
  note_window.py
  storage.py
```

## Target platforms

Development starts on Windows. The code is structured around Qt's cross-platform APIs so Fedora KDE Plasma/Wayland can be the primary Linux target later, with macOS kept possible from the same codebase.
