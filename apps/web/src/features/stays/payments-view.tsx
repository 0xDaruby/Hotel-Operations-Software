import Link from 'next/link';
import { Wallet02Icon } from '@/components/icons';
import { formatNaira } from './format';
import type { PaymentRecord } from './stays';

type PaymentsViewProps = {
  payments: (PaymentRecord & { roomNumber: string })[];
  total: number;
  date: string;
  today: string;
};

export function PaymentsView({ payments, total, date, today }: PaymentsViewProps) {
  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });

  return (
    <section aria-labelledby="payments-heading">
      <div className="inventory-intro">
        <div>
          <h2 id="payments-heading" className="payments-heading"><Wallet02Icon className="icon icon-lg icon-brand-action" aria-hidden="true" />{formatNaira(total)} recorded on {dateLabel}</h2>
        </div>
      </div>
      <form className="payments-date" action="/payments" method="get">
        <label className="inventory-field">
          <span>Day</span>
          <input key={date} name="date" type="date" defaultValue={date} max={today} required />
        </label>
        <button className="button button-secondary" type="submit">View day</button>
        {date !== today ? (
          <Link className="text-button" href="/payments">Back to today</Link>
        ) : null}
      </form>
      {payments.length ? (
        <div className="payments-table-scroll" role="region" aria-label="Payments recorded" tabIndex={0}>
        <table className="payments-table">
          <caption className="sr-only">Payments recorded on {dateLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Room</th>
              <th scope="col">Type</th>
              <th scope="col">Amount</th>
              <th scope="col">Received on</th>
              <th scope="col">Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.roomNumber}</td>
                <td><span className="status-badge status-neutral">{payment.kind}</span></td>
                <td>{formatNaira(payment.amount)}</td>
                <td>{payment.receivedOn}</td>
                <td>{payment.createdByName}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td />
              <td>{formatNaira(total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
        </div>
      ) : (
        <div className="inventory-empty" role="status">
          <h2>No payments recorded on {dateLabel}</h2>
          <p>Arrival and extension payments for this day will appear here once recorded.</p>
        </div>
      )}
    </section>
  );
}
