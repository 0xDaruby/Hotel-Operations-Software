import type { ActivityDetails } from './activity-details';

export function ActivityEventDetails({ details }: { details: ActivityDetails }) {
  return (
    <div className="activity-event-details">
      {details.items.length ? (
        <dl className="activity-facts">
          {details.items.map(item => (
            <div className="activity-fact" key={item.label}>
              <dt>{item.label}</dt>
              <dd>
                {item.previous !== undefined ? (
                  <span className="activity-value-change">
                    <span className="activity-previous"><span className="sr-only">Previously: </span>{item.previous}</span>
                    <span className="activity-change-arrow" aria-hidden="true">→</span>
                    <strong><span className="sr-only">Now: </span>{item.value}</strong>
                  </span>
                ) : item.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {details.note ? <p className="activity-reason"><strong>Reason</strong>{details.note}</p> : null}
    </div>
  );
}
