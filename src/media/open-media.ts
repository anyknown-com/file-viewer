import { ALL_FORMATS, Input, type InputAudioTrack, type InputVideoTrack } from "mediabunny";
import type { ByteSource } from "../contract/byte-source";
import { ViewerError } from "../contract/errors";
import { toMediaError } from "./media-error";
import { mediaSource } from "./source";

export type MediaNeed = "video" | "audio";
export type OpenedMedia = {
  input: Input;
  video: InputVideoTrack | null;
  audio: InputAudioTrack | null;
  duration: number;
  dispose(): void;
};

export async function openMedia(
  source: ByteSource,
  need: MediaNeed,
  signal?: AbortSignal,
): Promise<OpenedMedia> {
  signal?.throwIfAborted();
  const input = new Input({ formats: ALL_FORMATS, source: mediaSource(source, signal) });
  const onAbort = () => input.dispose();
  signal?.addEventListener("abort", onAbort, { once: true });
  const dispose = () => {
    signal?.removeEventListener("abort", onAbort);
    input.dispose();
  };
  try {
    let video: InputVideoTrack | null = null;
    let audio: InputAudioTrack | null = null;
    if (need === "video") {
      video = await input.getPrimaryVideoTrack();
      if (!video) throw new ViewerError("unsupported");
      if (!(await video.canDecode())) {
        throw new ViewerError(
          typeof VideoDecoder === "undefined" ? "webcodecs_unavailable" : "codec_unsupported",
        );
      }
      const a = await input.getPrimaryAudioTrack();
      if (a && (await a.canDecode())) audio = a;
    } else {
      audio = await input.getPrimaryAudioTrack();
      if (!audio) throw new ViewerError("unsupported");
      if (!(await audio.canDecode())) {
        throw new ViewerError(
          typeof AudioDecoder === "undefined" ? "webcodecs_unavailable" : "codec_unsupported",
        );
      }
    }
    const duration = await input.computeDuration();
    return { input, video, audio, duration, dispose };
  } catch (e) {
    dispose();
    if (signal?.aborted) throw signal.reason;
    throw toMediaError(e, "decode_failed");
  }
}
