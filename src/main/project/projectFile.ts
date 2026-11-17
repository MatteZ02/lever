// Reading and writing project files. Writes are atomic (temporary file, then
// rename), so a crash never leaves a half-written project.
import {readFile, rename, writeFile} from 'node:fs/promises';
import {
  LoadResult,
  loadProject,
  serializeProject,
} from '../../model/migrations';
import {Project} from '../../model/project';

export const readProjectFile = async (path: string): Promise<LoadResult> =>
  loadProject(await readFile(path, 'utf8'));

export const writeProjectFile = async (
  path: string,
  project: Project,
): Promise<void> => {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, serializeProject(project), 'utf8');
  await rename(temporary, path);
};
