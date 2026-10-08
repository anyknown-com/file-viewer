import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import api from "./generated/api.json";
import { THEME_KEY } from "./prefs";
import { Site } from "./site";

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  });
  vi.stubGlobal("scrollTo", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  location.hash = "";
});

it("renders the header wordmark on the home page", () => {
  render(<Site />);
  expect(screen.getByRole("link", { name: "file-viewer" })).toBeTruthy();
});

it("switches the theme to dark and back to system", async () => {
  const user = userEvent.setup();
  render(<Site />);
  await user.click(screen.getByRole("button", { name: "Dark" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
  await user.click(screen.getByRole("button", { name: "System" }));
  expect(document.documentElement.dataset.theme).toBeUndefined();
  expect(localStorage.getItem(THEME_KEY)).toBeNull();
});

it("shows not-found for an unknown route", async () => {
  render(<Site />);
  await act(async () => {
    location.hash = "#/nope";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(screen.getByText("Page not found")).toBeTruthy();
});

async function go(hash: string): Promise<void> {
  await act(async () => {
    location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

it("shows the README's h1 on #/guide/readme", async () => {
  render(<Site />);
  await go("#/guide/readme");
  expect(screen.getByRole("heading", { level: 1, name: "@anyknown/file-viewer" })).toBeTruthy();
});

it("shows not-found for an unknown guide", async () => {
  render(<Site />);
  await go("#/guide/nope");
  expect(screen.getByText("Page not found")).toBeTruthy();
});

it("shows the Getting started h1 on #/guide/getting-started", async () => {
  render(<Site />);
  await go("#/guide/getting-started");
  expect(screen.getByRole("heading", { level: 1, name: "Getting started" })).toBeTruthy();
});

it("shows the Connect your app h1 on #/guide/connect", async () => {
  render(<Site />);
  await go("#/guide/connect");
  expect(screen.getByRole("heading", { level: 1, name: "Connect your app" })).toBeTruthy();
});

it("shows the FileViewer card with a required file prop on #/api", async () => {
  render(<Site />);
  await go("#/api");
  const card = document.getElementById("api-FileViewer");
  expect(card).not.toBeNull();
  const row = within(card as HTMLElement)
    .getByText("file", { selector: "code" })
    .closest("tr");
  expect(within(row as HTMLElement).getByText("required")).toBeTruthy();
});

it("scrolls to #api-kindOf on #/api/kindOf", async () => {
  const scroll = vi.fn<() => void>();
  Element.prototype.scrollIntoView = scroll;
  render(<Site />);
  await go("#/api/kindOf");
  expect(document.getElementById("api-kindOf")).not.toBeNull();
  expect(scroll).toHaveBeenCalled();
});

it("lists the first message key in the Messages table", async () => {
  render(<Site />);
  await go("#/api");
  const first = api.messages[0]?.key ?? "";
  const heading = screen.getByRole("heading", { level: 2, name: "Messages" });
  const table = (heading.parentElement as HTMLElement).querySelector("tbody tr td");
  expect(table?.textContent).toBe(first);
});
