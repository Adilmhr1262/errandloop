# ErrandLoop

Plan your stops. Get things done.

ErrandLoop is a personal errand planner that runs fully in your browser. Organize everyday errands by destination, priority, and due date, and plan outings that cover several stops in one trip. No accounts, no servers, no sample data. Everything you enter stays in your browser's local storage.

## What it does

- **Dashboard**: totals for all, pending, due today, and completed errands; high-priority errands that need attention; upcoming errands grouped by destination; recently completed errands.
- **My Errands**: add, edit, complete, reopen, and delete errands. Search by title, destination, or notes. Filter by priority, category, destination, and status. Sort by due date, priority, recently added, or alphabetically.
- **Trip Planner**: pending errands grouped by destination. Pick stops for an outing, rearrange them, and work through the checklist. Completing a stop updates the errand everywhere. Outings show progress and total estimated time, and unfinished outings survive a refresh.
- **Settings**: manage saved destinations, pick a light, dark, or system theme, export and import JSON backups, export errands as CSV, and delete all data with a typed confirmation.

## Errand fields

Title (2 to 100 characters), destination (optional, pick a saved one or type a new place), category (Shopping, Banking, Household, Personal, Other), priority (Low, Medium, High), due date (optional), estimated duration in minutes (optional), notes (at most 500 characters), and status (Pending or Completed). Overdue errands are flagged automatically.

## Rules the app follows

- Dates are local calendar dates, so a due date never shifts across timezones.
- Deleting a destination never deletes its errands; they keep their destination text.
- An outing never lists the same errand twice.
- A backup file is checked in full before it replaces anything, and the app asks for confirmation first.
- Destructive actions ask for confirmation. Delete-all needs the word DELETE typed out.
- Corrupt saved data starts the app empty and offers the unreadable data for download in Settings.
- User-entered text is rendered as text, never as markup, and CSV exports neutralize spreadsheet formulas.

## Files

- `index.html`: app shell, sidebar and bottom navigation.
- `styles.css`: layout and themes.
- `app.js`: routing, pages, outing planner, and settings.
- `storage.js`: localStorage persistence with an in-memory fallback.
- `date-utils.js`: local date handling and due labels.
- `backup.js`: backup validation, JSON backup, and CSV export.

## Run it

Open `index.html` in a browser, or serve the folder with any static file server. There is no build step and no network request.

## Tests

- `node --test tests/errandloop-unit.js`: date, backup, and CSV checks.
- `NODE_PATH=<test-tools node_modules> node tests/errandloop-test.cjs`: browser acceptance tests (Playwright, headless Firefox, local HTTP server).
