import { describe, expect, it } from "vitest";
import { ViewerError } from "../contract/errors";
import { keepFirstError } from "./keep-first-error";

describe("keepFirstError", () => {
  it("keeps the write error when the errored stream is then closed", async () => {
    const tooLarge = new ViewerError("output_too_large");
    const stream = keepFirstError(
      new WritableStream<number>({
        write() {
          throw tooLarge;
        },
      }),
    );
    const writer = stream.writable.getWriter();
    // Like mediabunny: write without waiting, then close.
    void writer.write(1).catch(() => undefined);
    await expect(writer.close()).rejects.toBeDefined();
    expect(stream.error()).toBe(tooLarge);
  });

  it("passes chunks and close through", async () => {
    const seen: number[] = [];
    let closed = false;
    const stream = keepFirstError(
      new WritableStream<number>({
        write: (n) => void seen.push(n),
        close: () => void (closed = true),
      }),
    );
    const writer = stream.writable.getWriter();
    await writer.write(1);
    await writer.write(2);
    await writer.close();
    expect(seen).toEqual([1, 2]);
    expect(closed).toBe(true);
    expect(stream.error()).toBeNull();
  });
});
