# Contributing to littleKanban

## Git Workflow

This project follows a feature branch workflow to ensure code quality and proper tracking of issues.

### Required Workflow

**All work must be done in feature branches - direct commits to `main` are prevented by git hooks.**

#### Step 1: Create a Feature Branch

For each issue, create a new feature branch:

```bash
git checkout -b feature/issue-NUMBER-description
```

**Naming Convention:**
- `feature/issue-7-member-management` - for new features
- `fix/issue-15-ticket-bug` - for bug fixes
- Include the issue number and a clear description

#### Step 2: Make Changes and Commit

Work in your feature branch as normal:

```bash
git add .
git commit -m "feat: implement member management

- Add members array to Project interface
- Create member management UI
- Implement member persistence
- Add tests for member functionality

Closes #7

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

#### Step 3: Push and Create a Pull Request

Push your feature branch to the remote:

```bash
git push origin feature/issue-NUMBER-description
```

Then create a pull request on GitHub to merge into `main`.

#### Step 4: Code Review and Merge

- Request review from team members
- Address feedback and update your branch
- After approval, merge via GitHub PR (not locally)

### Git Hooks

The repository includes two git hooks to enforce this workflow:

#### `.git/hooks/pre-commit`
Prevents committing directly to `main` or `master` branches.

If you accidentally try to commit to main:
```bash
# Move changes to a new feature branch
git stash
git checkout -b feature/issue-NUMBER-description
git stash pop
git commit -m "..."
```

#### `.git/hooks/pre-push`
Prevents pushing directly to `main` or `master` branches.

This ensures all code goes through a pull request review before reaching main.

### Tips

- **Keep PRs focused**: Each PR should address one issue/feature
- **Write clear commit messages**: Include issue number and description
- **Keep branches up to date**: Rebase on main before submitting PR
- **Run tests locally**: Ensure all tests pass before pushing
  ```bash
  npm test
  ```

### Testing

Before committing, always run the full test suite:

```bash
npm test
```

For test-driven development:
```bash
npm test -- --watch
```

## Questions?

Refer to the issue description or ask in the PR discussion.
