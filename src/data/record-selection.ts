import { daysAttendanceRecord } from './days-attendance-record';
import { recordDefinitions, type RecordPageData } from './record-pages';

export interface SelectedRecord { record: RecordPageData; sortDate: number }
interface Plan { entries: SelectedRecord[]; priority: number; monthMask: number }

/** Keep real maxima and all ties. Choose up to eight candidates, then order by a winning date. */
export function selectRecordSequence(records: readonly RecordPageData[], limit = 8): SelectedRecord[] {
  const maximum = Math.max(0, Math.min(8, Math.floor(limit)));
  let states = new Map<string, Plan>([['0:0', { entries: [], priority: 0, monthMask: 0 }]]);
  recordDefinitions.forEach((definition, priorityIndex) => {
    const record = records.find(record => record.id === definition.id);
    if (!record || record.status !== 'ready' || !Number.isFinite(record.value) || record.value <= 0) return;
    if (record.id !== 'streak' && !record.timeline) return;
    const ranked = record.id === 'days' && record.timeline ? daysAttendanceRecord(record.timeline) : record;
    const year = record.year ?? record.timeline?.year ?? 2026;
    const ranges = record.ranges ?? (record.range ? [record.range] : []);
    const winningMonths = ranked.months ?? (ranked.month !== null ? [ranked.month] : []);
    const dates = record.id === 'streak'
      ? ranges.map(range => Date.parse(`${range.start}T00:00:00Z`))
      : winningMonths.map(month => Date.UTC(year, month, 1));
    const options = [...new Set(dates.filter(Number.isFinite))].sort((a, b) => a - b);
    if (!options.length) return;
    const next = new Map(states);
    for (const plan of states.values()) {
      if (plan.entries.length >= maximum) continue;
      for (const sortDate of options) {
        const monthMask = plan.monthMask | (1 << new Date(sortDate).getUTCMonth());
        const proposal: Plan = {
          entries: [...plan.entries, { record, sortDate }],
          priority: plan.priority + recordDefinitions.length - priorityIndex,
          monthMask,
        };
        const key = `${proposal.entries.length}:${monthMask}`;
        const previous = next.get(key);
        if (!previous || proposal.priority > previous.priority) next.set(key, proposal);
      }
    }
    states = next;
  });
  const countMonths = (mask: number) => mask.toString(2).replaceAll('0', '').length;
  const score = (plan: Plan) => plan.priority + countMonths(plan.monthMask) * 1.5;
  const spread = (plan: Plan) => {
    const dates = plan.entries.map(entry => entry.sortDate);
    return dates.length ? Math.max(...dates) - Math.min(...dates) : 0;
  };
  let best = states.get('0:0')!;
  for (const plan of states.values()) {
    if (plan.entries.length > best.entries.length || plan.entries.length === best.entries.length &&
      (score(plan) > score(best) || score(plan) === score(best) && spread(plan) > spread(best))) best = plan;
  }
  return [...best.entries].sort((a, b) => a.sortDate - b.sortDate ||
    recordDefinitions.findIndex(item => item.id === a.record.id) - recordDefinitions.findIndex(item => item.id === b.record.id));
}
