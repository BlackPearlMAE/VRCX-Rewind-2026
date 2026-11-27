import type { TimelineData } from '../components/monthly-timeline';

export interface PlaySessionSample {
  id: string;
  startedAt: string;
  endedAt: string;
}

/** Synthetic development data; never a claim about the imported user's sessions. */
export interface TimePlayedSessionData {
  source: 'synthetic';
  timeZone: 'Europe/Berlin';
  coverage: { start: string; endExclusive: string };
  sessions: readonly PlaySessionSample[];
  summary: {
    totalHours: number;
    fullDaysEquivalent: number;
    percentOfYear: number;
    activeDays: number;
    sessionCount: number;
    averageSessionHours: number;
    longestSessionHours: number;
  };
  months: readonly { month: number; totalHours: number; activeDays: number; sessionCount: number }[];
}

/** Owner-authorized snapshot containing bucket counts only, never activity rows. */
export interface DaysPlayedData {
  source: 'recorded-aggregate';
  coverage: { start: string; endExclusive: string };
  timeline: TimelineData;
}
