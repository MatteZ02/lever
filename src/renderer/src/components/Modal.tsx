// A small modal dialog. It closes only with its buttons: Esc is STOP
// (decided by the user, 2026-11-17).
import {ReactNode, useEffect, useRef} from 'react';

export const Modal = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
  }, []);
  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
};
