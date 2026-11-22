# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `marsanvi/littleKanban`. Use the `gh` CLI from this repository.

- Create: `gh issue create --title "..." --body "..."` (use a heredoc for multiline bodies).
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments` with appropriate filters.
- Comment: `gh issue comment <number> --body "..."`.
- Label: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post an explanation, then `gh issue close <number>`.

Use native GitHub sub-issues and issue dependencies when available. With `gh` 2.94+, use `gh issue create --parent <parent>` or `gh issue edit <parent> --add-sub-issue <child>` for sub-issues, and `gh issue create --blocked-by <n>,<n>` or `gh issue edit <child> --add-blocked-by <blocker>` for dependencies. Otherwise use the GitHub API where supported; if unavailable, record `Part of #<parent>` or `Blocked by: #<n>, #<n>` in the issue body. A ticket is unblocked when every blocker is closed. `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` counts open blockers.

Before the first issue creation in a session, verify the target with `gh repo view --json nameWithOwner`; confirm with the user if it is not their repository. File issues only in the user's own repository.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` if external PRs should enter the triage queue.

## Skill operations

- Publish to the issue tracker: create a GitHub issue.
- Fetch the relevant ticket: read the issue as above.
- `/wayfinder`: use an issue labeled `wayfinder:map` as the map, with child issues as tickets. Use `wayfinder:<type>` labels (`research`, `prototype`, `grilling`, `task`). If sub-issues are unavailable, list children in the map and put `Part of #<map>` in each child. Select the first open child in map order with no open blockers or assignee; claim it with `gh issue edit <n> --add-assignee @me`. On resolution, comment, close it, and append a context pointer to the map's Decisions-so-far.
