import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Theme } from "../contract/props";
import { ViewerRoot } from "../primitives/root";
import { useResolvedTheme } from "./use-resolved-theme";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe() {
  return <span data-testid="theme">{useResolvedTheme()}</span>;
}

function stubDark(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function themeIn(theme?: Theme): string | null {
  const { getByTestId } = render(
    <ViewerRoot theme={theme}>
      <Probe />
    </ViewerRoot>,
  );
  return getByTestId("theme").textContent;
}

describe("useResolvedTheme", () => {
  it("uses the root theme", () => {
    stubDark(false);
    expect(themeIn("dark")).toBe("dark");
  });

  it("follows the system when no theme is given", () => {
    stubDark(true);
    expect(themeIn()).toBe("dark");
    cleanup();
    stubDark(false);
    expect(themeIn()).toBe("light");
  });
});
