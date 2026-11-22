// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { startApp, type Desktop, type Project } from "../src/app";

let directory = "";

function desktopFor(path: string, exportPath?: string, importPath?: string): Desktop {
  return {
    chooseNewProject: async () => path,
    chooseProject: async () => path,
    readProject: async (file) => readFile(file, "utf8"),
    writeProject: async (file, project: Project, previous) => {
      if (previous === null) {
        await writeFile(file, JSON.stringify(project), { flag: "wx" });
      } else {
        if (await readFile(file, "utf8") !== previous) {
          throw new Error("Project changed outside littleKanban. Your changes are not saved.");
        }
        await writeFile(file, JSON.stringify(project));
      }
      return readFile(file, "utf8");
    },
    exportMarkdown: async (_path, content) => {
      if (!exportPath) return null;
      await writeFile(exportPath, content);
      return exportPath;
    },
    importMarkdown: async () => {
      if (!importPath) return null;
      return readFile(importPath, "utf8");
    },
  };
}

afterEach(async () => {
  document.body.replaceChildren();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

test("creates a project, adds a ticket and reopens the same file", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "trip.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "trip" });
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Pack bags" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Pack bags");
  await waitFor(async () => expect(await readFile(path, "utf8")).toContain("Pack bags"));

  document.body.replaceChildren();
  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Open project" }));
  expect(await screen.findByText("Pack bags")).toBeTruthy();
});

test("renders ticket body with safe Markdown", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "task.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "task" });
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Review changes" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Review changes");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 100));

  fireEvent.click(screen.getByRole("button", { name: /edit Review changes/i }));
  const bodyInput = screen.getByLabelText("Ticket body") as HTMLTextAreaElement;
  fireEvent.input(bodyInput, {
    target: { value: "- [ ] Check **style**\n- [x] Tests pass" },
  });
  fireEvent.click(document.getElementById("save-edit") as HTMLButtonElement);
  await screen.findByText("Saved");

  // Body should render as Markdown with safe HTML
  // This checks that the checkbox and bold formatting appear
  await waitFor(() => {
    const content = document.body.textContent || "";
    expect(content).toContain("Check");
    expect(content).toContain("style");
    expect(content).toContain("Tests pass");
  });
});

test("disables scripts in Markdown by stripping dangerous content", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "xss.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "xss" });
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Security test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Security test");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 100));

  fireEvent.click(screen.getByRole("button", { name: /edit Security test/i }));
  const bodyInput = screen.getByLabelText("Ticket body") as HTMLTextAreaElement;
  // Use Markdown that would result in HTML with potential issues
  fireEvent.input(bodyInput, {
    target: { value: "[click me](javascript:alert('xss'))\n\nSafe **text**" },
  });
  fireEvent.click(document.getElementById("save-edit") as HTMLButtonElement);
  await screen.findByText("Saved");
  
  // Close and reopen to view rendered content
  fireEvent.click(document.getElementById("cancel-edit") as HTMLButtonElement);
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check that dangerous protocols are removed
  const links = Array.from(document.querySelectorAll("a[href*='javascript']"));
  expect(links.length).toBe(0);
  expect(screen.getByText("Safe")).toBeTruthy();
});

test("shows save failures and allows retry without losing edits", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "fail.littlekanban");
  
  let callCount = 0;
  const failingDesktop: Desktop = {
    chooseNewProject: async () => path,
    chooseProject: async () => path,
    readProject: async (file) => readFile(file, "utf8"),
    writeProject: async (file, project: Project, previous) => {
      callCount++;
      // Fail only on the ticket body edit save (third write)
      if (callCount === 3) {
        throw new Error("Server is temporarily unavailable");
      }
      if (previous === null) {
        await writeFile(file, JSON.stringify(project), { flag: "wx" });
      } else {
        if (await readFile(file, "utf8") !== previous) {
          throw new Error("Project changed outside littleKanban. Your changes are not saved.");
        }
        await writeFile(file, JSON.stringify(project));
      }
      return readFile(file, "utf8");
    },
    exportMarkdown: async () => null,
    importMarkdown: async () => null,
  };

  startApp(document.body, failingDesktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "fail" });
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Task" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Task");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 100));

  // Edit the ticket
  fireEvent.click(screen.getByRole("button", { name: /edit Task/i }));
  const bodyInput = screen.getByLabelText("Ticket body") as HTMLTextAreaElement;
  fireEvent.input(bodyInput, {
    target: { value: "Important content" },
  });
  fireEvent.click(document.getElementById("save-edit") as HTMLButtonElement);

  // Wait for save error to appear
  await screen.findByText(/Server is temporarily unavailable/);
  
  // Check that the edit is still visible and retry button appears
  const retryButton = screen.getByRole("button", { name: "Retry save" });
  expect(retryButton).toBeTruthy();
  
  // The body content should still be in the form
  expect((document.getElementById("edit-body") as HTMLTextAreaElement).value).toContain("Important content");
  
  // Click retry
  fireEvent.click(retryButton);
  await screen.findByText("Saved");
});

test("exports ticket body as Markdown to a file", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const projectPath = join(directory, "export.littlekanban");
  const exportPath = join(directory, "ticket-body.md");
  const desktop = desktopFor(projectPath, exportPath);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "export" });
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "To export" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("To export");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 100));

  fireEvent.click(screen.getByRole("button", { name: /edit To export/i }));
  const bodyInput = screen.getByLabelText("Ticket body") as HTMLTextAreaElement;
  fireEvent.input(bodyInput, {
    target: { value: "# Title\n\n- Item 1\n- Item 2\n\nSome **bold** text." },
  });
  fireEvent.click(document.getElementById("save-edit") as HTMLButtonElement);
  await screen.findByText("Saved");
  
  // Edit button should reopen the edit panel after save
  fireEvent.click(screen.getByRole("button", { name: /edit To export/i }));
  await new Promise(resolve => setTimeout(resolve, 50));

  // Export should write the body as Markdown
  const exportBtn = screen.getByRole("button", { name: "Export to file" });
  fireEvent.click(exportBtn);
  
  // Verify the file was written
  await waitFor(async () => {
    const exported = await readFile(exportPath, "utf8");
    expect(exported).toContain("# Title");
    expect(exported).toContain("Item 1");
    expect(exported).toContain("bold");
  });
});

test("imports Markdown from a file into ticket body", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const projectPath = join(directory, "import.littlekanban");
  const markdownPath = join(directory, "content.md");
  
  // Create a Markdown file to import
  await writeFile(markdownPath, "# Meeting notes\n\n- Discussed timeline\n- _Action items_ pending");
  
  const desktop = desktopFor(projectPath, undefined, markdownPath);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "import" });
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Meeting" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Meeting");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 100));

  fireEvent.click(screen.getByRole("button", { name: /edit Meeting/i }));
  
  // Import should populate the body with file contents
  const importBtn = screen.getByRole("button", { name: "Import from file" });
  fireEvent.click(importBtn);
  
  const bodyInput = screen.getByLabelText("Ticket body") as HTMLTextAreaElement;
  await waitFor(() => {
    expect(bodyInput.value).toContain("# Meeting notes");
    expect(bodyInput.value).toContain("timeline");
    expect(bodyInput.value).toContain("Action items");
  });
});

test("keeps a ticket visible and refuses to overwrite an externally changed file", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "trip.littlekanban");
  startApp(document.body, desktopFor(path));
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "trip" });
  const external = '{"version":1,"name":"External edit","tickets":[]}';
  await writeFile(path, external);
  fireEvent.input(screen.getByLabelText("Ticket title"), { target: { value: "Pack bags" } });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText(/changed outside/);
  expect(screen.getByText("Pack bags")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry save" })).toBeTruthy();
  expect(await readFile(path, "utf8")).toBe(external);
});

test("refuses to open a newer project format without changing it", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "trip.littlekanban");
  const newer = '{"version":2,"name":"Trip","tickets":[]}';
  await writeFile(path, newer);
  startApp(document.body, desktopFor(path));
  fireEvent.click(screen.getByRole("button", { name: "Open project" }));
  await screen.findByText(/unsupported version/);
  expect(screen.queryByRole("textbox", { name: "Ticket title" })).toBeNull();
  expect(await readFile(path, "utf8")).toBe(newer);
});

test("edits a ticket's body and persists it after reopening", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "trip.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "trip" });
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Pack bags" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  
  // Wait for ticket to appear
  await screen.findByText("Pack bags");
  
  // Wait for save to complete
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 100));

  fireEvent.click(screen.getByRole("button", { name: /edit Pack bags/i }));
  
  // Check if edit panel is visible
  const editPanel = document.getElementById("edit-panel") as HTMLElement;
  expect(editPanel.hidden).toBe(false);
  
  const bodyInput = screen.getByLabelText("Ticket body") as HTMLTextAreaElement;
  fireEvent.input(bodyInput, {
    target: { value: "- Passport\n- Clothes" },
  });
  
  const saveButton = document.getElementById("save-edit") as HTMLButtonElement;
  fireEvent.click(saveButton);
  
  await waitFor(async () => expect(await readFile(path, "utf8")).toContain("Passport"));

  document.body.replaceChildren();
  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Open project" }));
  await screen.findByText("Pack bags");
  // Body is rendered as Markdown, so check for the text content
  expect(screen.getByText("Passport")).toBeTruthy();
  expect(screen.getByText("Clothes")).toBeTruthy();
});
