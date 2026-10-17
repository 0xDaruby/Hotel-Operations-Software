'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { XIcon } from '@/components/icons';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  presentation?: 'dialog' | 'sheet';
  closeDisabled?: boolean;
};

export function Dialog({ open, onClose, title, children, presentation = 'dialog', closeDisabled = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropPointerDown = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open || presentation !== 'sheet') return;
    const el = ref.current;
    const viewport = window.visualViewport;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function resize() {
      el?.style.setProperty('--sheet-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      el?.style.setProperty('--sheet-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    }
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
    };
  }, [open, presentation]);

  return (
    <dialog ref={ref} className={`ops-dialog${presentation === 'sheet' ? ' ops-sheet' : ''}`} onClose={onClose}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        backdropPointerDown.current = event.target === event.currentTarget &&
          (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
      }}
      onPointerCancel={() => { backdropPointerDown.current = false; }}
      onClick={(event) => {
        const startedOnBackdrop = backdropPointerDown.current;
        backdropPointerDown.current = false;
        if (presentation !== 'sheet' || closeDisabled || !startedOnBackdrop || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      onCancel={(event) => {
        if (presentation === 'sheet') {
          event.preventDefault();
          if (!closeDisabled) onClose();
        }
      }} aria-label={title}>
      <div className="ops-dialog-head">
        <h3 tabIndex={presentation === 'sheet' ? -1 : undefined} autoFocus={presentation === 'sheet'}>{title}</h3>
        <button type="button" className="ops-dialog-close" onClick={onClose} disabled={closeDisabled} aria-label="Close"><XIcon className="icon icon-md" aria-hidden="true" /></button>
      </div>
      <div className="ops-dialog-body">{children}</div>
    </dialog>
  );
}
