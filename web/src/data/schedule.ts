// EXPORTS: evaluatePolicy(p: IAppPolicy, now: Date): IPolicyVerdict, dateKey(d: Date): string
import type { IAppPolicy, ITimeWindow } from './types';

export interface IPolicyVerdict {
  restricted: boolean;
  reason: string;
}

function toMinutes(t: string): number {
  const parts = t.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function inWindow(t: number, w: ITimeWindow): boolean {
  return t >= toMinutes(w.start) && t < toMinutes(w.end);
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 依据当前时间判断策略是否应生效。
 * 顺序：未启用 → 周末放开 → 节假日放开 → 午休放开 → 工作时段限制 → 其余放开
 */
export function evaluatePolicy(p: IAppPolicy, now: Date): IPolicyVerdict {
  if (!p.enabled) return { restricted: false, reason: '策略未启用' };
  const day = now.getDay(); // 0=周日, 6=周六
  const isWeekend = day === 0 || day === 6;
  if (isWeekend && p.freeWeekends) return { restricted: false, reason: '周末放开' };
  if (p.freeHolidays && p.holidays.includes(dateKey(now))) {
    return { restricted: false, reason: '节假日放开' };
  }
  const t = now.getHours() * 60 + now.getMinutes();
  if (inWindow(t, p.lunch)) {
    return { restricted: false, reason: `午休放开（${p.lunch.start}-${p.lunch.end}）` };
  }
  const win = p.workWindows.find((w) => inWindow(t, w));
  if (win) return { restricted: true, reason: `工作时间限制（${win.start}-${win.end}）` };
  return { restricted: false, reason: '非工作时间放开' };
}
