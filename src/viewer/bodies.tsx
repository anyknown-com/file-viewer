/* oxlint-disable jsx-a11y/media-has-caption -- user files have no caption tracks. */
import { lazy, type ComponentType } from "react";
import type { FileRef } from "../contract/byte-source";
import { ViewerError } from "../contract/errors";
import type { ViewKind } from "../contract/formats";
import type { FileViewerProps } from "../contract/props";
import type { Loaded } from "./load";

export type BodyProps = {
  file: FileRef;
  loaded: Loaded;
  fail: (e: ViewerError) => void;
  viewer: FileViewerProps;
};

// 4 is MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED; jsdom has no MediaError, so the constant is inline.
function mediaError(el: HTMLMediaElement): ViewerError {
  return new ViewerError(el.error?.code === 4 ? "codec_unsupported" : "decode_failed");
}

function ImageBody({ file, loaded, fail }: BodyProps) {
  return (
    <img
      className="fv-image"
      src={loaded.url ?? undefined}
      alt={file.name}
      decoding="async"
      onError={() => fail(new ViewerError("decode_failed"))}
    />
  );
}

function VideoBody({ loaded, fail }: BodyProps) {
  return (
    <video
      className="fv-video"
      src={loaded.url ?? undefined}
      controls
      playsInline
      preload="metadata"
      onError={(e) => fail(mediaError(e.currentTarget))}
    />
  );
}

function AudioBody({ loaded, fail }: BodyProps) {
  return (
    <audio
      className="fv-audio"
      src={loaded.url ?? undefined}
      controls
      preload="metadata"
      onError={(e) => fail(mediaError(e.currentTarget))}
    />
  );
}

function PdfBody({ file, loaded }: BodyProps) {
  return (
    // oxlint-disable-next-line react/iframe-missing-sandbox -- Chromium will not show a PDF in a sandboxed frame; the blob is always typed application/pdf (see load.ts).
    <iframe className="fv-pdf" src={loaded.url ?? undefined} title={file.name} />
  );
}

function TextBody({ loaded }: BodyProps) {
  return <pre className="fv-text">{loaded.text}</pre>;
}

const MarkdownBody = lazy(() => import("./markdown-body"));
const ExcalidrawBody = lazy(() => import("./excalidraw-body"));
const CompBody = lazy(() => import("../image-editor/comp-preview"));

export const bodies: Record<ViewKind, ComponentType<BodyProps>> = {
  image: ImageBody,
  video: VideoBody,
  audio: AudioBody,
  pdf: PdfBody,
  text: TextBody,
  markdown: MarkdownBody,
  excalidraw: ExcalidrawBody,
  comp: CompBody,
};
