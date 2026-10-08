import type { AudioCodec, InputAudioTrack } from "mediabunny";
import { ViewerError } from "../contract/errors";
import type { ByteSource } from "../contract/byte-source";
import { openMedia } from "../media";

export type OpenedTrack = {
  track: InputAudioTrack;
  duration: number;
  sampleRate: number;
  channels: number;
  codec: AudioCodec | null;
  dispose(): void;
};

export async function openTrack(source: ByteSource, signal: AbortSignal): Promise<OpenedTrack> {
  const media = await openMedia(source, "audio", signal);
  const track = media.audio;
  if (!track) {
    media.dispose();
    throw new ViewerError("unsupported");
  }
  return {
    track,
    duration: media.duration,
    sampleRate: track.sampleRate,
    channels: track.numberOfChannels,
    codec: track.codec,
    dispose: () => media.dispose(),
  };
}
