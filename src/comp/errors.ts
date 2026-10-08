/** Why reading or writing a .comp.zip project failed. */
export type ProjectErrorCode =
  | "not_zip"
  | "not_project"
  | "too_new"
  | "invalid"
  | "missing_asset"
  | "unsafe_entry"
  | "too_large"
  | "bad_png";

/** The error thrown when a .comp.zip project cannot be read or written. */
export class ProjectError extends Error {
  /** Machine-readable reason, for example "not_zip". */
  readonly code: ProjectErrorCode;
  /** What was wrong, one line each; empty when the code says it all. */
  readonly details: string[];

  constructor(code: ProjectErrorCode, details: string[] = []) {
    super(details.length > 0 ? `${code}: ${details.join("; ")}` : code);
    this.name = "ProjectError";
    this.code = code;
    this.details = details;
  }
}
