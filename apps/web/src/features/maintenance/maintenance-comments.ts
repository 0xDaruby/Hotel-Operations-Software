import type { MaintenanceIssueType } from './maintenance';

// Observed symptoms and completed work stay separate; staff choose what matches.
export const maintenanceComments: Record<MaintenanceIssueType, {
  report: readonly string[];
  resolution: readonly string[];
}> = {
  air_conditioning: {
    report: ['AC is not cooling.', 'AC is leaking water.', 'AC does not turn on.'],
    resolution: ['AC filter cleaned.', 'AC drain cleared.', 'AC unit repaired.'],
  },
  furniture: {
    report: ['Bed frame is loose.', 'Chair is damaged.', 'Wardrobe door will not close.'],
    resolution: ['Bed frame tightened.', 'Damaged chair replaced.', 'Wardrobe hinges adjusted.'],
  },
  plumbing: {
    report: ['Tap is leaking.', 'Toilet will not flush.', 'Drain is blocked.'],
    resolution: ['Leaking tap repaired.', 'Toilet flush repaired.', 'Blocked drain cleared.'],
  },
  electrical: {
    report: ['Light is not working.', 'Socket is not working.', 'Power keeps tripping.'],
    resolution: ['Light bulb replaced.', 'Faulty socket replaced.', 'Electrical fault repaired.'],
  },
  other: { report: [], resolution: [] },
};
