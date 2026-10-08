/**
 * Adapted from opencut-classic apps/web/src/commands/base-command.ts and batch-command.ts
 * @cf5e79e919144200294fb9fed22a222592a0aeea, MIT, Copyright 2025-2026 OpenCut
 */
import type { Project, Tracks } from "./project";

export type Command = {
  label: string;
  apply(p: Project): Project;
  revert(p: Project): Project;
};

export function tracksCommand(label: string, before: Tracks, after: Tracks): Command {
  return {
    label,
    apply: (p) => ({ ...p, tracks: after }),
    revert: (p) => ({ ...p, tracks: before }),
  };
}

type Settings = Pick<Project, "aspect" | "width" | "height">;

export function settingsCommand(label: string, before: Settings, after: Settings): Command {
  return {
    label,
    apply: (p) => ({ ...p, aspect: after.aspect, width: after.width, height: after.height }),
    revert: (p) => ({ ...p, aspect: before.aspect, width: before.width, height: before.height }),
  };
}

export function batch(label: string, commands: Command[]): Command {
  return {
    label,
    apply: (p) => commands.reduce((acc, c) => c.apply(acc), p),
    revert: (p) => commands.toReversed().reduce((acc, c) => c.revert(acc), p),
  };
}
