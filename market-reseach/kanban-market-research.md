# Kanban product comparison

Research date: 2026-11-22. This is a focused comparison, not an exhaustive
market survey. Product features are sourced from official documentation;
assessments and suggested priorities are our judgment.

## Comparable products

| Product | Relevant features | Difference from littleKanban |
| --- | --- | --- |
| [Kanri](https://github.com/kanriapp/kanri) | Offline desktop boards for macOS, Windows, and Linux; JSON storage; customizable columns, due dates, subtasks, tags, and export. | No built-in cloud sync; separate file paths for individual boards are described as a possible future feature. |
| [Obsidian Kanban](https://github.com/community-archive/obsidian-kanban) | Markdown-backed boards inside Obsidian. Its [documentation](https://github.com/community-archive/obsidian-kanban/tree/main/docs) covers dates, search, archives, and work-in-progress limits. | A plugin for a notes app rather than a standalone project-file app. The plugin is looking for maintainers. |
| [Backlog.md](https://github.com/MrLesk/Backlog.md) | Local-first Markdown files, search, a terminal board, and a local web board with drag-and-drop. | Folder-based and primarily aimed at Git and technical workflows; not a dedicated desktop app. Git is optional. |
| [Trello](https://trello.com/guide/trello-101) | Flexible lists, cards, drag-and-drop, collaboration, search, and automation. | A hosted service rather than the proposed local project-file model. |
| [PLANKA](https://github.com/plankanban/planka) | Self-hosted boards, Markdown, due dates, and real-time collaboration. Its Pro edition lists a cross-project dashboard and multiple views. | Server-based rather than an offline project-file app; some features require Pro. |

[Focalboard](https://github.com/mattermost-community/focalboard) is another
historical comparison, but its repository says it is not maintained.

## Useful lessons for littleKanban

1. **Fast, understandable boards:** drag-and-drop, keyboard access, and quick
   ticket creation keep everyday use lightweight.
2. **Portable, readable data:** offline access, Markdown, and simple import and
   export support ownership of personal and shared projects.
3. **A combined view:** project colors, search, filters, and due dates make
   mixed family and work projects easier to navigate. PLANKA's cross-project
   dashboard is a related, server-based Pro feature.
4. **Safe collaboration:** visible conflict resolution and recovery matter
   when collaborators work offline. [Obsidian Sync](https://obsidian.md/help/sync/troubleshoot)
   provides merge and conflict-copy options, but these describe that specific
   sync service, not Google Drive or other folder-sync services.
5. **Customization as a later possibility:** competitors support features such
   as custom columns, tags, and work-in-progress limits. After this research,
   tags were added to the intended first-release scope; custom columns and
   work-in-progress limits remain possibilities for later.

The sources do not establish which features users value most; the priorities
above are an assessment based on the stated product goals.

## Positioning and risk

No exact match was identified in this limited scan for the combination of
offline desktop use, one portable file per project, Markdown tickets, a
combined board, and collaboration through synced folders. This is not proof
that no such product exists.

The central technical uncertainty is conflict safety: a sync provider may
overwrite or discard a version before the application sees it. Compare
single-file and folder-based formats with a prototype, without assuming
either format alone guarantees safe concurrent edits.
