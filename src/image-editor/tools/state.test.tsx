import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { EditorApi } from "../api";
import { runJob, setToolState, toolState, useToolState } from "./state";

afterEach(cleanup);

const fake = () => ({}) as EditorApi;

it("keeps separate state per api", () => {
  const a = fake();
  const b = fake();
  expect(toolState(a).brush).toEqual({ size: 30, hardness: 1, opacity: 1, smoothing: 0 });
  setToolState(a, { fg: [1, 2, 3, 4] });
  expect(toolState(a).fg).toEqual([1, 2, 3, 4]);
  expect(toolState(b).fg).toEqual([0, 0, 0, 255]);
});

it("notifies a subscriber once per change", () => {
  const api = fake();
  const seen: number[] = [];
  function Probe() {
    const fg = useToolState(api).fg[0];
    return <span ref={() => void seen.push(fg)}>{fg}</span>;
  }
  const view = render(<Probe />);
  act(() => setToolState(api, { fg: [7, 0, 0, 255] }));
  expect(seen.filter((v) => v === 7)).toHaveLength(1);
  expect(view.container.textContent).toBe("7");
});

it("returns null after abort and clears the job", async () => {
  const api = fake();
  const run = runJob(
    api,
    "image.paint.working",
    (signal) =>
      new Promise<number>((_, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError")));
      }),
  );
  expect(toolState(api).job?.label).toBe("image.paint.working");
  toolState(api).job?.abort();
  expect(await run).toBeNull();
  expect(toolState(api).job).toBeNull();
});

it("returns the value and rethrows other errors", async () => {
  const api = fake();
  expect(await runJob(api, "image.paint.working", async () => 5)).toBe(5);
  await expect(
    runJob(api, "image.paint.working", async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(toolState(api).job).toBeNull();
});
