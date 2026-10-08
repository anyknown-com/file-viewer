import type { ViewerErrorCode } from "../contract/errors";

export const en = {
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.save": "Save",
  "common.edit": "Edit",
  "common.loading": "Loading…",
  "discard.title": "Discard your changes?",
  "discard.body": "Your changes haven't been saved.",
  "discard.confirm": "Discard",
  "discard.keep": "Keep editing",
  "error.unsupported": "This file type can't be previewed.",
  "error.too_large": "This file is too large to preview.",
  "error.read_failed": "The file couldn't be read.",
  "error.decode_failed": "This file is damaged or in a format that can't be opened.",
  "error.codec_unsupported": "This browser can't decode this file's codec.",
  "error.webgl_unavailable": "This browser doesn't support WebGL2, which the editor needs.",
  "error.webcodecs_unavailable": "This browser doesn't support WebCodecs, which the editor needs.",
  "error.output_too_large": "The result would be larger than allowed. Try a lower quality.",
  "error.save_failed": "Couldn't save the file.",
  "error.render_failed": "Something went wrong while showing this file.",
} satisfies Record<string, string> & Record<`error.${ViewerErrorCode}`, string>;

export type CommonKey = keyof typeof en;
export type CommonMessages = Record<CommonKey, string>;
