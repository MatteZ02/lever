// Project validation for the editor (EDT-5). Pure; returns problems with
// codes and parameters, worded by the renderer (strings.ts).
//
// Severity:
// - error: the file contradicts itself (should not happen from the editor);
// - warning: likely mistakes (address conflicts, incomplete config, open
//   track ends, junctions without a turnout);
// - info: normal situations worth knowing, filterable: manual turnouts,
//   track without feedback, unpaired connectors (CTX-1b, FULL-3).
import {feedbackInputKey} from '../shared/feedback';
import {controlFAdrs, requiredAddressCount} from './accessoryCommands';
import {CentralUnitProfile} from './centralUnitProfile';
import {partnerOf} from './connectors';
import {ControlledElement, DiagramElement, isControlled} from './elements';
import {expandPolyline, isValidPolyline, pointKey, samePoint} from './geometry';
import {turnoutGeometry} from './ports';
import {Project, StationView} from './project';
import {findSignalType} from './signalTypes';
import {
  buildViewTopology,
  connectionCount,
  edgeElementId,
  trackDirectionsAt,
} from './topology';

export type Severity = 'error' | 'warning' | 'info';

export type ProblemCode =
  | 'invalidTrackAngle'
  | 'signalNotOnTrack'
  | 'signalFacingAcrossTrack'
  | 'unknownSignalType'
  | 'duplicateAddress'
  | 'missingAddress'
  | 'addressOutOfRange'
  | 'openTrackEnd'
  | 'junctionWithoutTurnout'
  | 'trackThroughTurnout'
  | 'overlappingTrack'
  | 'endMarkerNotAtTrackEnd'
  | 'feedbackInputConflict'
  | 'invalidDistantSignal'
  | 'manualTurnout'
  | 'trackWithoutFeedback'
  | 'unpairedConnector'
  | 'brokenConnectorPair'
  | 'tracksCrossWithoutConnection';

export type Problem = {
  // Stable key (for React lists and filtering).
  key: string;
  severity: Severity;
  code: ProblemCode;
  viewId?: string;
  // Elements to select when the problem is clicked. The first one is the
  // main element.
  elementIds: string[];
  params: Record<string, string | number>;
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

type Context = {
  project: Project;
  profile: CentralUnitProfile;
  problems: Problem[];
};

const add = (
  context: Context,
  severity: Severity,
  code: ProblemCode,
  elementIds: string[],
  viewId?: string,
  params: Record<string, string | number> = {},
) => {
  context.problems.push({
    key: `${code}:${viewId ?? ''}:${elementIds.join(',')}:${Object.values(params).join(',')}`,
    severity,
    code,
    viewId,
    elementIds,
    params,
  });
};

export const validateProject = (project: Project): Problem[] => {
  const context: Context = {
    project,
    profile: project.settings.centralUnit,
    problems: [],
  };
  for (const view of project.views) {
    validateView(context, view);
  }
  checkAddresses(context);
  checkFeedbackInputs(context);
  return context.problems.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.code.localeCompare(b.code),
  );
};

const validateView = (context: Context, view: StationView) => {
  const topology = buildViewTopology(view);
  const elementsAt = new Map<string, DiagramElement[]>();
  for (const element of view.elements) {
    if (
      'at' in element &&
      element.kind !== 'platform' &&
      element.kind !== 'label'
    ) {
      const key = pointKey(element.at);
      elementsAt.set(key, [...(elementsAt.get(key) ?? []), element]);
    }
  }

  // Track geometry.
  const stepOwners = new Map<string, string>();
  const pointOwners = new Map<string, string[]>();
  const turnoutCentres = new Map(
    view.elements
      .filter((element) => element.kind === 'turnout')
      .map((turnout) => [pointKey(turnout.at), turnout.id]),
  );
  let tracksWithoutFeedback = 0;
  for (const element of view.elements) {
    if (element.kind !== 'track') {
      continue;
    }
    if (!isValidPolyline(element.points)) {
      add(context, 'error', 'invalidTrackAngle', [element.id], view.id);
      continue;
    }
    const block = context.project.blocks.find((b) => b.id === element.blockId);
    if (!block || block.inputs.length === 0) {
      tracksWithoutFeedback++;
    }
    const points = expandPolyline(element.points);
    points.forEach((point, index) => {
      const key = pointKey(point);
      const centre = turnoutCentres.get(key);
      if (centre) {
        add(
          context,
          'warning',
          'trackThroughTurnout',
          [element.id, centre],
          view.id,
        );
      }
      const interior = index > 0 && index < points.length - 1;
      if (interior) {
        pointOwners.set(key, [...(pointOwners.get(key) ?? []), element.id]);
      }
      if (index > 0) {
        const a = pointKey(points[index - 1]);
        const stepKey = a < key ? `${a}|${key}` : `${key}|${a}`;
        const owner = stepOwners.get(stepKey);
        if (owner && owner !== element.id) {
          add(
            context,
            'warning',
            'overlappingTrack',
            [element.id, owner],
            view.id,
          );
        } else {
          stepOwners.set(stepKey, element.id);
        }
      }
    });
  }
  if (tracksWithoutFeedback > 0) {
    add(context, 'info', 'trackWithoutFeedback', [], view.id, {
      count: tracksWithoutFeedback,
    });
  }
  // Two tracks sharing an interior point (not a node) cross without being
  // connected: drawn as an overpass.
  for (const [key, owners] of pointOwners) {
    const unique = [...new Set(owners)];
    if (unique.length > 1 && !topology.nodes.has(`${view.id}:${key}`)) {
      add(context, 'info', 'tracksCrossWithoutConnection', unique, view.id);
    }
  }

  // Nodes: open ends and junctions.
  for (const node of topology.nodes.values()) {
    const count = connectionCount(topology, node.id);
    const markers = (elementsAt.get(pointKey(node.at)) ?? []).filter(
      (element) =>
        element.kind === 'bufferStop' || element.kind === 'connector',
    );
    const touching = topology.edgesAt.get(node.id) ?? [];
    const elementIds = [
      ...new Set(
        touching.map((id) => {
          const edge = topology.edgeById.get(id)!;
          return edgeElementId(edge);
        }),
      ),
    ];
    if (count <= 1 && markers.length === 0 && elementIds.length > 0) {
      add(context, 'warning', 'openTrackEnd', elementIds, view.id, {
        x: node.at.x,
        y: node.at.y,
      });
    }
    if (count > 2) {
      add(context, 'warning', 'junctionWithoutTurnout', elementIds, view.id, {
        x: node.at.x,
        y: node.at.y,
      });
    }
    for (const marker of markers) {
      if (count !== 1) {
        add(context, 'warning', 'endMarkerNotAtTrackEnd', [marker.id], view.id);
      }
    }
  }

  // Elements.
  for (const element of view.elements) {
    switch (element.kind) {
      case 'signal': {
        const directions = trackDirectionsAt(
          topology,
          `${view.id}:${pointKey(element.at)}`,
        );
        if (directions.length === 0) {
          add(context, 'error', 'signalNotOnTrack', [element.id], view.id);
        } else if (!directions.includes(element.facing)) {
          add(
            context,
            'error',
            'signalFacingAcrossTrack',
            [element.id],
            view.id,
          );
        }
        const type = findSignalType(
          context.project.signalTypes,
          element.signalTypeId,
        );
        if (!type) {
          add(context, 'warning', 'unknownSignalType', [element.id], view.id);
        } else {
          checkControl(context, view, element, type.addressCount);
        }
        if (element.distantFor !== undefined) {
          const target = findElement(context.project, element.distantFor);
          if (
            !target ||
            target.kind !== 'signal' ||
            type?.category !== 'distant'
          ) {
            add(
              context,
              'warning',
              'invalidDistantSignal',
              [element.id],
              view.id,
            );
          }
        }
        break;
      }
      case 'turnout':
        if (element.control.kind === 'manual') {
          if (turnoutGeometry(element.type, 'E').positions.length > 0) {
            add(context, 'info', 'manualTurnout', [element.id], view.id);
          }
        } else {
          checkControl(
            context,
            view,
            element,
            requiredAddressCount(element.type, element.control),
          );
        }
        break;
      case 'accessory':
        checkControl(context, view, element, 1);
        break;
      case 'connector':
        if (!element.pairedWith) {
          add(context, 'info', 'unpairedConnector', [element.id], view.id);
        } else if (!partnerOf(context.project, element)) {
          // Points at a connector that is gone or paired elsewhere.
          add(context, 'warning', 'brokenConnectorPair', [element.id], view.id);
        }
        break;
      default:
        break;
    }
  }
};

const checkControl = (
  context: Context,
  view: StationView,
  element: ControlledElement,
  required: number,
) => {
  const {control} = element;
  if (control.kind !== 'dcc') {
    return;
  }
  if (control.addresses.length < required) {
    add(context, 'warning', 'missingAddress', [element.id], view.id, {
      required,
      count: control.addresses.length,
    });
  }
  if (
    controlFAdrs(control, context.profile).length < control.addresses.length
  ) {
    add(context, 'warning', 'addressOutOfRange', [element.id], view.id);
  }
};

const checkAddresses = (context: Context) => {
  const users = new Map<number, {elementId: string; viewId: string}[]>();
  for (const view of context.project.views) {
    for (const element of view.elements) {
      if (!isControlled(element)) {
        continue;
      }
      for (const fAdr of controlFAdrs(element.control, context.profile)) {
        users.set(fAdr, [
          ...(users.get(fAdr) ?? []),
          {elementId: element.id, viewId: view.id},
        ]);
      }
    }
  }
  for (const [fAdr, list] of users) {
    if (list.length > 1) {
      add(
        context,
        'warning',
        'duplicateAddress',
        [...new Set(list.map((user) => user.elementId))],
        list[0].viewId,
        {address: fAdr + 1 - context.profile.addressOffset},
      );
    }
  }
};

const checkFeedbackInputs = (context: Context) => {
  const users = new Map<string, string[]>();
  for (const block of context.project.blocks) {
    for (const input of block.inputs) {
      const key = feedbackInputKey(input);
      users.set(key, [...(users.get(key) ?? []), block.id]);
    }
  }
  for (const [key, blocks] of users) {
    if (blocks.length > 1) {
      const elementIds = context.project.views.flatMap((view) =>
        view.elements
          .filter(
            (element) =>
              element.kind === 'track' &&
              element.blockId !== undefined &&
              blocks.includes(element.blockId),
          )
          .map((element) => element.id),
      );
      add(context, 'warning', 'feedbackInputConflict', elementIds, undefined, {
        input: key,
      });
    }
  }
};

export const findElement = (
  project: Project,
  id: string,
): DiagramElement | undefined => {
  for (const view of project.views) {
    const element = view.elements.find((candidate) => candidate.id === id);
    if (element) {
      return element;
    }
  }
  return undefined;
};

export const viewOfElement = (
  project: Project,
  id: string,
): StationView | undefined =>
  project.views.find((view) =>
    view.elements.some((element) => element.id === id),
  );

// Used by validation and the editor: a buffer stop or connector at a track
// end point.
export const isAtTrackEnd = (view: StationView, element: DiagramElement) =>
  'at' in element &&
  view.elements.some(
    (other) =>
      other.kind === 'track' &&
      (samePoint(other.points[0], element.at) ||
        samePoint(other.points[other.points.length - 1], element.at)),
  );
