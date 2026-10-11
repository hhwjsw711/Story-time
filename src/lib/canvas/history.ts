// Undo and redo for edits made one step at a time. Each step knows how to
// undo and redo itself, so this only keeps the two stacks.

export type Step = { undo: () => Promise<void>; redo: () => Promise<void> };

const LIMIT = 100;

export class History {
  private past: Step[] = [];
  private future: Step[] = [];

  push(step: Step) {
    this.past.push(step);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  // False when there is nothing to undo. A step that fails stays where it was.
  async undo(): Promise<boolean> {
    const step = this.past.at(-1);
    if (step === undefined) return false;
    await step.undo();
    this.past.pop();
    this.future.push(step);
    return true;
  }

  async redo(): Promise<boolean> {
    const step = this.future.at(-1);
    if (step === undefined) return false;
    await step.redo();
    this.future.pop();
    this.past.push(step);
    return true;
  }

  clear() {
    this.past = [];
    this.future = [];
  }
}
