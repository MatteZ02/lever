// Last known turnout positions per project (ACC-4), in the user data folder.
// Kept out of the .lever file so that throwing a turnout never changes the
// project. Written atomically and debounced; several instances on one PC
// simply write the latest merge (the positions are only a convenience).
import {existsSync} from 'node:fs';
import {readFile, rename, writeFile} from 'node:fs/promises';
import {z} from 'zod';

const WRITE_DELAY_MS = 2000;

const fileSchema = z.object({
  version: z.literal(1),
  projects: z.record(z.string(), z.record(z.string(), z.string())),
});
type PositionsFile = z.infer<typeof fileSchema>;

export class TurnoutPositionStore {
  private data: PositionsFile = {version: 1, projects: {}};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.path)) {
      return;
    }
    try {
      const parsed = fileSchema.safeParse(
        JSON.parse(await readFile(this.path, 'utf8')),
      );
      if (parsed.success) {
        this.data = parsed.data;
        return;
      }
      console.error('Turnout positions invalid, ignored');
    } catch (error) {
      console.error('Turnout positions unreadable, ignored:', error);
    }
  }

  get(projectId: string): Record<string, string> {
    return {...(this.data.projects[projectId] ?? {})};
  }

  update(projectId: string, positions: Record<string, string>): void {
    this.data.projects[projectId] = {
      ...this.data.projects[projectId],
      ...positions,
    };
    this.dirty = true;
    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), WRITE_DELAY_MS);
    }
  }

  // Writes pending changes (also called on quit).
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    const temporary = `${this.path}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(this.data)}\n`, 'utf8');
      await rename(temporary, this.path);
    } catch (error) {
      console.error('Could not save turnout positions:', error);
    }
  }
}
