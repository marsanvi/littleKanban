# littleKanban

Little Kanban to take away.

littleKanban is an idea for a small, portable canvas for organizing work across
multiple projects. Each project lives in its own file, making it easy to take
with you and back up.

## The idea

- **A simple canvas:** see and organize tickets on a lightweight Kanban board.
- **Projects as files:** keep projects separate and move them between places
  without tying them to a particular service.
- **Shared projects:** let multiple people work on a project stored in a shared
  location, such as Google Drive or a similar file-sync service.
- **Markdown-first tickets:** store as much of each ticket as possible as
  Markdown, so descriptions, checklists, and notes remain easy to read and edit.
- **Tags and calendar:** categorize tickets with project-specific tags and see
  their due dates in a monthly calendar for one project at a time.
- **Small, portable storage:** use a compact data store for each project.
  A relational database is one possibility, but the format is not yet decided.

The goal is to keep both the application and its data approachable: open a
project, work on its board, and export it when it is time to move or share it.

For example, you could share one project with a friend for a small piece of
work, and keep another with your partner to plan the year or a holiday. Each
project would have its own file and could be shared with the people involved.

## Early desktop prototype

The desktop application can create a project, manage tickets, set optional
date-only due dates, and reopen the same file. Its monthly calendar shows
non-archived due-dated tickets, including completed tickets. Choose any local
folder, including a sync folder, using the native file dialog. Tickets are saved
automatically; errors leave them visible for retry.

The JSON project format is **provisional**. Concurrent editing and sync conflict
recovery are not yet safe or implemented. Do not rely on this prototype for
shared edits or as your only copy. See [file feasibility](docs/file-feasibility.md).

### Develop and run

Install Node.js, Rust, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).
Then run:

```sh
npm ci
npm run tauri dev
```

For a release build, run `npm run tauri build`. On Windows, the prerequisites
include Microsoft C++ Build Tools and WebView2; on macOS, install Xcode or its
command-line tools. A macOS debug bundle was built and launched, but its UI
was not manually exercised. Windows execution and packaging have not yet been
verified.

Run the frontend workflow tests with `npm test` and the native file tests with
`cargo test --manifest-path src-tauri/Cargo.toml`.

## License

[MIT](LICENSE)
