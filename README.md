# StickyNotes Pro

StickyNotes Pro is a native desktop sticky-notes application built with Python and PySide6 / Qt 6.

The current build includes:

- Native frameless sticky-note windows
- Native dashboard for managing all notes
- Search, Active/Archived filters, sorting, grid/list views
- Open, duplicate, archive/restore, and permanent delete actions
- Multiple notes with persisted position, size, title, and content
- Double-click header collapse/expand
- Native system move and resize
- Resize snapping
- Hidden editor scrollbars
- System tray support

## Windows development setup

```bash
py -m venv .venv
source .venv/Scripts/activate
py -m pip install -r requirements.txt
py main.py
```

Use `python` instead of `py` if needed.
