/**
 * Wraps `target` and keeps the first error its writes throw (for example a sink's
 * `output_too_large`). mediabunny writes without waiting, so it may go on to close the
 * errored stream and report that `TypeError` instead of the error that caused it.
 */
export function keepFirstError<T>(target: WritableStream<T>): {
  writable: WritableStream<T>;
  error(): unknown;
} {
  const writer = target.getWriter();
  let first: unknown = null;
  const keep = (e: unknown) => {
    first ??= e;
    throw e;
  };
  return {
    writable: new WritableStream<T>({
      write: (chunk) => writer.write(chunk).catch(keep),
      close: () => writer.close().catch(keep),
      abort: (reason) => writer.abort(reason),
    }),
    error: () => first,
  };
}
