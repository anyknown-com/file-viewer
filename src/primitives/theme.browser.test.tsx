// oxlint-disable-next-line no-restricted-imports -- test only: hosts import tokens.css before styles.css
import "@anyknown/ui/tokens.css";
import "../styles.css";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Dialog } from "./dialog";
import { ViewerRoot } from "./root";

function token(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function rootOf(container: HTMLElement): Element {
  const el = container.querySelector(".fv-root");
  if (!el) throw new Error("no .fv-root");
  return el;
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme on the viewer subtree", () => {
  it("light root inside a dark page gets the light bg", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { container } = render(<ViewerRoot theme="light">x</ViewerRoot>);
    const el = rootOf(container);
    expect(token(el, "--ak-bg")).toBe("#ffffff");
    expect(getComputedStyle(el).colorScheme).toBe("light");
  });

  it("dark root inside a light page gets the dark bg", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { container } = render(<ViewerRoot theme="dark">x</ViewerRoot>);
    expect(token(rootOf(container), "--ak-bg")).toBe("#121212");
  });

  it("root without theme follows the host page", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { container } = render(<ViewerRoot>x</ViewerRoot>);
    expect(token(rootOf(container), "--ak-bg")).toBe("#121212");
  });

  it("a dialog portaled into the root keeps the root's theme", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(
      <ViewerRoot theme="light">
        <Dialog open onOpenChange={() => {}} title="T" />
      </ViewerRoot>,
    );
    const dialog = document.querySelector(".fv-dialog");
    if (!dialog) throw new Error("no .fv-dialog");
    expect(token(dialog, "--ak-bg")).toBe("#ffffff");
  });
});
