/**
 * Clock times, in the service day the schedule uses.
 *
 * GTFS runs past midnight, so a journey's seconds can read 25:14. Every screen
 * wrapped that with `% 24` and printed "01:14" — correct, and silently
 * ambiguous on a trip that crosses midnight. A rider finishing a shift at 23:30
 * saw "23:33 → 00:22" with nothing saying the arrival is tomorrow, and a longer
 * overnight trip would read identically.
 *
 * The wrap stays: nobody wants to be told to catch the 25:14. What is added is
 * the one bit the wrap destroys.
 */

const DAY = 24 * 3600;

export function hhmm(seconds: number): string {
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** True when this time falls on the day after the one the trip started in. */
export function isNextDay(seconds: number, relativeTo: number): boolean {
  return Math.floor(seconds / DAY) > Math.floor(relativeTo / DAY);
}

/**
 * A time, marked when it lands on the next day.
 *
 * "+1" rather than a word: it sits inline beside a time in a tight column, and
 * every transit timetable in the world already uses it.
 */
export function hhmmDay(seconds: number, relativeTo: number): string {
  return isNextDay(seconds, relativeTo) ? `${hhmm(seconds)} +1` : hhmm(seconds);
}
