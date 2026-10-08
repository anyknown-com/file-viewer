export type ProjectErrorCode =
  | "not_zip"
  | "not_project"
  | "too_new"
  | "invalid"
  | "missing_asset"
  | "unsafe_entry"
  | "too_large"
  | "bad_png";

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly details: string[];

  constructor(code: ProjectErrorCode, details: string[] = []) {
    super(details.length > 0 ? `${code}: ${details.join("; ")}` : code);
    this.name = "ProjectError";
    this.code = code;
    this.details = details;
  }
}
