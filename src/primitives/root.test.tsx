import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewerError } from "../contract/errors";
import { commonMessages } from "../i18n/messages";
import { useT } from "../i18n/use-t";
import { ViewerRoot } from "./root";
import { useRoot, type RootContextValue } from "./root-context";

afterEach(cleanup);

function Probe({ onRoot }: { onRoot: (r: RootContextValue) => void }) {
  onRoot(useRoot());
  return null;
}

function Bad() {
  useRoot();
  return null;
}

function Save() {
  const t = useT(commonMessages);
  return <span data-testid="s">{t("common.save")}</span>;
}

describe("ViewerRoot", () => {
  it("writes data-theme when given", () => {
    const { container } = render(<ViewerRoot theme="dark">x</ViewerRoot>);
    expect(container.querySelector(".fv-root")?.getAttribute("data-theme")).toBe("dark");
  });

  it("omits data-theme when not given", () => {
    const { container } = render(<ViewerRoot>x</ViewerRoot>);
    expect(container.querySelector(".fv-root")?.hasAttribute("data-theme")).toBe(false);
  });

  it("sets lang", () => {
    const { container } = render(<ViewerRoot locale="zh-TW">x</ViewerRoot>);
    expect(container.querySelector(".fv-root")?.getAttribute("lang")).toBe("zh-TW");
  });

  it("translates by locale", () => {
    render(
      <ViewerRoot locale="zh-TW">
        <Save />
      </ViewerRoot>,
    );
    expect(screen.getByTestId("s").textContent).toBe("儲存");
  });

  it("applies message overrides", () => {
    render(
      <ViewerRoot messages={{ "common.save": "Store" }}>
        <Save />
      </ViewerRoot>,
    );
    expect(screen.getByTestId("s").textContent).toBe("Store");
  });

  it("reports errors to onError", () => {
    const onError = vi.fn<(e: ViewerError) => void>();
    const err = new ViewerError("read_failed");
    function Reporter() {
      useRoot().report(err);
      return null;
    }
    render(
      <ViewerRoot onError={onError}>
        <Reporter />
      </ViewerRoot>,
    );
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("does not nest roots", () => {
    const { container } = render(
      <ViewerRoot>
        <ViewerRoot>x</ViewerRoot>
      </ViewerRoot>,
    );
    expect(container.querySelectorAll(".fv-root")).toHaveLength(1);
  });

  it("exposes the portal element", () => {
    let portal: HTMLElement | null = null;
    const { container } = render(
      <ViewerRoot>
        <Probe onRoot={(r) => (portal = r.portal)} />
      </ViewerRoot>,
    );
    expect(portal).toBe(container.querySelector(".fv-root > .fv-portal"));
  });

  it("throws outside a root", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow("rendered outside ViewerRoot");
    vi.restoreAllMocks();
  });

  it("resolves limits", () => {
    let limits: RootContextValue["limits"] | undefined;
    render(
      <ViewerRoot limits={{ textBytes: 5 }}>
        <Probe onRoot={(r) => (limits = r.limits)} />
      </ViewerRoot>,
    );
    expect(limits?.textBytes).toBe(5);
    expect(limits?.docBytes).toBeGreaterThan(5);
  });
});
