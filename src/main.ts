import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { startApp } from "./app";
import "./style.css";

const filters = [{ name: "littleKanban project", extensions: ["littlekanban"] }];
const app = startApp(document.body, {
  chooseNewProject: () => save({ filters, defaultPath: "Project.littlekanban" }),
  chooseProject: () => open({ filters, multiple: false }),
  readProject: (path) => invoke<string>("read_project", { path }),
  writeProject: (path, project, previous) => invoke<string>("write_project", {
    path,
    contents: `${JSON.stringify(project, null, 2)}\n`,
    previous,
  }),
});

const window = getCurrentWindow();
void window.onCloseRequested(async (event) => {
  if (!app.hasUnsavedChanges()) return;
  event.preventDefault();
  if (await confirm("Changes are not saved. Close anyway?", { title: "Unsaved changes", kind: "warning" })) {
    await window.destroy();
  }
}).catch((error: unknown) => {
  console.error("Could not register the unsaved-changes warning:", error);
});
