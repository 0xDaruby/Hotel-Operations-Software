export function toLagosDate(iso: string) {
  if (!iso) return '';
  let d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (!iso.endsWith('Z') && iso.length >= 19) d = new Date(`${iso.slice(0, 19)}Z`);
  const shifted = new Date(d.getTime() + 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function formatNaira(amount: number) {
  return `₦${amount.toLocaleString('en-NG')}`;
}

export function formatDateTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${toLagosDate(iso)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatDateLabel(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function deadlineFromNow(paidDays: number, from = Date.now()) {
  return new Date(from + 24 * 60 * 60 * 1000 * paidDays).toISOString();
}

export function deadlineFrom(iso: string, addedDays: number) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 24 * 60 * 60 * 1000 * addedDays).toISOString();
}
