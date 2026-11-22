# Project file feasibility

## Provisional decision

Use versioned, human-readable JSON as a working prototype, not a finalized
format. It is portable, inspectable, and can represent Markdown text and stable
ticket IDs. Whole-file rewrites can amplify conflicts, and JSON alone does not
provide transaction isolation, history, merge, or recovery. A per-project
SQLite database could offer local transactions and structured queries, but
database files and sidecars also require careful sync and conflict handling.
Neither format makes concurrent sync safe. Revisit this decision after testing
real clients and implementing conflict detection and recovery.

Version 1 has a project name and title-only To do tickets. Unknown or newer
versions are not opened for writing. The app writes a temporary file in the
same directory and replaces the working file; it compares the previously read
bytes immediately before replacement. New files are created without replacing
an existing file.

## Synthetic observations

On macOS 26.7.3 (Apple Silicon), a temporary local file changed after opening
was detected by the native file test: the subsequent save failed and the
external contents remained. The interface test retained the unsaved ticket and
displayed the error.

In 100 simultaneous synthetic write attempts against one local file,
both writers reported success in 89 attempts and only one succeeded in 11.
The compare and replacement are separate operations, so both writers can
compare before either replaces the file. One successful edit then replaces the
other. This is a demonstrated lost-update race, not safe concurrency control.
Results are scheduling-dependent, and the experiment does not simulate a sync
provider or two disconnected devices. Reproduce with:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --test files
cargo run --manifest-path src-tauri/Cargo.toml --example concurrent
```

## Not validated

No synced test folder was provided. OneDrive is installed, but no real OneDrive,
iCloud Drive, Google Drive, Dropbox, or other service was tested. No claim is
made that any service retains conflicting or unseen versions. Windows
execution, installer packaging, and offline desktop operation have not been
tested. A macOS debug bundle was built and its process launched, but the native
UI and file dialogs were not manually exercised. The workflow tests drive the
interface with a temporary-file adapter, not the native dialogs or Rust bridge.
The prototype does not merge changes, discover conflict copies, or
recover edits after an unexpected close. A version discarded before the app
can access it cannot be recovered by the app.
