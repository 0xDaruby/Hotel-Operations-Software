export function PageFoundation({ title, description }: { title: string; description: string }) {
  return (
    <section className="foundation-panel">
      <span className="foundation-mark" aria-hidden="true">✓</span>
      <div>
        <p className="foundation-label">Workspace foundation</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
