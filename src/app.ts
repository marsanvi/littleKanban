export interface Project {
  version: 1;
  name: string;
  tickets: { id: string; title: string; status: "todo" }[];
}

export interface Desktop {
  chooseNewProject(): Promise<string | null>;
  chooseProject(): Promise<string | null>;
  readProject(path: string): Promise<string>;
  writeProject(path: string, project: Project, previous: string | null): Promise<string>;
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Record<string, unknown>;
  return project.version === 1 && typeof project.name === "string" &&
    Array.isArray(project.tickets) && project.tickets.every((ticket: unknown) =>
      !!ticket && typeof ticket === "object" &&
      typeof (ticket as Record<string, unknown>).id === "string" &&
      typeof (ticket as Record<string, unknown>).title === "string" &&
      (ticket as Record<string, unknown>).status === "todo");
}

export function startApp(root: HTMLElement, desktop: Desktop): { hasUnsavedChanges(): boolean } {
  let project: Project | null = null;
  let path = "";
  let previous = "";
  let dirty = false;
  let busy = false;

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
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));

  function showError(error: unknown): void {
    message.textContent = error instanceof Error ? error.message : String(error);
  }

  function render(): void {
    board.hidden = project === null;
    buttons.forEach((button) => { button.disabled = busy; });
    retry.hidden = !dirty;
    if (!project) return;
    element("#name").textContent = project.name;
    element("#path").textContent = path;
    const list = element("#tickets");
    list.replaceChildren(...project.tickets.map((ticket) => {
      const item = document.createElement("li");
      item.textContent = ticket.title;
      return item;
    }));
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
    project.tickets.push({ id: crypto.randomUUID(), title: value, status: "todo" });
    title.value = "";
    dirty = true;
    render();
    void save();
  });
  retry.addEventListener("click", () => void save());
  render();
  return { hasUnsavedChanges: () => dirty || busy };
}
