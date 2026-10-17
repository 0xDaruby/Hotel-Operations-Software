'use client';

import { useEffect, useRef, useState, type FormEventHandler, type ReactNode } from 'react';
import { Dialog } from './dialog';
import { DiscardConfirmation } from './discard-confirmation';

type TaskSheetProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  dirty: boolean;
  pending: boolean;
  submitLabel?: string;
  canSubmit?: boolean;
  closeLabel?: string;
};

/** Short operational forms share one responsive surface and dismissal contract. */
export function TaskSheet({ title, children, onClose, onSubmit, dirty, pending, submitLabel, canSubmit = true, closeLabel = 'Cancel' }: TaskSheetProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fields = useRef<HTMLFieldSetElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (wasConfirming.current && !confirmDiscard) {
      fields.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    }
    wasConfirming.current = confirmDiscard;
  }, [confirmDiscard]);

  function requestClose() {
    if (pending) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  return (
    <Dialog open title={title} presentation="sheet" onClose={requestClose} closeDisabled={pending}>
      <form className="task-sheet-form" aria-busy={pending} onSubmit={(event) => {
        if (pending || confirmDiscard || !canSubmit || !submitLabel) { event.preventDefault(); return; }
        onSubmit(event);
      }}>
        <div className="task-sheet-fields" inert={confirmDiscard}>
          <fieldset ref={fields} className="task-sheet-inputs" disabled={pending}>{children}</fieldset>
        </div>
          <div className="task-sheet-footer" inert={confirmDiscard}>
            <button type="button" className="task-sheet-cancel" disabled={pending} onClick={requestClose}>{closeLabel}</button>
            {submitLabel ? <button type="submit" className="button button-primary" disabled={pending || !canSubmit}>{submitLabel}</button> : null}
          </div>
      </form>
      {confirmDiscard ? <DiscardConfirmation onKeepEditing={() => setConfirmDiscard(false)} onDiscard={onClose} /> : null}
    </Dialog>
  );
}
