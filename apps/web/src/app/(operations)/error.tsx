'use client';

export default function OperationsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="inventory-empty" role="alert">
      <h2>We could not load this workspace</h2>
      <p>Check your connection or access, then try again.</p>
      <button className="button button-primary" onClick={reset} type="button">Try again</button>
    </section>
  );
}
