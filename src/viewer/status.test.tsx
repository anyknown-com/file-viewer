import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ViewerErrorCode } from "../contract/errors";
import { commonMessages } from "../i18n/messages";
import { ViewerRoot } from "../primitives/root";
import { viewerMessages } from "./messages";
import { Status } from "./status";

afterEach(cleanup);

const codes: ViewerErrorCode[] = [
  "unsupported",
  "too_large",
  "read_failed",
  "decode_failed",
  "codec_unsupported",
  "webgl_unavailable",
  "webcodecs_unavailable",
  "output_too_large",
  "save_failed",
  "render_failed",
];

describe("Status", () => {
  it.each(codes)("titles %s with its error string", (code) => {
    render(
      <ViewerRoot locale="en">
        <Status kind={code} />
      </ViewerRoot>,
    );
    expect(screen.getByText(commonMessages.en[`error.${code}`])).toBeTruthy();
  });

  it("loading has a spinner, a title and no hint", () => {
    const { container } = render(
      <ViewerRoot locale="en">
        <Status kind="loading" />
      </ViewerRoot>,
    );
    expect(screen.getByRole("status", { name: "Loading…" })).toBeTruthy();
    expect(screen.getAllByText(viewerMessages.en["viewer.loading"]).length).toBeGreaterThan(0);
    expect(container.querySelector(".fv-status p")).toBeNull();
  });

  it("read_failed is an error alert", () => {
    render(
      <ViewerRoot locale="en">
        <Status kind="read_failed" />
      </ViewerRoot>,
    );
    const el = screen.getByRole("alert");
    expect(el.getAttribute("data-tone")).toBe("error");
  });

  it("unsupported is an info status", () => {
    render(
      <ViewerRoot locale="en">
        <Status kind="unsupported" />
      </ViewerRoot>,
    );
    const el = screen.getByRole("status");
    expect(el.getAttribute("data-tone")).toBe("info");
  });

  it("omits the hint when it is overridden to empty", () => {
    const { container } = render(
      <ViewerRoot locale="en" messages={{ "viewer.downloadHint": "" }}>
        <Status kind="unsupported" />
      </ViewerRoot>,
    );
    expect(container.querySelector(".fv-status p")).toBeNull();
  });

  it("renders in zh-TW", () => {
    render(
      <ViewerRoot locale="zh-TW">
        <Status kind="unsupported" />
      </ViewerRoot>,
    );
    expect(screen.getByText(commonMessages["zh-TW"]["error.unsupported"])).toBeTruthy();
    expect(screen.getByText("下載後用裝置上的 app 打開。")).toBeTruthy();
  });

  it("renders children", () => {
    render(
      <ViewerRoot locale="en">
        <Status kind="render_failed">
          <button type="button">go</button>
        </Status>
      </ViewerRoot>,
    );
    expect(screen.getByRole("button", { name: "go" })).toBeTruthy();
  });
});

describe("viewerMessages", () => {
  it("has the same 3 keys in both locales", () => {
    const en = Object.keys(viewerMessages.en).sort();
    expect(en).toHaveLength(3);
    expect(Object.keys(viewerMessages["zh-TW"]).sort()).toEqual(en);
  });
});
