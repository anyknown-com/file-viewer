import { CustomSource } from "mediabunny";
import type { ByteSource } from "../contract/byte-source";
import { toMediaError } from "./media-error";

export function mediaSource(source: ByteSource, signal?: AbortSignal): CustomSource {
  return new CustomSource({
    getSize: () => source.size,
    read: (start, end) =>
      source.read(start, end, signal).catch((e) => {
        throw signal?.aborted ? e : toMediaError(e, "read_failed");
      }),
    prefetchProfile: "network",
  });
}
