# littleKanban

Little Kanban to take away.

littleKanban is an idea for a small, portable canvas for organizing work across
multiple projects. Each project lives in its own file, making it easy to take
with you, back up, and import or export.

## The idea

- **A simple canvas:** see and organize tickets on a lightweight Kanban board.
- **Projects as files:** keep projects separate and move them between places
  without tying them to a particular service.
- **Shared projects:** let multiple people work on a project stored in a shared
  location, such as Google Drive or a similar file-sync service.
- **Markdown-first tickets:** store as much of each ticket as possible as
  Markdown, so descriptions, checklists, and notes remain easy to read and edit.
- **Tags and calendar:** categorize tickets with project-specific tags and see
  their due dates in a monthly calendar for one or multiple projects.
- **Small, portable storage:** use a compact data store for each project.
  A relational database is one possibility, but the format is not yet decided.

The goal is to keep both the application and its data approachable: open a
project, work on its board, and export it when it is time to move or share it.

For example, you could share one project with a friend for a small piece of
work, and keep another with your partner to plan the year or a holiday. Each
project would have its own file and could be shared with the people involved.

## Status

This project is at the idea stage. The application, project file format, and
import/export workflow have not been implemented yet. How shared files will
handle simultaneous edits and synchronization conflicts is still to be decided.

## License

[MIT](LICENSE)
