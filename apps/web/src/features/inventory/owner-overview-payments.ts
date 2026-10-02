export type OwnerPaymentObservation = {
  amount: number | string;
  received_on: string;
  stays: { status?: string } | { status?: string }[] | null;
};

export type OwnerPaymentTotals = {
  today: number;
  yesterday: number;
};

export function getPreviousOperatingDate(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) {
    throw new RangeError('Expected a valid operating date in YYYY-MM-DD format.');
  }
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function summarizePaymentTotals(
  payments: OwnerPaymentObservation[],
  today: string,
  yesterday: string,
): OwnerPaymentTotals {
  return payments.reduce<OwnerPaymentTotals>((totals, payment) => {
    const stay = Array.isArray(payment.stays) ? payment.stays[0] : payment.stays;
    if (stay?.status === 'void') return totals;

    const amount = Number(payment.amount);
    if (!Number.isFinite(amount)) return totals;
    if (payment.received_on === today) totals.today += amount;
    else if (payment.received_on === yesterday) totals.yesterday += amount;
    return totals;
  }, { today: 0, yesterday: 0 });
}