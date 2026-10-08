import type { Command } from "./commands";
import type { Project } from "./project";

export const MAX_HISTORY = 200;

export class History {
  project: Project;
  private past: { command: Command; before: Project }[] = [];
  private future: { command: Command; before: Project }[] = [];
  private saved: Project;
  private listeners = new Set<() => void>();

  constructor(project: Project) {
    this.project = project;
    this.saved = project;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get dirty(): boolean {
    return this.project !== this.saved;
  }

  run(command: Command): void {
    const entry = { command, before: this.project };
    this.project = command.apply(this.project);
    this.past.push(entry);
    if (this.past.length > MAX_HISTORY) this.past.shift();
    this.future = [];
    this.emit();
  }

  undo(): void {
    const entry = this.past.pop();
    if (!entry) return;
    this.project = entry.before;
    this.future.push(entry);
    this.emit();
  }

  redo(): void {
    const entry = this.future.pop();
    if (!entry) return;
    this.project = entry.command.apply(this.project);
    this.past.push(entry);
    this.emit();
  }

  markSaved(): void {
    this.saved = this.project;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
