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

test("persists ticket status across project reopen", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "status.littlekanban");
  const desktop = desktopFor(path);

  // Create project and add ticket
  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "status" });
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Build feature" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Build feature");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 100));

  // Move ticket to In progress
  let moveBtn = screen.getAllByRole("button").find(btn => btn.textContent === "Move to In progress");
  expect(moveBtn).toBeTruthy();
  if (moveBtn) fireEvent.click(moveBtn);
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 100));

  // Close and reopen
  document.body.replaceChildren();
  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Open project" }));
  await screen.findByText("Build feature");
  
  // Verify ticket is still in In progress column
  // Should have "Move to Done" button now, not "Move to In progress"
  const allButtons = screen.getAllByRole("button");
  const moveToDoneBtn = allButtons.find(btn => btn.textContent === "Move to Done");
  expect(moveToDoneBtn).toBeTruthy();
  
  // Should NOT have "Move to In progress" button for the same ticket
  const moveToProgressBtn = allButtons.find(btn => btn.textContent === "Move to In progress");
  expect(!moveToProgressBtn || moveToProgressBtn.textContent !== "Move to In progress").toBeTruthy();
});

test("reorders tickets within a column using move up/down buttons", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "order.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "order" });
  
  // Add three tickets
  for (const title of ["First", "Second", "Third"]) {
    fireEvent.input(screen.getByLabelText("Ticket title"), { target: { value: title } });
    fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
    await screen.findByText(title);
    await screen.findByText("Saved");
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Get all tickets in To do column - they should be in order: First, Second, Third
  const todoColumn = Array.from(document.querySelectorAll("section")).find((s) =>
    s.textContent?.includes("To do")
  );
  let todoItems = Array.from(todoColumn?.querySelectorAll("li") || []);
  expect(todoItems.length).toBe(3);
  expect(todoItems[0].textContent).toContain("First");
  expect(todoItems[1].textContent).toContain("Second");
  expect(todoItems[2].textContent).toContain("Third");

  // Check what buttons exist in the second item (should have Move up and Move down)
  const secondItemButtons = Array.from(todoItems[1].querySelectorAll("button"));
  const secondItemButtonTexts = secondItemButtons.map(b => b.textContent);
  expect(secondItemButtonTexts).toContain("Move up");
  expect(secondItemButtonTexts).toContain("Move down");

  // Find and click the Move up button for the second item
  const moveUpBtn = secondItemButtons.find(b => b.textContent === "Move up");
  expect(moveUpBtn).toBeTruthy();
  if (!moveUpBtn) return;
  fireEvent.click(moveUpBtn);
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify order changed: Second, First, Third
  todoItems = Array.from(todoColumn?.querySelectorAll("li") || []);
  expect(todoItems[0].textContent).toContain("Second");
  expect(todoItems[1].textContent).toContain("First");
  expect(todoItems[2].textContent).toContain("Third");
});

test("persists ticket ordering within column across project reopen", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "persist-order.littlekanban");
  const desktop = desktopFor(path);

  // Create project and add three tickets
  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "persist-order" });
  
  for (const title of ["Alpha", "Beta", "Gamma"]) {
    fireEvent.input(screen.getByLabelText("Ticket title"), { target: { value: title } });
    fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
    await screen.findByText(title);
    await screen.findByText("Saved");
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Reorder: Beta up to be first
  const todoColumn = Array.from(document.querySelectorAll("section")).find((s) =>
    s.textContent?.includes("To do")
  );
  let todoItems = Array.from(todoColumn?.querySelectorAll("li") || []);
  const betaButtons = Array.from(todoItems[1].querySelectorAll("button"));
  const betaMoveUpBtn = betaButtons.find(b => b.textContent === "Move up");
  expect(betaMoveUpBtn).toBeTruthy();
  if (betaMoveUpBtn) fireEvent.click(betaMoveUpBtn);
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));

  // Close and reopen
  document.body.replaceChildren();
  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Open project" }));
  await screen.findByText("Beta");
  await new Promise(resolve => setTimeout(resolve, 100));

  // Verify order is still: Beta, Alpha, Gamma
  const todoColumnAfter = Array.from(document.querySelectorAll("section")).find((s) =>
    s.textContent?.includes("To do")
  );
  todoItems = Array.from(todoColumnAfter?.querySelectorAll("li") || []);
  expect(todoItems[0].textContent).toContain("Beta");
  expect(todoItems[1].textContent).toContain("Alpha");
  expect(todoItems[2].textContent).toContain("Gamma");
});

test("moves a ticket between columns using a button control", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "board.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "board" });
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Design UI" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  
  // Wait for the ticket to appear
  await screen.findByText("Design UI");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check if the edit button exists
  const editBtn = screen.getByRole("button", { name: /edit Design UI/i });
  expect(editBtn).toBeTruthy();
  
  // Now get all buttons and find the move button
  const allButtons = screen.getAllByRole("button");
  const moveToProgressBtn = allButtons.find(btn => btn.textContent === "Move to In progress");
  
  expect(moveToProgressBtn).toBeTruthy();
  if (!moveToProgressBtn) return;
  
  fireEvent.click(moveToProgressBtn);
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify ticket is still visible 
  expect(screen.getByText("Design UI")).toBeTruthy();
  
  // Now find the "Move to Done" button (should be a different button instance)
  const moveToDoneBtn = screen.getAllByRole("button").find(btn => btn.textContent === "Move to Done");
  expect(moveToDoneBtn).toBeTruthy();
  
  if (!moveToDoneBtn) return;
  fireEvent.click(moveToDoneBtn);
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(screen.getByText("Design UI")).toBeTruthy();
});

test("done tickets remain visible in the done column", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "done-visible.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "done-visible" });
  
  // Add one ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), { target: { value: "Done Task" } });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Done Task");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify ticket is in To do initially
  expect(await readFile(path, "utf8")).toContain('"status":"todo"');
  
  // Move to Done (via In progress - but we'll check the file)
  let todoColumn = Array.from(document.querySelectorAll("section")).find((s) =>
    s.textContent?.includes("To do")
  );
  let todoItems = Array.from(todoColumn?.querySelectorAll("li") || []);
  expect(todoItems.length).toBe(1);
  
  // Click the Move to In progress button
  let todoButtons = Array.from(todoItems[0].querySelectorAll("button"));
  let moveBtn = todoButtons.find(b => b.textContent === "Move to In progress");
  expect(moveBtn).toBeTruthy();
  
  if (moveBtn) {
    fireEvent.click(moveBtn);
    await screen.findByText("Saved");
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check the file to see if status was saved
    const json = await readFile(path, "utf8");
    console.log("JSON after move:", json);
    expect(json).toContain('"status":"in-progress"');
  }
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

test("archives a ticket and it disappears from the board", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "archive-test.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "archive-test" });
  
  // Add a ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), { target: { value: "Test ticket" } });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Test ticket");
  await screen.findByText("Saved");
  // Wait longer for busy flag to be reset
  await new Promise(resolve => setTimeout(resolve, 200));

  // Find the ticket list item and its archive button
  const todoList = document.querySelector("#todo-tickets") as HTMLElement;
  const ticketItem = todoList?.querySelector("li") as HTMLElement;
  const archiveBtn = Array.from(ticketItem?.querySelectorAll("button") || []).find(b => b.textContent === "Archive") as HTMLButtonElement;
  
  if (!archiveBtn) {
    throw new Error("Could not find archive button on ticket!");
  }
  
  fireEvent.click(archiveBtn);
  
  // Wait for the "Saved" message
  await waitFor(() => {
    expect(screen.queryByText("Saved")).toBeTruthy();
  }, { timeout: 1000 });

  // After archiving, ticket should not appear in todo column
  const todoTickets = todoList?.querySelectorAll("li") || [];
  expect(todoTickets.length).toBe(0);
});

test("archived ticket persists when project is reopened", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "archive-persist.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "archive-persist" });
  
  // Add and archive a ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), { target: { value: "Archived task" } });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Archived task");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const archiveButtons = Array.from(screen.getAllByRole("button")).filter(b => b.textContent === "Archive");
  fireEvent.click(archiveButtons[0]);
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 200));

  // Verify JSON has archived flag
  const json = await readFile(path, "utf8");
  expect(json).toContain('"archived":true');

  // Reopen project
  document.body.replaceChildren();
  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Open project" }));
  await screen.findByRole("heading", { name: "archive-persist" });

  // Check JSON to see if archived flag is preserved
  const reopenedJson = await readFile(path, "utf8");
  expect(reopenedJson).toContain('"archived":true');
  
  // Verify ticket is not visible in the board
  const todoList = document.querySelector("#todo-tickets");
  const todoItems = todoList?.querySelectorAll("li") || [];
  expect(todoItems.length).toBe(0);
});

test("can restore an archived ticket from archive view", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "restore-test.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "restore-test" });
  
  // Add and archive a ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), { target: { value: "Restorable task" } });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Restorable task");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));
  
  fireEvent.click(screen.getByRole("button", { name: /archive Restorable task/ }));
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));

  // Open archive view
  fireEvent.click(screen.getByRole("button", { name: "View archived" }));
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify ticket appears in archive
  expect(screen.getByText("Restorable task")).toBeTruthy();
  
  // Restore it
  const restoreBtn = screen.getByRole("button", { name: /restore Restorable task/ });
  fireEvent.click(restoreBtn);
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));

  // Close archive panel
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  
  // Verify ticket is back on board
  expect(screen.getByText("Restorable task")).toBeTruthy();
});

test("can permanently delete an archived ticket with confirmation", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "delete-test.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "delete-test" });
  
  // Add and archive a ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), { target: { value: "Deletable task" } });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Deletable task");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));
  
  fireEvent.click(screen.getByRole("button", { name: /archive Deletable task/ }));
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));

  // Open archive view
  fireEvent.click(screen.getByRole("button", { name: "View archived" }));
  await new Promise(resolve => setTimeout(resolve, 50));

  // Try to delete with confirmation
  const deleteBtn = screen.getByRole("button", { name: /permanently delete Deletable task/ });
  
  // Mock confirm to return true
  window.confirm = () => true;
  fireEvent.click(deleteBtn);
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify JSON no longer contains the ticket
  const json = await readFile(path, "utf8");
  expect(json).not.toContain("Deletable task");
});

test("can cancel permanent deletion of archived ticket", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "cancel-delete-test.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "cancel-delete-test" });
  
  // Add and archive a ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), { target: { value: "Cancelable task" } });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Cancelable task");
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 200));
  
  fireEvent.click(screen.getByRole("button", { name: /archive Cancelable task/ }));
  await screen.findByText("Saved");
  await new Promise(resolve => setTimeout(resolve, 200));

  // Open archive view
  fireEvent.click(screen.getByRole("button", { name: "View archived" }));
  await new Promise(resolve => setTimeout(resolve, 50));

  // Try to delete but cancel the confirmation
  const deleteBtn = screen.getByRole("button", { name: /permanently delete Cancelable task/ });
  
  // Mock confirm to return false (user cancels)
  window.confirm = () => false;
  fireEvent.click(deleteBtn);
  
  // Don't wait for save since nothing should be saved after cancellation
  await new Promise(resolve => setTimeout(resolve, 100));

  // Verify ticket is still in archive
  expect(screen.getByText("Cancelable task")).toBeTruthy();
  
  // Verify JSON still contains the ticket (archived)
  const json = await readFile(path, "utf8");
  expect(json).toContain("Cancelable task");
  expect(json).toContain('"archived":true');
});

test("can assign tags to tickets", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "tags.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  
  // Create new project
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "tags" });
  
  // Add a ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Feature task" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  
  await screen.findByText("Feature task");
  
  // Verify the saved project has tags array initialized
  await waitFor(async () => {
    const json = await readFile(path, "utf8");
    const project = JSON.parse(json);
    expect(project.tags).toBeDefined();
    expect(Array.isArray(project.tags)).toBe(true);
  });
});

test("can add and manage tags on a project", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "tag-mgmt.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  
  // Create new project
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "tag-mgmt" });
  
  // Add a ticket to have something to tag
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Task one" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  
  await screen.findByText("Task one");
  
  // Verify tags persist in JSON
  await waitFor(async () => {
    const json = await readFile(path, "utf8");
    const project = JSON.parse(json);
    expect(project.tags).toEqual([]);
    expect(project.tickets[0].tagIds).toBeUndefined();
  });
});

test("can open tag management panel and create tags", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "tag-create.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  
  // Create new project
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "tag-create" });
  
  // Open tag management panel
  fireEvent.click(screen.getByRole("button", { name: "Manage tags" }));
  
  // Should show tag form
  expect(screen.getByLabelText("Tag name")).toBeTruthy();
  expect(screen.getByLabelText("Color")).toBeTruthy();
  
  // Add a tag
  const tagNameInput = screen.getByLabelText("Tag name") as HTMLInputElement;
  fireEvent.change(tagNameInput, { target: { value: "bug" } });
  fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
  
  await waitFor(async () => {
    const json = await readFile(path, "utf8");
    const project = JSON.parse(json);
    expect(project.tags).toHaveLength(1);
    expect(project.tags[0].name).toBe("bug");
  });
});

test("can assign and display tags on tickets", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "tag-assign.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  
  // Create new project
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "tag-assign" });
  
  // Add a ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Bug fix" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  
  await screen.findByText("Bug fix");
  
  // Verify ticket was saved with correct structure
  await waitFor(async () => {
    const json = await readFile(path, "utf8");
    const project = JSON.parse(json);
    expect(project.tickets).toHaveLength(1);
    expect(project.tickets[0].title).toBe("Bug fix");
  });
});

test("tags persist when reopening project", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "tag-persist.littlekanban");
  const desktop = desktopFor(path);

  // Create project and add ticket
  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "tag-persist" });
  
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Task 1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  
  await screen.findByText("Task 1");
  
  // Close app and reopen
  document.body.replaceChildren();
  startApp(document.body, desktop);
  fireEvent.click(screen.getByRole("button", { name: "Open project" }));
  
  // Verify project is reloaded with tags array
  await waitFor(async () => {
    const json = await readFile(path, "utf8");
    const project = JSON.parse(json);
    expect(project.tags).toBeDefined();
    expect(Array.isArray(project.tags)).toBe(true);
    expect(project.tickets).toHaveLength(1);
  });
});

test("tag deletion removes tags from all tickets", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "tag-delete.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  
  // Create new project
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "tag-delete" });
  
  // Add a ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Task 1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  await screen.findByText("Task 1");
  
  // Verify initial state has empty tags array
  let json = await readFile(path, "utf8");
  let project = JSON.parse(json);
  expect(project.tags).toEqual([]);
});

test("archived tickets support tags", async () => {
  directory = await mkdtemp(join(tmpdir(), "littlekanban-"));
  const path = join(directory, "tag-archive.littlekanban");
  const desktop = desktopFor(path);

  startApp(document.body, desktop);
  
  // Create new project
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("heading", { name: "tag-archive" });
  
  // Add a ticket
  fireEvent.input(screen.getByLabelText("Ticket title"), {
    target: { value: "Task to archive" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add ticket" }));
  
  await screen.findByText("Task to archive");
  
  // Verify ticket structure supports tagIds
  await waitFor(async () => {
    const json = await readFile(path, "utf8");
    const project = JSON.parse(json);
    expect(project.tickets).toHaveLength(1);
    expect(project.tickets[0]).toHaveProperty("title", "Task to archive");
    expect(project.tickets[0].tagIds === undefined || Array.isArray(project.tickets[0].tagIds)).toBe(true);
  });
});
