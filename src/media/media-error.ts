import { UnsupportedInputFormatError } from "mediabunny";
import { isAbortError, ViewerError, type ViewerErrorCode } from "../contract/errors";

export function toMediaError(error: unknown, fallback: ViewerErrorCode): ViewerError {
  if (isAbortError(error)) throw error;
  let current: unknown = error;
  for (let depth = 0; depth < 16 && current !== undefined && current !== null; depth++) {
    if (current instanceof ViewerError) return current;
    current = current instanceof Error ? current.cause : undefined;
  }
  if (error instanceof UnsupportedInputFormatError) {
    return new ViewerError("unsupported", { cause: error });
  }
  return new ViewerError(fallback, { cause: error });
}
