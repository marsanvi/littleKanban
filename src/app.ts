import { renderMarkdown } from "./markdown";

export interface Project {
  version: 1;
  name: string;
  tags: { id: string; name: string; color?: string }[];
  members: { id: string; name: string }[];
  tickets: { id: string; title: string; body?: string; status: "todo" | "in-progress" | "done"; order: number; archived?: boolean; tagIds?: string[]; memberId?: string }[];
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
    Array.isArray(project.tags) && (project.tags as unknown[]).every((tag: unknown) =>
      !!tag && typeof tag === "object" &&
      typeof (tag as Record<string, unknown>).id === "string" &&
      typeof (tag as Record<string, unknown>).name === "string" &&
      ((tag as Record<string, unknown>).color === undefined || typeof (tag as Record<string, unknown>).color === "string")) &&
    Array.isArray(project.members) && (project.members as unknown[]).every((member: unknown) =>
      !!member && typeof member === "object" &&
      typeof (member as Record<string, unknown>).id === "string" &&
      typeof (member as Record<string, unknown>).name === "string") &&
    Array.isArray(project.tickets) && (project.tickets as unknown[]).every((ticket: unknown) =>
      !!ticket && typeof ticket === "object" &&
      typeof (ticket as Record<string, unknown>).id === "string" &&
      typeof (ticket as Record<string, unknown>).title === "string" &&
      ["todo", "in-progress", "done"].includes((ticket as Record<string, unknown>).status as string) &&
      typeof (ticket as Record<string, unknown>).order === "number" &&
      ((ticket as Record<string, unknown>).body === undefined || typeof (ticket as Record<string, unknown>).body === "string") &&
      ((ticket as Record<string, unknown>).archived === undefined || typeof (ticket as Record<string, unknown>).archived === "boolean") &&
      ((ticket as Record<string, unknown>).tagIds === undefined || (Array.isArray((ticket as Record<string, unknown>).tagIds) && ((ticket as Record<string, unknown>).tagIds as unknown[]).every((id: unknown) => typeof id === "string"))) &&
      ((ticket as Record<string, unknown>).memberId === undefined || typeof (ticket as Record<string, unknown>).memberId === "string"));
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
        <button type="button" id="manage-tags">Manage tags</button>
        <button type="button" id="manage-members">Manage members</button>
        <div id="tags-panel" hidden>
          <h3>Project Tags</h3>
          <form id="add-tag-form">
            <label for="tag-name">Tag name</label>
            <input id="tag-name" required maxlength="100" autocomplete="off">
            <label for="tag-color">Color</label>
            <input id="tag-color" type="color" value="#3b82f6">
            <button type="submit">Add tag</button>
          </form>
          <ul id="tags-list"></ul>
          <button type="button" id="close-tags">Close</button>
        </div>
        <div id="members-panel" hidden>
          <h3>Project Members</h3>
          <form id="add-member-form">
            <label for="member-name">Member name</label>
            <input id="member-name" required maxlength="100" autocomplete="off">
            <button type="submit">Add member</button>
          </form>
          <ul id="members-list"></ul>
          <button type="button" id="close-members">Close</button>
        </div>
        <div id="rename-member-panel" hidden>
          <h3>Rename Member</h3>
          <input id="rename-member-input" required maxlength="100" autocomplete="off">
          <button type="button" id="save-rename">Save rename</button>
          <button type="button" id="cancel-rename">Cancel</button>
        </div>
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
        <div id="assign-member-panel" hidden>
          <h3>Assign Member</h3>
          <ul id="assign-member-list"></ul>
          <button type="button" id="cancel-assign">Cancel</button>
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
  const manageTags = element<HTMLButtonElement>("#manage-tags");
  const tagsPanel = element("#tags-panel");
  const addTagForm = element<HTMLFormElement>("#add-tag-form");
  const tagNameInput = element<HTMLInputElement>("#tag-name");
  const tagColorInput = element<HTMLInputElement>("#tag-color");
  const tagsList = element<HTMLUListElement>("#tags-list");
  const closeTagsBtn = element<HTMLButtonElement>("#close-tags");
  const manageMembers = element<HTMLButtonElement>("#manage-members");
  const membersPanel = element("#members-panel");
  const addMemberForm = element<HTMLFormElement>("#add-member-form");
  const memberNameInput = element<HTMLInputElement>("#member-name");
  const membersList = element<HTMLUListElement>("#members-list");
  const closeMembersBtn = element<HTMLButtonElement>("#close-members");
  const renameMemberPanel = element("#rename-member-panel");
  const renameMemberInput = element<HTMLInputElement>("#rename-member-input");
  const saveRenameBtn = element<HTMLButtonElement>("#save-rename");
  const cancelRenameBtn = element<HTMLButtonElement>("#cancel-rename");
  const assignMemberPanel = element("#assign-member-panel");
  const assignMemberList = element<HTMLUListElement>("#assign-member-list");
  const cancelAssignBtn = element<HTMLButtonElement>("#cancel-assign");
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

  let renamingMemberId: string | null = null;
  let assigningTicketId: string | null = null;

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
    try {
      if (!root.isConnected) return; // DOM has been disconnected
      board.hidden = project === null;
      buttons.forEach((button) => { 
        if (button.type !== "submit") button.disabled = busy;
      });
      retry.hidden = !dirty;
      editPanel.hidden = editingTicketId === null;
      renameMemberPanel.hidden = renamingMemberId === null;
      assignMemberPanel.hidden = assigningTicketId === null;
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
        
        // Display assigned tags
        if (ticket.tagIds && ticket.tagIds.length > 0 && project) {
          const tagsDiv = document.createElement("div");
          tagsDiv.style.marginTop = "0.5em";
          tagsDiv.style.display = "flex";
          tagsDiv.style.gap = "0.5em";
          tagsDiv.style.flexWrap = "wrap";
          
          ticket.tagIds.forEach((tagId) => {
            const tag = project!.tags.find((t) => t.id === tagId);
            if (tag) {
              const tagSpan = document.createElement("span");
              tagSpan.textContent = tag.name;
              tagSpan.style.padding = "0.25em 0.5em";
              tagSpan.style.borderRadius = "0.25em";
              tagSpan.style.fontSize = "0.9em";
              if (tag.color) {
                tagSpan.style.backgroundColor = tag.color;
                tagSpan.style.color = "white";
              } else {
                tagSpan.style.backgroundColor = "#e5e7eb";
                tagSpan.style.color = "#1f2937";
              }
              tagsDiv.appendChild(tagSpan);
            }
          });
          
          item.appendChild(tagsDiv);
        }

        // Display assigned member
        if (ticket.memberId && project) {
          const member = project.members.find((m) => m.id === ticket.memberId);
          if (member) {
            const memberSpan = document.createElement("span");
            memberSpan.textContent = member.name;
            memberSpan.style.padding = "0.25em 0.5em";
            memberSpan.style.borderRadius = "0.25em";
            memberSpan.style.fontSize = "0.9em";
            memberSpan.style.backgroundColor = "#e0e7ff";
            memberSpan.style.color = "#3730a3";
            memberSpan.style.marginTop = "0.5em";
            memberSpan.style.display = "block";
            item.appendChild(memberSpan);
          }
        }
        
        item.appendChild(createButton(`Edit`, `edit ${ticket.title}`, () => openEditPanel(ticket)));
        
        // Add tag management button
        if (project && project.tags.length > 0) {
          item.appendChild(createButton("Manage tags", `manage tags for ${ticket.title}`, () => {
            const unassignedTags = project!.tags.filter((tag) => !ticket.tagIds?.includes(tag.id));
            if (unassignedTags.length > 0) {
              const tagName = prompt(
                `Add tag to "${ticket.title}":\n${unassignedTags.map((t) => t.name).join(", ")}`
              );
              if (tagName) {
                const tag = project!.tags.find((t) => t.name === tagName.trim());
                if (tag) {
                  void addTagToTicket(ticket.id, tag.id);
                }
              }
            } else if (ticket.tagIds && ticket.tagIds.length > 0) {
              const removeTagName = prompt(
                `Remove tag from "${ticket.title}":\n${ticket.tagIds
                  .map((id) => project!.tags.find((t) => t.id === id)?.name)
                  .filter(Boolean)
                  .join(", ")}`
              );
              if (removeTagName) {
                const tag = project!.tags.find((t) => t.name === removeTagName.trim());
                if (tag) {
                  void removeTagFromTicket(ticket.id, tag.id);
                }
              }
            }
          }));
        }

        // Add member assignment button
        if (project && project.members.length > 0) {
          if (ticket.memberId) {
            item.appendChild(createButton("Unassign", `unassign member from ${ticket.title}`, () => void unassignMember(ticket.id)));
          } else {
            item.appendChild(createButton("Assign member", `assign member to ${ticket.title}`, () => openAssignMemberPanel(ticket.id)));
          }
        }
        
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
      
      // Display assigned tags on archived tickets too
      if (ticket.tagIds && ticket.tagIds.length > 0 && project) {
        const tagsDiv = document.createElement("div");
        tagsDiv.style.marginTop = "0.5em";
        tagsDiv.style.display = "flex";
        tagsDiv.style.gap = "0.5em";
        tagsDiv.style.flexWrap = "wrap";
        
        ticket.tagIds.forEach((tagId) => {
          const tag = project!.tags.find((t) => t.id === tagId);
          if (tag) {
            const tagSpan = document.createElement("span");
            tagSpan.textContent = tag.name;
            tagSpan.style.padding = "0.25em 0.5em";
            tagSpan.style.borderRadius = "0.25em";
            tagSpan.style.fontSize = "0.9em";
            if (tag.color) {
              tagSpan.style.backgroundColor = tag.color;
              tagSpan.style.color = "white";
            } else {
              tagSpan.style.backgroundColor = "#e5e7eb";
              tagSpan.style.color = "#1f2937";
            }
            tagsDiv.appendChild(tagSpan);
          }
        });
        
        item.appendChild(tagsDiv);
      }

      // Display assigned member on archived tickets too
      if (ticket.memberId && project) {
        const member = project.members.find((m) => m.id === ticket.memberId);
        if (member) {
          const memberSpan = document.createElement("span");
          memberSpan.textContent = member.name;
          memberSpan.style.padding = "0.25em 0.5em";
          memberSpan.style.borderRadius = "0.25em";
          memberSpan.style.fontSize = "0.9em";
          memberSpan.style.backgroundColor = "#e0e7ff";
          memberSpan.style.color = "#3730a3";
          memberSpan.style.marginTop = "0.5em";
          memberSpan.style.display = "block";
          item.appendChild(memberSpan);
        }
      }
      
      item.appendChild(createButton("Restore", `restore ${ticket.title}`, () => void restoreTicket(ticket.id)));
      item.appendChild(createButton("Delete", `permanently delete ${ticket.title}`, () => void deleteTicket(ticket.id)));
      
      return item;
    }));
    } catch (e) {
      // Ignore errors from rendering if DOM is disconnected
      if (!(e instanceof Error) || !e.message.includes("Missing element")) throw e;
    }
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

  function openAssignMemberPanel(ticketId: string): void {
    assigningTicketId = ticketId;
    assignMemberPanel.hidden = false;
    if (!project) return;
    assignMemberList.replaceChildren(...project.members.map((member) => {
      const item = document.createElement("li");
      item.appendChild(createButton(member.name, `assign ${member.name}`, () => {
        void assignMember(ticketId, member.id);
      }));
      return item;
    }));
    render();
  }

  function closeAssignMemberPanel(): void {
    assigningTicketId = null;
    assignMemberPanel.hidden = true;
  }

  function renderMembersList(): void {
    if (!project) return;
    membersList.replaceChildren(...project.members.map((member) => {
      const item = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = member.name;
      item.appendChild(span);
      
      item.appendChild(createButton("Rename", `rename ${member.name}`, () => {
        renamingMemberId = member.id;
        renameMemberInput.value = member.name;
        renameMemberPanel.hidden = false;
      }));
      
      item.appendChild(createButton("Delete", `delete ${member.name}`, () => {
        void deleteMember(member.id).then(() => renderMembersList());
      }));
      
      return item;
    }));
  }

  function renderTagsList(): void {
    if (!project) return;
    tagsList.replaceChildren(...project.tags.map((tag) => {
      const item = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = tag.name;
      if (tag.color) {
        span.style.color = tag.color;
        span.style.fontWeight = "bold";
      }
      item.appendChild(span);
      
      item.appendChild(createButton("Rename", `rename ${tag.name}`, () => {
        const newName = prompt("New tag name:", tag.name);
        if (newName && newName.trim()) {
          void renameTag(tag.id, newName.trim());
        }
      }));
      
      item.appendChild(createButton("Change color", `change color of ${tag.name}`, () => {
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = tag.color || "#3b82f6";
        const container = document.createElement("div");
        container.style.padding = "1em";
        container.style.border = "1px solid #ccc";
        container.style.borderRadius = "0.25em";
        const label = document.createElement("label");
        label.textContent = "Select new color: ";
        label.style.marginRight = "0.5em";
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.textContent = "Apply";
        confirmBtn.style.marginLeft = "0.5em";
        confirmBtn.onclick = () => {
          void changeTagColor(tag.id, colorInput.value);
          container.remove();
        };
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.marginLeft = "0.25em";
        cancelBtn.onclick = () => container.remove();
        container.appendChild(label);
        container.appendChild(colorInput);
        container.appendChild(confirmBtn);
        container.appendChild(cancelBtn);
        item.parentNode?.insertBefore(container, item.nextSibling);
      }));
      
      item.appendChild(createButton("Delete", `delete ${tag.name}`, () => void deleteTag(tag.id)));
      
      return item;
    }));
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

  async function addTag(name: string, color?: string): Promise<string> {
    if (!project || busy) return "";
    const tagId = crypto.randomUUID();
    project.tags.push({ id: tagId, name, color });
    dirty = true;
    render();
    await save();
    return tagId;
  }

  async function renameTag(tagId: string, newName: string): Promise<void> {
    if (!project || busy) return;
    const tag = project.tags.find((t) => t.id === tagId);
    if (!tag) return;
    tag.name = newName;
    dirty = true;
    render();
    await save();
  }

  async function changeTagColor(tagId: string, newColor: string): Promise<void> {
    if (!project || busy) return;
    const tag = project.tags.find((t) => t.id === tagId);
    if (!tag) return;
    tag.color = newColor;
    dirty = true;
    render();
    await save();
  }

  async function deleteTag(tagId: string): Promise<void> {
    if (!project || busy) return;
    if (!confirm("Delete this tag? It will be removed from all tickets.")) return;
    project.tags = project.tags.filter((t) => t.id !== tagId);
    // Remove tag from all tickets
    project.tickets.forEach((ticket) => {
      if (ticket.tagIds) {
        ticket.tagIds = ticket.tagIds.filter((id) => id !== tagId);
      }
    });
    dirty = true;
    render();
    await save();
  }

  async function addTagToTicket(ticketId: string, tagId: string): Promise<void> {
    if (!project || busy) return;
    const ticket = project.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    if (!ticket.tagIds) {
      ticket.tagIds = [];
    }
    if (!ticket.tagIds.includes(tagId)) {
      ticket.tagIds.push(tagId);
      dirty = true;
      render();
      await save();
    }
  }

  async function removeTagFromTicket(ticketId: string, tagId: string): Promise<void> {
    if (!project || busy) return;
    const ticket = project.tickets.find((t) => t.id === ticketId);
    if (!ticket || !ticket.tagIds) return;
    ticket.tagIds = ticket.tagIds.filter((id) => id !== tagId);
    dirty = true;
    render();
    await save();
  }

  async function addMember(name: string): Promise<string> {
    if (!project || busy) return "";
    const memberId = crypto.randomUUID();
    project.members.push({ id: memberId, name });
    dirty = true;
    render();
    await save();
    return memberId;
  }

  async function renameMember(memberId: string, newName: string): Promise<void> {
    if (!project || busy) return;
    const member = project.members.find((m) => m.id === memberId);
    if (!member) return;
    member.name = newName;
    dirty = true;
    render();
    await save();
  }

  async function deleteMember(memberId: string): Promise<void> {
    if (!project || busy) return;
    const memberName = project.members.find((m) => m.id === memberId)?.name;
    const assignedTickets = project.tickets.filter((t) => t.memberId === memberId);
    if (assignedTickets.length > 0) {
      if (!confirm(`${memberName} is assigned to ${assignedTickets.length} ticket(s). Their tickets will be unassigned. Continue?`)) return;
      assignedTickets.forEach((t) => { t.memberId = undefined; });
    }
    project.members = project.members.filter((m) => m.id !== memberId);
    dirty = true;
    render();
    await save();
  }

  async function assignMember(ticketId: string, memberId: string): Promise<void> {
    if (!project || busy) return;
    const ticket = project.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    ticket.memberId = memberId;
    dirty = true;
    closeAssignMemberPanel();
    render();
    await save();
  }

  async function unassignMember(ticketId: string): Promise<void> {
    if (!project || busy) return;
    const ticket = project.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    ticket.memberId = undefined;
    dirty = true;
    render();
    await save();
  }

  async function save(): Promise<void> {
    if (!project || busy) return;
    busy = true;
    try {
      render();
    } catch (error) {
      if (!root.isConnected) return; // DOM has been disconnected (test cleanup)
      throw error;
    }
    try {
      previous = await desktop.writeProject(path, project, previous);
      dirty = false;
      message.textContent = "Saved";
    } catch (error) {
      dirty = true;
      showError(error);
    } finally {
      busy = false;
      try {
        render();
      } catch (error) {
        if (!root.isConnected) return; // DOM has been disconnected (test cleanup)
        throw error;
      }
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
        const next: Project = { version: 1, name, tags: [], members: [], tickets: [] };
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

  manageTags.addEventListener("click", () => {
    tagsPanel.hidden = false;
    renderTagsList();
  });

  closeTagsBtn.addEventListener("click", () => {
    tagsPanel.hidden = true;
  });

  addTagForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = tagNameInput.value.trim();
    const color = tagColorInput.value;
    if (!name) return;
    void addTag(name, color);
    tagNameInput.value = "";
    tagColorInput.value = "#3b82f6";
  });

  manageMembers.addEventListener("click", () => {
    membersPanel.hidden = false;
    renderMembersList();
  });

  closeMembersBtn.addEventListener("click", () => {
    membersPanel.hidden = true;
  });

  addMemberForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const inputElement = document.getElementById("member-name") as HTMLInputElement;
    const name = inputElement.value.trim();
    if (!project || busy || !name) return;
    const memberId = crypto.randomUUID();
    project.members.push({ id: memberId, name });
    inputElement.value = "";
    dirty = true;
    render();
    void save().then(() => renderMembersList());
  });

  saveRenameBtn.addEventListener("click", () => {
    if (!renamingMemberId) return;
    const newName = renameMemberInput.value.trim();
    if (!newName) return;
    const currentId = renamingMemberId;
    renamingMemberId = null;
    renameMemberPanel.hidden = true;
    void renameMember(currentId, newName).then(() => renderMembersList());
  });

  cancelRenameBtn.addEventListener("click", () => {
    renamingMemberId = null;
    renameMemberPanel.hidden = true;
  });

  cancelAssignBtn.addEventListener("click", () => {
    closeAssignMemberPanel();
  });
  
  retry.addEventListener("click", () => void save());
  render();
  return { hasUnsavedChanges: () => dirty || busy };
}
