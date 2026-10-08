import { AudioBufferSink } from "mediabunny";
import type { AssetStore } from "../engine/assets";
import { audioSegments } from "../engine/audio-plan";
import type { Project } from "../model/project";
import { type Ticks, ticksToSeconds } from "../model/time";

export const MIX_SAMPLE_RATE = 48_000;

/** Renders the timeline's audio in `[from, to)` to a 48 kHz stereo buffer. */
export async function mixAudio(
  p: Project,
  assets: AssetStore,
  from: Ticks,
  to: Ticks,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(
    2,
    Math.round(ticksToSeconds(to - from) * MIX_SAMPLE_RATE),
    MIX_SAMPLE_RATE,
  );
  const withAudio = new Set<string>();
  for (const clip of p.tracks.main.clips) {
    const status = assets.status(clip.assetId);
    if (status.state === "ready" && status.info.hasAudio) withAudio.add(clip.assetId);
  }

  for (const seg of audioSegments(p, withAudio, from, to)) {
    // oxlint-disable-next-line no-await-in-loop -- one segment at a time keeps a single decoder open.
    const track = (await assets.media(seg.assetId)).audio;
    if (!track) continue;
    const gain = new GainNode(ctx, { gain: seg.gain });
    gain.connect(ctx.destination);
    const segStart = ticksToSeconds(seg.at - from);
    const segEnd = segStart + (seg.to - seg.from);
    // oxlint-disable-next-line no-await-in-loop -- buffers are scheduled one segment at a time, in order.
    for await (const wrapped of new AudioBufferSink(track).buffers(seg.from, seg.to)) {
      const node = new AudioBufferSourceNode(ctx, { buffer: wrapped.buffer });
      node.connect(gain);
      // A buffer that begins before the segment is cut at the segment's start, so it never
      // sounds before the clip does (this also covers a start before the mixed range).
      const startAt = segStart + (wrapped.timestamp - seg.from);
      if (startAt < segStart) node.start(segStart, segStart - startAt);
      else node.start(startAt);
      node.stop(segEnd);
    }
  }
  return ctx.startRendering();
}
