'use client';

import { useEffect, useId, useRef } from 'react';

type DiscardConfirmationProps = {
  title?: string;
  onKeepEditing: () => void;
  onDiscard: () => void;
};

/** A separate native modal keeps confirmation actions outside the editable form. */
export function DiscardConfirmation({ title = 'Discard your changes?', onKeepEditing, onDiscard }: DiscardConfirmationProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={ref} className="discard-confirmation" role="alertdialog" aria-modal="true"
      aria-labelledby={titleId} aria-describedby={descriptionId}
      onClose={(event) => event.stopPropagation()}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onKeepEditing(); }}>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>Your unsaved entries will be lost.</p>
      <div className="discard-confirmation-actions">
        <button type="button" className="button button-primary" autoFocus onClick={(event) => { event.preventDefault(); onKeepEditing(); }}>Keep editing</button>
        <button type="button" className="discard-confirmation-delete" onClick={(event) => { event.preventDefault(); onDiscard(); }}>Discard changes</button>
      </div>
    </dialog>
  );
}
