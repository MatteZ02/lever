import {describe, expect, it} from 'vitest';
import {stateOutputs} from '../accessoryCommands';
import {areaBoundaries, levelOf} from '../areas';
import {defaultCentralUnitProfile} from '../centralUnitProfile';
import {Signal} from '../elements';
import {OutputReport, reconstructState} from '../reconstruct';
import {BUILT_IN_SIGNAL_TYPES} from '../signalTypes';
import {point, projectWith, track, turnout} from './testLayouts';

const profile = defaultCentralUnitProfile();
const reports =
  (values: Record<number, 0 | 1>) =>
  (fAdr: number): OutputReport =>
    values[fAdr] ?? 'unknown';

describe('reconstructing positions and aspects (MULTI-2)', () => {
  it('given a turnout at address 5, reads its position from FAdr 4', () => {
    const states = stateOutputs(
      turnout('T', [0, 0], {
        control: {kind: 'dcc', addresses: [5], invert: false},
      }),
      undefined,
      profile,
    );
    expect(reconstructState(states, reports({4: 0}))).toEqual({
      kind: 'state',
      state: 'straight',
    });
    expect(reconstructState(states, reports({4: 1}))).toEqual({
      kind: 'state',
      state: 'diverging',
    });
    expect(reconstructState(states, reports({}))).toEqual({kind: 'unknown'});
  });

  it('follows inversion', () => {
    const states = stateOutputs(
      turnout('T', [0, 0], {
        control: {kind: 'dcc', addresses: [5], invert: true},
      }),
      undefined,
      profile,
    );
    expect(reconstructState(states, reports({4: 0}))).toEqual({
      kind: 'state',
      state: 'diverging',
    });
  });

  it('given a three-way turnout, uses both motors', () => {
    const states = stateOutputs(
      turnout('T', [0, 0], {
        type: 'threeWay',
        control: {kind: 'dcc', addresses: [1, 2], invert: false},
      }),
      undefined,
      profile,
    );
    expect(reconstructState(states, reports({0: 0, 1: 0}))).toEqual({
      kind: 'state',
      state: 'straight',
    });
    expect(reconstructState(states, reports({0: 0, 1: 1}))).toEqual({
      kind: 'state',
      state: 'right',
    });
    expect(reconstructState(states, reports({0: 1, 1: 0}))).toEqual({
      kind: 'state',
      state: 'left',
    });
    expect(reconstructState(states, reports({0: 1}))).toEqual({
      kind: 'state',
      state: 'left',
    });
  });

  it('given a 3-aspect signal, reads the aspect or says it is inconsistent', () => {
    const main3 = BUILT_IN_SIGNAL_TYPES.find(
      (type) => type.id === 'builtin:main3',
    )!;
    const signal: Signal = {
      kind: 'signal',
      id: 'S',
      name: '',
      at: point(0, 0),
      facing: 'E',
      side: 'right',
      signalTypeId: main3.id,
      control: {kind: 'dcc', addresses: [10, 11], invert: false},
    };
    const states = stateOutputs(signal, main3, profile);
    expect(reconstructState(states, reports({9: 0, 10: 1}))).toEqual({
      kind: 'state',
      state: 'stop',
    });
    expect(reconstructState(states, reports({9: 1, 10: 0}))).toEqual({
      kind: 'state',
      state: 'proceed',
    });
    expect(reconstructState(states, reports({9: 1, 10: 1}))).toEqual({
      kind: 'state',
      state: 'reduced',
    });
    expect(reconstructState(states, reports({9: 1}))).toEqual({
      kind: 'unknown',
    });
  });
});

describe('automation areas (MIX-1, MIX-3)', () => {
  const base = projectWith(track('a', [0, 0], [5, 0]), {
    ...track('b', [5, 0], [10, 0]),
    areaId: 'line',
  });
  const project = {
    ...base,
    areas: [
      ...base.areas.map((area) => ({
        ...area,
        id: base.views[0].areaId,
        level: 2 as const,
      })),
      {id: 'line', name: 'Line', level: 1 as const},
    ],
  };
  const view = project.views[0];

  it('uses the element area, else the view default', () => {
    expect(levelOf(project, view, view.elements[0])).toBe(2);
    expect(levelOf(project, view, view.elements[1])).toBe(1);
  });

  it('finds the boundary where the two areas meet', () => {
    expect(areaBoundaries(project, view)).toMatchObject([
      {at: point(5, 0), levels: [2, 1]},
    ]);
  });
});
