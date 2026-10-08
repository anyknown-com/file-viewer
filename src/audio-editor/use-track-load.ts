import { useCallback, useRef, useState } from "react";
import type { ByteSource } from "../contract/byte-source";
import type { ViewerError } from "../contract/errors";
import { toMediaError } from "../media";
import { useRoot } from "../primitives/root-context";
import { type OpenedTrack, openTrack } from "./open-track";
import type { Peaks } from "./peaks";
import { scanPeaks } from "./scan";

export type Load =
  | { status: "opening" }
  | { status: "scanning"; opened: OpenedTrack; progress: number; peaks: Peaks | null }
  | { status: "ready"; opened: OpenedTrack; peaks: Peaks }
  | { status: "error"; error: ViewerError };

/** How often the half-scanned peak table is copied out so the waveform fills in while it runs. */
const SNAPSHOT_MS = 500;

/**
 * Opens the track and scans its peaks from the editor root's ref callback; the cleanup aborts
 * every read and disposes the track. `onOpened` runs once the track is open, before the scan.
 */
export function useTrackLoad(
  source: ByteSource,
  onOpened: (o: OpenedTrack) => void,
): {
  rootRef: (el: HTMLDivElement | null) => (() => void) | undefined;
  load: Load;
  opened: OpenedTrack | null;
  peaks: Peaks | null;
  progress: number;
} {
  const root = useRoot();
  const callbacks = useRef({ report: root.report, onOpened });
  // oxlint-disable-next-line react/refs -- kept out of the ref callback deps so a new onError never reopens the file.
  callbacks.current = { report: root.report, onOpened };
  const [load, setLoad] = useState<Load>({ status: "opening" });

  const rootRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const ac = new AbortController();
      const signal = ac.signal;
      let opened: OpenedTrack | null = null;
      const run = async () => {
        try {
          const o = await openTrack(source, signal);
          if (signal.aborted) {
            o.dispose();
            return;
          }
          opened = o;
          callbacks.current.onOpened(o);
          setLoad({ status: "scanning", opened: o, progress: 0, peaks: null });
          let snappedAt = performance.now();
          const peaks = await scanPeaks(o, {
            signal,
            onProgress: (b) => {
              const now = performance.now();
              const snap = now - snappedAt >= SNAPSHOT_MS ? b.finish() : null;
              if (snap) snappedAt = now;
              setLoad((l) => ({
                status: "scanning",
                opened: o,
                progress: b.progress(),
                peaks: snap ?? (l.status === "scanning" ? l.peaks : null),
              }));
            },
          });
          if (!signal.aborted) setLoad({ status: "ready", opened: o, peaks });
        } catch (e) {
          if (signal.aborted) return;
          const error = toMediaError(e, "decode_failed");
          setLoad({ status: "error", error });
          callbacks.current.report(error);
        }
      };
      void run();
      return () => {
        ac.abort();
        opened?.dispose();
      };
    },
    [source],
  );

  const live = load.status === "scanning" || load.status === "ready" ? load : null;
  return {
    rootRef,
    load,
    opened: live && live.opened,
    peaks: live && live.peaks,
    progress: load.status === "scanning" ? load.progress : 1,
  };
}
