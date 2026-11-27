import { recordedTimeDemo } from './recorded-time-demo';
import type { TimelineLoadResult } from './timeline-query';
import type { TimelineData } from '../components/monthly-timeline';

/** The timeline preview uses the same fictional public snapshot as the recap. */
export function savedTimelineDemo(): TimelineData {
  return structuredClone(recordedTimeDemo.hours);
}

/** Fictional hours and days snapshot, without raw session details. */
export function savedTimePlayedDemo(): TimelineLoadResult {
  return { ok: true, data: structuredClone(recordedTimeDemo.hours), daysData: structuredClone(recordedTimeDemo.days), sessionCount: recordedTimeDemo.sessionCount, message: 'Fictional demo hours and days played.' };
}
