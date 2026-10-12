# StickyNotes Pro

StickyNotes Pro is a cross-platform Electron desktop app for managing independent sticky-note windows from a persistent dashboard and system tray.

## Current phase

This repository currently implements the dashboard foundation only. Sticky-note `BrowserWindow` instances are intentionally not implemented yet.

## Architecture goals

- Electron main process owns windows, tray lifecycle, persistence, and IPC.
- Preload exposes a narrow, explicit dashboard API with context isolation enabled.
- Dashboard HTML contains layout and reusable note-card markup.
- Dashboard CSS contains all presentation and responsive styling.
- Dashboard JavaScript contains renderer behavior only.
- Note data is persisted as JSON in Electron's per-user `userData` directory.
- Closing the dashboard does not quit the application; the tray can reopen it.
- Future sticky-note windows will be independent top-level `BrowserWindow` instances, not children of the dashboard.

## Development

```bash
npm install
npm start
```

## Dashboard features

- Create a note record
- Search title and content
- Active / archived filters
- Sort by modified date, created date, or title
- Responsive note grid
- Duplicate notes
- Archive / restore notes
- Permanently delete notes
- Tray menu with Show Dashboard and Quit
- Open-note IPC seam reserved for the next development phase
