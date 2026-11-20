// Text stays upright in rotated station panels (full layout view): the panel
// tells its shapes how far it is turned, and each label or marker is turned
// back about its own centre. Outside the full view the rotation is 0.
import {createContext, useContext} from 'react';
import {Direction, rotateDirection} from '../../../model/geometry';

export const PanelRotationContext = createContext(0);

// SVG transform that cancels the panel's rotation about (x, y), or
// undefined when the panel is not turned.
export const useUpright = (): ((
  x: number,
  y: number,
) => string | undefined) => {
  const rotation = useContext(PanelRotationContext);
  return (x, y) => (rotation ? `rotate(${-rotation} ${x} ${y})` : undefined);
};

// A direction of the view as it appears on screen in the turned panel
// (rotation is clockwise on screen; directions count counter-clockwise).
export const useScreenDirection = (): ((d: Direction) => Direction) => {
  const rotation = useContext(PanelRotationContext);
  return (d) => (rotation ? rotateDirection(d, (-rotation / 90) * 2) : d);
};
