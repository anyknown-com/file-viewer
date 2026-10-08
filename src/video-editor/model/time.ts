export const TICKS_PER_SECOND = 120_000;
export type Ticks = number;

export function secondsToTicks(seconds: number): Ticks {
  return Math.round(seconds * TICKS_PER_SECOND);
}

export function ticksToSeconds(ticks: Ticks): number {
  return ticks / TICKS_PER_SECOND;
}

export function frameTicks(fps: number): Ticks {
  return Math.round(TICKS_PER_SECOND / fps);
}

export function roundToFrame(ticks: Ticks, fps: number): Ticks {
  const frame = frameTicks(fps);
  return Math.round(ticks / frame) * frame;
}

const two = (n: number) => String(n).padStart(2, "0");

export function formatTimecode(ticks: Ticks, fps: number): string {
  const totalFrames = Math.floor(Math.max(0, ticks) / frameTicks(fps));
  const rate = Math.round(fps);
  const frames = totalFrames % rate;
  const totalSeconds = Math.floor(totalFrames / rate);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const tail = `${two(minutes)}:${two(seconds)}:${two(frames)}`;
  return hours > 0 ? `${hours}:${tail}` : tail;
}
