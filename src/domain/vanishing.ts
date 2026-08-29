/**
 * The vehicle that never came.
 *
 * Every reliability figure in this app until now has been one undifferentiated
 * number: how often a trip "goes wrong". But two failures hide inside it and a
 * rider mitigates them differently. A *late* bus arrives eventually — you wait,
 * and waiting works. A *cancelled* bus, one sent on diversion, one taken away
 * to run a shuttle, or one with no operator rostered, never arrives at all —
 * waiting does not work, and the only mitigation is a different plan.
 *
 * **This is 36% of all rider-waiting in the archive**, and on some bus routes
 * close to three quarters of it. It is also flat across the day, between 33%
 * and 38% in every band, so it is not a night-time problem — it is the ordinary
 * condition of the surface network. On Lines 1 and 2 it is zero: trains are
 * late, buses disappear.
 *
 * Naming it is the point. "Sometimes the bus just never comes" is what riders
 * already say to each other, and no public tool tells them which routes do it.
 */

/**
 * Codes where the vehicle a rider is waiting for does not turn up.
 *
 * Read off the TTC's own code list and kept narrow: a collision, a mechanical
 * fault or a held vehicle all end with something arriving, however late, and
 * they belong on the other side of the line. Diversion is included because a
 * bus routed around your stop is, from the stop, indistinguishable from one
 * that was cancelled.
 */
export const NEVER_CAME_CODES: ReadonlySet<string> = new Set([
  "EFCAN", // cancellation
  "MFDV", "MTDV", // on diversion — it went a different way
  "MFSH", // used as shuttle bus — taken off the route
  "MFESA", "MTESA", "MUESA", // no operator/crew available, ESA related
  "MTNOA", "MUNOA", "TFCNO", "TUNOA", // no operator available
  "MFTO", // ill operator and non-chargeable operator issues
]);

export function neverCame(code: string): boolean {
  return NEVER_CAME_CODES.has(code);
}

/**
 * Share of waiting minutes caused by a vehicle that never came.
 *
 * Weighted by the minutes each incident cost, not by incident count: one
 * cancellation on a half-hourly route costs a rider far more than three short
 * delays, and counting events would flatter exactly the routes this is meant to
 * expose.
 */
export function neverCameShare(
  incidents: ReadonlyArray<{ code: string; weightedMinutes: number }>,
): number | null {
  let never = 0;
  let total = 0;
  for (const i of incidents) {
    total += i.weightedMinutes;
    if (neverCame(i.code)) never += i.weightedMinutes;
  }
  // No waiting recorded is not the same as none of it being this kind.
  return total <= 0 ? null : Number((never / total).toFixed(3));
}

/**
 * Whether the share is worth telling a rider about.
 *
 * The network average is 36%, so saying it everywhere would say nothing. Half
 * is the point at which waiting stops being the right response to this route
 * more often than not, which is the moment the advice changes.
 */
export const NEVER_CAME_NOTABLE = 0.5;
