import { renderMarkdown } from "./markdown";

export interface Project {
  version: 1;
  name: string;
  tickets: { id: string; title: string; body?: string; status: "todo" }[];
}

export interface Desktop {
  chooseNewProject(): Promise<string | null>;
  chooseProject(): Promise<string | null>;
  readProject(path: string): Promise<string>;
  writeProject(path: string, project: Project, previous: string | null): Promise<string>;
  exportMarkdown(path: string | null, content: string): Promise<string | null>;
  importMarkdown(): Promise<string | null>;
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Record<string, unknown>;
  return project.version === 1 && typeof project.name === "string" &&
    Array.isArray(project.tickets) && project.tickets.every((ticket: unknown) =>
      !!ticket && typeof ticket === "object" &&
      typeof (ticket as Record<string, unknown>).id === "string" &&
      typeof (ticket as Record<string, unknown>).title === "string" &&
      (ticket as Record<string, unknown>).status === "todo" &&
      ((ticket as Record<string, unknown>).body === undefined || typeof (ticket as Record<string, unknown>).body === "string"));
}

export function startApp(root: HTMLElement, desktop: Desktop): { hasUnsavedChanges(): boolean } {
  let project: Project | null = null;
  let path = "";
  let previous = "";
  let dirty = false;
  let busy = false;
  let editingTicketId: string | null = null;

  root.innerHTML = `
    <main>
      <header><h1>littleKanban</h1></header>
      <p class="warning">Shared editing is not safe yet. Simultaneous changes can be lost; keep a separate backup.</p>
      <nav aria-label="Project">
        <button type="button" id="create">Create project</button>
        <button type="button" id="open">Open project</button>
      </nav>
      <p id="message" role="status" aria-live="polite"></p>
      <section id="board" hidden>
        <h2 id="name"></h2>
        <p id="path"></p>
        <form id="ticket-form">
          <label for="title">Ticket title</label>
          <input id="title" required maxlength="500" autocomplete="off">
          <button type="submit">Add ticket</button>
        </form>
        <button type="button" id="retry" hidden>Retry save</button>
        <div id="edit-panel" hidden>
          <h3>Edit Ticket</h3>
          <label for="edit-title">Title</label>
          <input id="edit-title" required maxlength="500" autocomplete="off">
          <label for="edit-body">Ticket body</label>
          <textarea id="edit-body" placeholder="Markdown-formatted content..."></textarea>
          <button type="button" id="save-edit">Save</button>
          <button type="button" id="export-edit">Export to file</button>
          <button type="button" id="import-edit">Import from file</button>
          <button type="button" id="cancel-edit">Cancel</button>
        </div>
        <div class="columns">
          <section><h3>To do</h3><ul id="tickets"></ul></section>
          <section><h3>In progress</h3></section>
          <section><h3>Done</h3></section>
        </div>
      </section>
    </main>`;

  const element = <T extends HTMLElement>(selector: string) => {
    const result = root.querySelector<T>(selector);
    if (!result) throw new Error(`Missing element ${selector}`);
    return result;
  };
  const message = element("#message");
  const board = element("#board");
  const title = element<HTMLInputElement>("#title");
  const retry = element<HTMLButtonElement>("#retry");
  const editPanel = element("#edit-panel");
  const editTitle = element<HTMLInputElement>("#edit-title");
  const editBody = element<HTMLTextAreaElement>("#edit-body");
  const saveEditBtn = element<HTMLButtonElement>("#save-edit");
  const exportEditBtn = element<HTMLButtonElement>("#export-edit");
  const importEditBtn = element<HTMLButtonElement>("#import-edit");
  const cancelEditBtn = element<HTMLButtonElement>("#cancel-edit");
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));

  function showError(error: unknown): void {
    message.textContent = error instanceof Error ? error.message : String(error);
  }

  function render(): void {
    board.hidden = project === null;
    buttons.forEach((button) => { button.disabled = busy; });
    retry.hidden = !dirty;
    editPanel.hidden = editingTicketId === null;
    if (!project) return;
    element("#name").textContent = project.name;
    element("#path").textContent = path;
    const list = element("#tickets");
    list.replaceChildren(...project.tickets.map((ticket) => {
      const item = document.createElement("li");
      const titleSpan = document.createElement("span");
      titleSpan.textContent = ticket.title;
      item.appendChild(titleSpan);
      
      if (ticket.body) {
        const bodyDiv = document.createElement("div");
        bodyDiv.innerHTML = renderMarkdown(ticket.body);
        item.appendChild(bodyDiv);
      }
      
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.setAttribute("aria-label", `edit ${ticket.title}`);
      editBtn.addEventListener("click", () => openEditPanel(ticket));
      item.appendChild(editBtn);
      
      return item;
    }));
  }

  function openEditPanel(ticket: { id: string; title: string; body?: string }): void {
    editingTicketId = ticket.id;
    editTitle.value = ticket.title;
    editBody.value = ticket.body || "";
    editPanel.hidden = false;
  }

  function closeEditPanel(): void {
    editingTicketId = null;
    editPanel.hidden = true;
  }

  async function save(): Promise<void> {
    if (!project || busy) return;
    busy = true;
    render();
    try {
      previous = await desktop.writeProject(path, project, previous);
      dirty = false;
      message.textContent = "Saved";
    } catch (error) {
      dirty = true;
      showError(error);
    } finally {
      busy = false;
      render();
    }
  }

  async function select(create: boolean): Promise<void> {
    if (busy) return;
    if (dirty) {
      message.textContent = "Save your changes before opening another project.";
      return;
    }
    busy = true;
    render();
    try {
      const selected = await (create ? desktop.chooseNewProject() : desktop.chooseProject());
      if (!selected) return;
      if (create) {
        const name = selected.split(/[\\/]/).pop()?.replace(/\.littlekanban$/i, "") || "Project";
        const next: Project = { version: 1, name, tickets: [] };
        previous = await desktop.writeProject(selected, next, null);
        project = next;
      } else {
        const content = await desktop.readProject(selected);
        const next: unknown = JSON.parse(content);
        if (!isProject(next)) throw new Error("This project file is invalid or uses an unsupported version.");
        project = next;
        previous = content;
      }
      path = selected;
      message.textContent = "Saved";
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      render();
    }
  }

  element("#create").addEventListener("click", () => void select(true));
  element("#open").addEventListener("click", () => void select(false));
  element<HTMLFormElement>("#ticket-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = title.value.trim();
    if (!project || busy || !value) return;
    project.tickets.push({ id: crypto.randomUUID(), title: value, body: "", status: "todo" });
    title.value = "";
    dirty = true;
    render();
    void save();
  });
  
  saveEditBtn.addEventListener("click", () => {
    if (!project || busy || !editingTicketId) return;
    const ticket = project.tickets.find((t) => t.id === editingTicketId);
    if (!ticket) return;
    ticket.title = editTitle.value.trim();
    ticket.body = editBody.value;
    dirty = true;
    closeEditPanel();
    render();
    void save();
  });
  
  cancelEditBtn.addEventListener("click", () => {
    closeEditPanel();
  });
  
  exportEditBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    render();
    try {
      await desktop.exportMarkdown(null, editBody.value);
      message.textContent = "Exported";
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      render();
    }
  });
  
  importEditBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    render();
    try {
      const content = await desktop.importMarkdown();
      if (content !== null) {
        editBody.value = content;
        message.textContent = "Imported";
      }
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      render();
    }
  });
  
  retry.addEventListener("click", () => void save());
  render();
  return { hasUnsavedChanges: () => dirty || busy };
}
