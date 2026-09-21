import { requireStaffProfile } from '@/features/auth/staff-profile';
import { PaymentsView } from '@/features/stays/payments-view';
import { getPaymentsForDate } from '@/features/stays/stays';
import { toLagosDate } from '@/features/stays/format';

type PaymentsPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  await requireStaffProfile(['owner']);
  const params = await searchParams;
  const today = toLagosDate(new Date().toISOString());
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const { payments, total } = await getPaymentsForDate(date);
  return <PaymentsView payments={payments} total={total} date={date} today={today} />;
}
