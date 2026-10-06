// Pending inspections enter the Manager attention queue after two hours.
// These shared cutoffs keep the overview and navigation badge consistent.
export const INSPECTION_WAITING_THRESHOLD_MS = 2 * 60 * 60 * 1000;
export const MAINTENANCE_BLOCKED_THRESHOLD_MS = 0;
