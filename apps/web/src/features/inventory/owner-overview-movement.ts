import type { OwnerPaymentObservation } from './owner-overview-payments';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const LAGOS_UTC_OFFSET = '+01:00';

type OwnerMovementEvent = { action: string };
type ActiveStayDeadline = { departure_due_at: string };
type OwnerMovementPayment = OwnerPaymentObservation & {
  kind: 'initial' | 'extension';
};

export type OwnerMovement = {
  arrivals: number;
  departures: number;
  extensions: number;
  departuresDueSoon: number;
  initialPayments: number;
  extensionPayments: number;
};

export function getLagosOperatingDayBounds(date: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError('Expected a valid operating date in YYYY-MM-DD format.');
  }

  const calendarDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) {
    throw new RangeError('Expected a valid operating date in YYYY-MM-DD format.');
  }

  const startDate = new Date(`${date}T00:00:00.000${LAGOS_UTC_OFFSET}`);
  return {
    start: startDate.toISOString(),
    end: new Date(startDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function summarizeOwnerMovement(input: {
  events: OwnerMovementEvent[];
  activeStays: ActiveStayDeadline[];
  payments: OwnerMovementPayment[];
  now: string;
  today: string;
}): OwnerMovement {
  const now = new Date(input.now).getTime();
  const totals = input.events.reduce((result, event) => {
    if (event.action === 'stay.arrived') result.arrivals += 1;
    if (event.action === 'stay.departed') result.departures += 1;
    if (event.action === 'stay.extended') result.extensions += 1;
    return result;
  }, { arrivals: 0, departures: 0, extensions: 0 });

  const payments = input.payments.reduce((result, payment) => {
    const stay = Array.isArray(payment.stays) ? payment.stays[0] : payment.stays;
    const amount = Number(payment.amount);
    if (payment.received_on !== input.today || stay?.status === 'void' || !Number.isFinite(amount)) return result;
    if (payment.kind === 'initial') result.initialPayments += amount;
    if (payment.kind === 'extension') result.extensionPayments += amount;
    return result;
  }, { initialPayments: 0, extensionPayments: 0 });

  return {
    ...totals,
    departuresDueSoon: input.activeStays.filter((stay) => {
      const dueAt = new Date(stay.departure_due_at).getTime();
      return Number.isFinite(dueAt) && dueAt >= now && dueAt <= now + FOUR_HOURS_MS;
    }).length,
    ...payments,
  };
}