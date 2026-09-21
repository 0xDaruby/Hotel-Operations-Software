'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatNaira } from './format';
import type { PaymentRecord } from './stays';

type PaymentsViewProps = {
  payments: (PaymentRecord & { roomNumber: string })[];
  total: number;
  date: string;
  today: string;
};

export function PaymentsView({ payments, total, date, today }: PaymentsViewProps) {
  const router = useRouter();
  const [selected, setSelected] = useState(date);

  function go(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selected)) return;
    router.push(`/payments?date=${selected}`);
  }

  return (
    <section aria-labelledby="payments-heading">
      <div className="inventory-intro">
        <div>
          <p className="eyebrow">Payments received</p>
          <h2 id="payments-heading">{formatNaira(total)} recorded on {date}</h2>
        </div>
        <p>Arrival and extension payments are recorded separately on the day money is received. Voided stays are excluded.</p>
      </div>
      <form className="payments-date" onSubmit={go}>
        <label className="inventory-field">
          <span>Day</span>
          <input type="date" value={selected} max={today} onChange={(event) => setSelected(event.target.value)} />
        </label>
        <button className="button button-secondary" type="submit">View day</button>
        {date !== today ? (
          <button className="text-button" type="button" onClick={() => router.push('/payments')}>Back to today</button>
        ) : null}
      </form>
      {payments.length ? (
        <table className="payments-table">
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
      ) : (
        <div className="inventory-empty" role="status">
          <h2>No payments recorded on {date}</h2>
          <p>Arrival and extension payments for this day will appear here once recorded.</p>
        </div>
      )}
    </section>
  );
}
