export type ViewerErrorCode =
  | "unsupported"
  | "too_large"
  | "read_failed"
  | "decode_failed"
  | "codec_unsupported"
  | "webgl_unavailable"
  | "webcodecs_unavailable"
  | "output_too_large"
  | "save_failed"
  | "render_failed";

export class ViewerError extends Error {
  readonly code: ViewerErrorCode;

  constructor(code: ViewerErrorCode, options?: { message?: string; cause?: unknown }) {
    super(options?.message ?? code, { cause: options?.cause });
    this.name = "ViewerError";
    this.code = code;
  }
}

export function toViewerError(e: unknown, code: ViewerErrorCode): ViewerError {
  if (e instanceof ViewerError) return e;
  return new ViewerError(code, { cause: e });
}

export function isAbortError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "name" in e && e.name === "AbortError";
}
