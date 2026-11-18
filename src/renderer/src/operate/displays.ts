// What each shape draws in operating mode, from the engine's live state.
import {Project, StationView} from '../../../model/project';
import {findSignalType} from '../../../model/signalTypes';
import {LayoutLive} from '../../../shared/liveState';
import {ElementDisplay} from '../diagram/shapes';

export const buildDisplays = (
  project: Project,
  view: StationView,
  layout: LayoutLive,
): Record<string, ElementDisplay> => {
  const displays: Record<string, ElementDisplay> = {};
  const labelledBlocks = new Set<string>();
  for (const element of view.elements) {
    switch (element.kind) {
      case 'track': {
        const block = element.blockId
          ? layout.blocks[element.blockId]
          : undefined;
        if (block) {
          const display: ElementDisplay = {occupied: block.occupied};
          // The train number appears once per block, on its first track.
          if (block.label && !labelledBlocks.has(element.blockId!)) {
            labelledBlocks.add(element.blockId!);
            display.trainLabel = block.label;
          }
          displays[element.id] = display;
        }
        break;
      }
      case 'turnout': {
        const live = layout.turnouts[element.id];
        displays[element.id] = {
          turnout: live
            ? {position: live.position, status: live.status}
            : {status: 'unknown'},
        };
        break;
      }
      case 'signal': {
        const live = layout.signals[element.id];
        const type = findSignalType(project.signalTypes, element.signalTypeId);
        const aspect = type?.aspects.find(
          (candidate) => candidate.id === live?.aspect,
        );
        displays[element.id] = {
          aspect:
            aspect && live?.status !== 'inconsistent' ? aspect.icon : 'unknown',
        };
        break;
      }
      case 'accessory':
        displays[element.id] = {
          accessoryOn: layout.accessories[element.id]?.on ?? false,
        };
        break;
      default:
        break;
    }
  }
  return displays;
};
