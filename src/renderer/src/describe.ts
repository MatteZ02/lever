// Names of elements for the operator: "Turnout 13", "Signal 803",
// "Station exit Päärata Pun": the element's name, else its address, with
// its kind. Block ids (the ends of an automatic train's route) get the
// block's name.
import {DiagramElement} from '../../model/elements';
import {Project} from '../../model/project';
import {findElement} from '../../model/validation';
import {strings} from '../../shared/strings';

export const describeElement = (element: DiagramElement): string => {
  const kind = strings.kinds[element.kind] ?? element.kind;
  const control = 'control' in element ? element.control : undefined;
  const detail =
    element.name.trim() ||
    (control?.kind === 'dcc'
      ? control.addresses.join('/')
      : control?.kind === 'extended'
        ? String(control.address)
        : '');
  return detail ? `${kind} ${detail}` : kind.toLowerCase();
};

export const describeElementId = (
  project: Project | null,
  elementId: string,
): string => {
  const element = project ? findElement(project, elementId) : undefined;
  if (element) {
    return describeElement(element);
  }
  const block = project?.blocks.find((candidate) => candidate.id === elementId);
  return block ? block.name || block.id : elementId;
};
