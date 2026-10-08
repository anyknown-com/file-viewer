import type { JobInput, JobKind, JobOutput } from "./jobs";
import type { WorkerRequest, WorkerResponse } from "./worker";

type Pending = { resolve(output: unknown): void; reject(e: unknown): void };

export type WorkerRunner = {
  run<K extends JobKind>(
    job: { kind: K; input: JobInput<K> },
    transfer?: Transferable[],
    signal?: AbortSignal,
  ): Promise<JobOutput<K>>;
  terminate(): void;
};

function abortError(): DOMException {
  return new DOMException("The job was aborted.", "AbortError");
}

function errorFrom(e: { name: string; message: string }): Error {
  if (e.name === "AbortError") return new DOMException(e.message, "AbortError");
  const error = new Error(e.message);
  error.name = e.name;
  return error;
}

// One same-origin module worker, created on the first run.
export function createWorkerRunner(): WorkerRunner {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  function post(msg: WorkerRequest, transfer: Transferable[] = []): void {
    if (!worker) {
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("message", (e: MessageEvent<WorkerResponse>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.output);
        else p.reject(errorFrom(e.data.error));
      });
    }
    worker.postMessage(msg, transfer);
  }

  return {
    run<K extends JobKind>(
      job: { kind: K; input: JobInput<K> },
      transfer?: Transferable[],
      signal?: AbortSignal,
    ): Promise<JobOutput<K>> {
      if (signal?.aborted) return Promise.reject(abortError());
      const id = nextId++;
      return new Promise<JobOutput<K>>((resolve, reject) => {
        const onAbort = () => {
          if (!pending.delete(id)) return;
          worker?.postMessage({ id, cancel: true } satisfies WorkerRequest);
          reject(abortError());
        };
        pending.set(id, {
          resolve: (output) => {
            signal?.removeEventListener("abort", onAbort);
            resolve(output as JobOutput<K>);
          },
          reject: (e) => {
            signal?.removeEventListener("abort", onAbort);
            reject(e);
          },
        });
        signal?.addEventListener("abort", onAbort, { once: true });
        post({ id, kind: job.kind, input: job.input }, transfer);
      });
    },
    terminate() {
      worker?.terminate();
      worker = null;
      const rejected = [...pending.values()];
      pending.clear();
      for (const p of rejected)
        p.reject(new DOMException("The worker was terminated.", "AbortError"));
    },
  };
}
