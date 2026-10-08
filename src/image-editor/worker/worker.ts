// Module worker entry (same-origin, never a blob: worker). Runs one job per id; `cancel` aborts it.
import { jobs, type JobKind } from "./jobs";

export type WorkerRequest =
  | { id: number; kind: JobKind; input: unknown }
  | { id: number; cancel: true };
export type WorkerResponse =
  | { id: number; ok: true; output: unknown }
  | { id: number; ok: false; error: { name: string; message: string } };

type Job = (input: unknown, signal: AbortSignal) => unknown;

const scope = globalThis as unknown as {
  addEventListener(type: "message", fn: (e: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};
const running = new Map<number, AbortController>();

function buffersOf(value: unknown, into = new Set<ArrayBuffer>()): Set<ArrayBuffer> {
  if (value instanceof Uint8Array && value.buffer instanceof ArrayBuffer) into.add(value.buffer);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) buffersOf(v, into);
  return into;
}

async function run(id: number, kind: JobKind, input: unknown): Promise<void> {
  const controller = new AbortController();
  running.set(id, controller);
  try {
    const output = await (jobs[kind] as Job)(input, controller.signal);
    controller.signal.throwIfAborted();
    scope.postMessage({ id, ok: true, output }, [...buffersOf(output)]);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    scope.postMessage({ id, ok: false, error: { name: error.name, message: error.message } });
  } finally {
    running.delete(id);
  }
}

scope.addEventListener("message", (e) => {
  const msg = e.data;
  if ("cancel" in msg) running.get(msg.id)?.abort();
  else void run(msg.id, msg.kind, msg.input);
});
