import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
