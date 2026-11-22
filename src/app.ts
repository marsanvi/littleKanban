import { renderMarkdown } from "./markdown";

export interface Project {
  version: 1;
  name: string;
  tickets: { id: string; title: string; body?: string; status: "todo" | "in-progress" | "done"; order: number; archived?: boolean }[];
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
      ["todo", "in-progress", "done"].includes((ticket as Record<string, unknown>).status as string) &&
      typeof (ticket as Record<string, unknown>).order === "number" &&
      ((ticket as Record<string, unknown>).body === undefined || typeof (ticket as Record<string, unknown>).body === "string") &&
      ((ticket as Record<string, unknown>).archived === undefined || typeof (ticket as Record<string, unknown>).archived === "boolean"));
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
          <section><h3>To do</h3><ul id="todo-tickets"></ul></section>
          <section><h3>In progress</h3><ul id="in-progress-tickets"></ul></section>
          <section><h3>Done</h3><ul id="done-tickets"></ul></section>
        </div>
        <button type="button" id="view-archive">View archived</button>
        <div id="archive-panel" hidden>
          <h3>Archived Tickets</h3>
          <ul id="archived-tickets"></ul>
          <button type="button" id="close-archive">Close</button>
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
  const viewArchiveBtn = element<HTMLButtonElement>("#view-archive");
  const archivePanel = element("#archive-panel");
  const closeArchiveBtn = element<HTMLButtonElement>("#close-archive");
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));

  function showError(error: unknown): void {
    message.textContent = error instanceof Error ? error.message : String(error);
  }

  function createButton(text: string, ariaLabel: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.setAttribute("aria-label", ariaLabel);
    btn.addEventListener("click", onClick);
    return btn;
  }

  function render(): void {
    if (!root.isConnected) return; // DOM has been disconnected
    board.hidden = project === null;
    buttons.forEach((button) => { button.disabled = busy; });
    retry.hidden = !dirty;
    editPanel.hidden = editingTicketId === null;
    if (!project) return;
    element("#name").textContent = project.name;
    element("#path").textContent = path;
    
    // Render tickets grouped by status
    const statuses: Array<"todo" | "in-progress" | "done"> = ["todo", "in-progress", "done"];
    const columnIds = ["todo-tickets", "in-progress-tickets", "done-tickets"];
    
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      const columnId = columnIds[i];
      const list = element(`#${columnId}`);
      const ticketsInColumn = project.tickets.filter((t) => t.status === status && !t.archived).sort((a, b) => a.order - b.order);
      
      list.replaceChildren(...ticketsInColumn.map((ticket, indexInColumn) => {
        const item = document.createElement("li");
        const titleSpan = document.createElement("span");
        titleSpan.textContent = ticket.title;
        item.appendChild(titleSpan);
        
        if (ticket.body) {
          const bodyDiv = document.createElement("div");
          bodyDiv.innerHTML = renderMarkdown(ticket.body);
          item.appendChild(bodyDiv);
        }
        
        item.appendChild(createButton(`Edit`, `edit ${ticket.title}`, () => openEditPanel(ticket)));
        
        // Add move buttons for status transitions
        if (status === "todo") {
          item.appendChild(createButton("Move to In progress", `move ${ticket.title} to In progress`, () => void moveTicket(ticket.id, "in-progress")));
        } else if (status === "in-progress") {
          item.appendChild(createButton("Move to Done", `move ${ticket.title} to Done`, () => void moveTicket(ticket.id, "done")));
          item.appendChild(createButton("Move to To do", `move ${ticket.title} to To do`, () => void moveTicket(ticket.id, "todo")));
        } else if (status === "done") {
          item.appendChild(createButton("Move to In progress", `move ${ticket.title} to In progress`, () => void moveTicket(ticket.id, "in-progress")));
        }

        // Add move up/down buttons for ordering within column
        if (indexInColumn > 0) {
          item.appendChild(createButton("Move up", `move ${ticket.title} up`, () => void moveUp(ticket.id, status)));
        }
        
        if (indexInColumn < ticketsInColumn.length - 1) {
          item.appendChild(createButton("Move down", `move ${ticket.title} down`, () => void moveDown(ticket.id, status)));
        }
        
        // Add archive button
        item.appendChild(createButton("Archive", `archive ${ticket.title}`, () => void archiveTicket(ticket.id)));
        
        return item;
      }));
    }
    
    // Render archived tickets
    const archivedList = element("#archived-tickets");
    const archivedTickets = project.tickets.filter((t) => t.archived);
    archivedList.replaceChildren(...archivedTickets.map((ticket) => {
      const item = document.createElement("li");
      const titleSpan = document.createElement("span");
      titleSpan.textContent = ticket.title;
      item.appendChild(titleSpan);
      
      item.appendChild(createButton("Restore", `restore ${ticket.title}`, () => void restoreTicket(ticket.id)));
      item.appendChild(createButton("Delete", `permanently delete ${ticket.title}`, () => void deleteTicket(ticket.id)));
      
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

  async function moveTicket(ticketId: string, newStatus: "todo" | "in-progress" | "done"): Promise<void> {
    if (!project || busy) return;
    const ticket = project.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    ticket.status = newStatus;
    // Set order to the end of the new status column
    const ticketsInNewStatus = project.tickets.filter((t) => t.status === newStatus && t.id !== ticketId);
    ticket.order = ticketsInNewStatus.length;
    dirty = true;
    render();
    await save();
  }

  async function moveUp(ticketId: string, status: "todo" | "in-progress" | "done"): Promise<void> {
    if (!project || busy) return;
    const ticketsInStatus = project.tickets.filter((t) => t.status === status).sort((a, b) => a.order - b.order);
    const index = ticketsInStatus.findIndex((t) => t.id === ticketId);
    if (index <= 0) return; // Can't move first ticket up
    const ticket = ticketsInStatus[index];
    const prevTicket = ticketsInStatus[index - 1];
    [ticket.order, prevTicket.order] = [prevTicket.order, ticket.order];
    dirty = true;
    render();
    await save();
  }

  async function moveDown(ticketId: string, status: "todo" | "in-progress" | "done"): Promise<void> {
    if (!project || busy) return;
    const ticketsInStatus = project.tickets.filter((t) => t.status === status).sort((a, b) => a.order - b.order);
    const index = ticketsInStatus.findIndex((t) => t.id === ticketId);
    if (index >= ticketsInStatus.length - 1) return; // Can't move last ticket down
    const ticket = ticketsInStatus[index];
    const nextTicket = ticketsInStatus[index + 1];
    [ticket.order, nextTicket.order] = [nextTicket.order, ticket.order];
    dirty = true;
    render();
    await save();
  }

  async function updateAndSaveTicket(ticketId: string, title: string, body: string): Promise<void> {
    if (!project) return;
    const ticket = project.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    ticket.title = title;
    ticket.body = body;
    dirty = true;
    closeEditPanel();
    render();
    await save();
  }

  async function archiveTicket(ticketId: string): Promise<void> {
    if (!project || busy) return;
    const ticket = project.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    ticket.archived = true;
    dirty = true;
    render();
    await save();
  }

  async function restoreTicket(ticketId: string): Promise<void> {
    if (!project || busy) return;
    const ticket = project.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    ticket.archived = false;
    dirty = true;
    render();
    await save();
  }

  async function deleteTicket(ticketId: string): Promise<void> {
    if (!project || busy) return;
    if (!confirm("Permanently delete this ticket? This cannot be undone.")) return;
    project.tickets = project.tickets.filter((t) => t.id !== ticketId);
    dirty = true;
    render();
    await save();
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
    const todoTickets = project.tickets.filter((t) => t.status === "todo");
    project.tickets.push({ id: crypto.randomUUID(), title: value, body: "", status: "todo", order: todoTickets.length });
    title.value = "";
    dirty = true;
    render();
    void save();
  });
  
  saveEditBtn.addEventListener("click", () => {
    if (!project || busy || !editingTicketId) return;
    void updateAndSaveTicket(editingTicketId, editTitle.value.trim(), editBody.value);
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
  
  viewArchiveBtn.addEventListener("click", () => {
    archivePanel.hidden = false;
  });
  
  closeArchiveBtn.addEventListener("click", () => {
    archivePanel.hidden = true;
  });
  
  retry.addEventListener("click", () => void save());
  render();
  return { hasUnsavedChanges: () => dirty || busy };
}
