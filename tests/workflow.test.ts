// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { startApp, type Desktop, type Project } from "../src/app";

let directory = "";

function desktopFor(path: string): Desktop {
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
