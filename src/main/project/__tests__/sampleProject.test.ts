// The sample project (samples/alppirata.lever, imported from the club's
// Z21 app control station with File → Import from Z21 app) must stay valid
// and clean. Known exceptions, both as drawn in the Z21 app and to be
// checked by the user: the turnout whose address there is 9999 (no address
// now), and the open tip of turnout 316 in the Sissach yard.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadProject} from '../../../model/migrations';
import {validateProject} from '../../../model/validation';

const SAMPLE = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'samples',
  'alppirata.lever',
);

describe('sample project', () => {
  const result = loadProject(readFileSync(SAMPLE, 'utf8'));

  it('loads', () => {
    expect(result.ok).toBe(true);
  });

  it('has only missing addresses as warnings', () => {
    if (!result.ok) {
      return;
    }
    const project = result.project;
    const problems = validateProject(project);
    const addressOf = (id: string) => {
      const element = project.views
        .flatMap((view) => view.elements)
        .find((e) => e.id === id);
      return element?.kind === 'turnout' && element.control.kind === 'dcc'
        ? element.control.addresses[0]
        : undefined;
    };
    const unexpected = problems.filter(
      (problem) =>
        problem.severity !== 'info' &&
        problem.code !== 'missingAddress' &&
        !(
          problem.code === 'openTrackEnd' &&
          problem.elementIds.length === 1 &&
          addressOf(problem.elementIds[0]) === 316
        ),
    );
    expect(
      unexpected.map(
        (p) =>
          `${p.code} ${JSON.stringify(p.params)} ${p.elementIds.join(',')}`,
      ),
    ).toEqual([]);
  });
});
