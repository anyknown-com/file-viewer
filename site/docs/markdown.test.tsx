import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Markdown } from "./markdown";

it("rewrites a relative .md link to its guide route", () => {
  render(<Markdown source="[c](./CHANGELOG.md)" />);
  expect(screen.getByRole("link", { name: "c" }).getAttribute("href")).toBe("#/guide/changelog");
});

it("rewrites a .md link that carries a fragment", () => {
  render(<Markdown source="[c](./CHANGELOG.md#010)" />);
  expect(screen.getByRole("link", { name: "c" }).getAttribute("href")).toBe("#/guide/changelog");
});

it("adds rel=noreferrer to external links", () => {
  render(<Markdown source="[x](https://example.com)" />);
  const link = screen.getByRole("link", { name: "x" });
  expect(link.getAttribute("href")).toBe("https://example.com");
  expect(link.getAttribute("rel")).toBe("noreferrer");
});

it("renders a GFM table as <table>", () => {
  const { container } = render(<Markdown source={"| a | b |\n| - | - |\n| 1 | 2 |"} />);
  expect(container.querySelector("table")).not.toBeNull();
});

it("renders a code block as plain <pre><code>", () => {
  const { container } = render(<Markdown source={"```ts\nconst a = 1;\n```"} />);
  expect(container.querySelector("pre > code")?.textContent).toBe("const a = 1;\n");
});
