export type ViewKind = "image" | "video" | "audio" | "pdf" | "text" | "markdown" | "excalidraw";
export type EditKind = "markdown" | "excalidraw" | "image" | "video" | "audio";

type ExtTable = Readonly<Record<string, string>>;

export const IMAGE_EXT: ExtTable = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};
export const VIDEO_EXT: ExtTable = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
};
export const AUDIO_EXT: ExtTable = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
};
export const PDF_EXT: ExtTable = { pdf: "application/pdf" };
export const MARKDOWN_EXT: ExtTable = { md: "text/markdown", markdown: "text/markdown" };
export const EXCALIDRAW_EXT: ExtTable = { excalidraw: "application/vnd.excalidraw+json" };
export const TEXT_EXT: ExtTable = {
  txt: "text/plain",
  text: "text/plain",
  log: "text/plain",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
};

const mimesOf = (t: ExtTable, extra: string[] = []): ReadonlySet<string> =>
  new Set([...Object.values(t), ...extra]);

export const IMAGE_MIME = mimesOf(IMAGE_EXT);
export const VIDEO_MIME = mimesOf(VIDEO_EXT);
export const AUDIO_MIME = mimesOf(AUDIO_EXT, [
  "audio/x-m4a",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/x-flac",
]);
export const PDF_MIME = mimesOf(PDF_EXT);
export const MARKDOWN_MIME = mimesOf(MARKDOWN_EXT, ["text/x-markdown"]);
export const EXCALIDRAW_MIME = mimesOf(EXCALIDRAW_EXT);
export const TEXT_MIME: ReadonlySet<string> = new Set(["application/json", "application/xml"]);

export const EDITABLE_IMAGE_EXT: ReadonlySet<string> = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "bmp",
]);

export const COMP_SUFFIX = ".comp.zip";
