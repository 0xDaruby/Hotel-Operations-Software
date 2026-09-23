'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="ops-dialog" onClose={onClose} aria-label={title}>
      <div className="ops-dialog-head">
        <h3>{title}</h3>
        <button type="button" className="ops-dialog-close" onClick={onClose}>Close</button>
      </div>
      <div className="ops-dialog-body">{children}</div>
    </dialog>
  );
}
