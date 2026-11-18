// Station connectors (FULL-3): an exit in one view paired with an entry in
// another (or in the same view, e.g. both ends of a line that is not drawn).
// Pairing is optional and always mutual.
import {StationConnector} from './elements';
import {Project} from './project';

export type ConnectorRef = {viewId: string; connectorId: string};

export type ConnectorInfo = {
  viewId: string;
  viewName: string;
  connector: StationConnector;
};

export const allConnectors = (project: Project): ConnectorInfo[] =>
  project.views.flatMap((view) =>
    view.elements
      .filter(
        (element): element is StationConnector => element.kind === 'connector',
      )
      .map((connector) => ({viewId: view.id, viewName: view.name, connector})),
  );

export const findConnector = (
  project: Project,
  connectorId: string,
): ConnectorInfo | undefined =>
  allConnectors(project).find((info) => info.connector.id === connectorId);

// The connector at the other end, if the pairing is intact (both sides
// point at each other).
export const partnerOf = (
  project: Project,
  connector: StationConnector,
): ConnectorInfo | undefined => {
  if (!connector.pairedWith) {
    return undefined;
  }
  const partner = findConnector(project, connector.pairedWith.connectorId);
  return partner &&
    partner.viewId === connector.pairedWith.viewId &&
    partner.connector.pairedWith?.connectorId === connector.id
    ? partner
    : undefined;
};

const setPairing = (
  project: Project,
  links: Map<string, ConnectorRef | undefined>,
): Project => ({
  ...project,
  views: project.views.map((view) =>
    view.elements.some((element) => links.has(element.id))
      ? {
          ...view,
          elements: view.elements.map((element) =>
            element.kind === 'connector' && links.has(element.id)
              ? {...element, pairedWith: links.get(element.id)}
              : element,
          ),
        }
      : view,
  ),
});

// Removes the pairing of a connector on both sides.
export const unpairConnector = (
  project: Project,
  connectorId: string,
): Project => {
  const info = findConnector(project, connectorId);
  if (!info) {
    return project;
  }
  const links = new Map<string, ConnectorRef | undefined>([
    [connectorId, undefined],
  ]);
  const partnerId = info.connector.pairedWith?.connectorId;
  const partner = partnerId ? findConnector(project, partnerId) : undefined;
  if (partner?.connector.pairedWith?.connectorId === connectorId) {
    links.set(partner.connector.id, undefined);
  }
  return setPairing(project, links);
};

// Pairs two connectors with each other; their previous partners become
// unpaired.
export const pairConnectors = (
  project: Project,
  aId: string,
  bId: string,
): Project => {
  if (aId === bId) {
    return project;
  }
  let next = unpairConnector(unpairConnector(project, aId), bId);
  const a = findConnector(next, aId);
  const b = findConnector(next, bId);
  if (!a || !b) {
    return project;
  }
  next = setPairing(
    next,
    new Map([
      [aId, {viewId: b.viewId, connectorId: bId}],
      [bId, {viewId: a.viewId, connectorId: aId}],
    ]),
  );
  return next;
};
