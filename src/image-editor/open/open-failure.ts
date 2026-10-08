// Why opening failed: the ViewerError for onError and the editor's own, more specific text.
import type { ProjectError } from "../../comp/index";
import { ViewerError } from "../../contract/errors";
import type { Vars } from "../../i18n/messages";
import type { MessageKey } from "../api";

export class OpenFailure extends Error {
  readonly error: ViewerError;
  readonly key: MessageKey;
  readonly vars: Vars | undefined;

  constructor(error: ViewerError, key: MessageKey, vars?: Vars) {
    super(error.message, { cause: error });
    this.name = "OpenFailure";
    this.error = error;
    this.key = key;
    this.vars = vars;
  }
}

const KEYS = {
  not_zip: "image.open.notZip",
  not_project: "image.open.notProject",
  too_new: "image.open.tooNew",
  invalid: "image.open.invalid",
  missing_asset: "image.open.missingAsset",
  unsafe_entry: "image.open.unsafeEntry",
  bad_png: "image.open.badPng",
} as const satisfies Record<Exclude<ProjectError["code"], "too_large">, MessageKey>;

/** 00-overview §3: a project's `too_large` stays `too_large`, every other code is `decode_failed`. */
export function fromProjectError(e: ProjectError): OpenFailure {
  if (e.code === "too_large") {
    return new OpenFailure(new ViewerError("too_large", { cause: e }), "error.too_large");
  }
  const vars = e.code === "invalid" ? { details: e.details.join("\n") } : undefined;
  return new OpenFailure(new ViewerError("decode_failed", { cause: e }), KEYS[e.code], vars);
}
