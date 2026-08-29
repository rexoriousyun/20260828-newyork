/**
 * The wait itself: how long you stand there, and what one no-show costs.
 *
 * The step list already shows the gap the plan puts a rider at the stop for
 * (D-22) — "Wait at Eglinton Ave West at Jane St · 5 min". That number is the
 * schedule's promise, and PR-08 is the observation that riders have learned
 * not to believe it. Nothing on the screen says what happens when the promise
 * breaks, which is the whole subject of this app.
 *
 * **The missing number is the headway.** If the bus is late, five minutes
 * becomes eight. If it never comes at all — 36.1% of all rider-waiting, and
 * 74% of it on the 31 Greenwood (E-D23) — five minutes becomes five plus the
 * headway, and no amount of waiting shortens it. On a route running every six
 * minutes that is an annoyance; on one running every 26 it is the difference
 * between a shift made and a shift missed, and for a third of the year it is
 * a decision about standing outside (PR-13).
 *
 * **Why the schedule and not the archive.** `D-11` measured that mean wait
 * does not persist per segment — rho = 0.10, against 0.68 for exposure. So a
 * "typical wait here" derived from incident history would be noise formatted
 * as precision, which P-08 forbids. The headway is not that quantity: it is a
 * published fact about the timetable, exact for the band it describes, and it
 * bounds the cost of a vehicle that never arrives without predicting anything.
 *
 * Serves U-02, whose stated optimisation is "whether the trip is viable at
 * all, and how long they will be outside", under P-02 — measure the wait, not
 * the vehicle.
 */

import { key, WEEKDAYS_PER_MONTH, type SegmentFrequency } from "./frequency.js";
import { isSubwayRoute, stationFromPlatform } from "./stations.js";
import { bandOfSeconds, type Band } from "./time-bands.js";
import type { Leg } from "./csa.js";

/**
 * Trips a band must carry before its mean gap is called a headway.
 *
 * Pre-registered here rather than in the write-up. Dividing a band's length by
 * the trips inside it describes the *band* when there are only one or two of
 * them: two trips in the six-hour night band yields "every 180 minutes", which
 * is arithmetic, not service. Four is the smallest count that leaves three
 * gaps inside the band for the mean to be a mean of.
 *
 * Below it the honest answer is that we are not going to state a typical gap
 * (P-03) — not that service is infinitely sparse.
 */
export const MIN_TRIPS_IN_BAND = 4;

/**
 * Typical minutes between vehicles on one segment, in one band.
 *
 * Keyed on the segment rather than the stop because direction matters: a rider
 * at Yonge and Eglinton is not waiting for "a 97", they are waiting for one
 * going their way, and the northbound and southbound trips through that stop
 * are different service. The segment key already carries that distinction.
 *
 * Null when the band is too thin to describe.
 */
export function headwayMinutes(
  frequency: SegmentFrequency,
  routeId: string,
  fromStopId: string,
  toStopId: string,
  band: Band,
): number | null {
  const perMonth = frequency.tripsPerMonthInBand.get(
    `${key(routeId, fromStopId, toStopId)}|${band.id}`,
  );
  if (perMonth === undefined) return null;
  const perWeekday = perMonth / WEEKDAYS_PER_MONTH;
  if (perWeekday < MIN_TRIPS_IN_BAND) return null;
  return ((band.to - band.from) * 60) / perWeekday;
}

/**
 * The headway at which a vehicle failing to arrive changes the rider's plan.
 *
 * Pre-registered, and anchored to our own measurement rather than to a round
 * number. `E-D13` puts the pooled surface wait *once an incident occurs* at a
 * p50 of 24 minutes. At a headway of 20 the timetable alone hands a rider
 * something of that size the moment one vehicle does not turn up — a bad-day
 * wait with no bad day required. Below it the next vehicle absorbs the loss
 * inside the noise of the trip.
 *
 * The TTC's own frequent-service standard of ten minutes is the other candidate
 * and was rejected on measurement, not on taste: ten minutes is the *median*
 * headway behind a weekday departure (E-D24), so a tag at that line would fire
 * on roughly half of all service and carry no information. At twenty it fires
 * on 25.0%, and on 74.3% of night departures — which is the population it
 * exists for.
 */
export const NOTABLE_HEADWAY_MINUTES = 20;

/** What a rider is in for at one stop on this trip. */
export interface WaitAtStop {
  /** Index of the leg boarded after this wait. */
  legIndex: number;
  /** The gap the plan actually puts them at the stop for. */
  scheduledMinutes: number;
  /** Typical gap between vehicles here, or null when the band is too thin. */
  headwayMinutes: number | null;
  /** Which band the headway describes, so the claim can be checked (P-08). */
  bandLabel: string;
  /** True when this wait happens at a street stop rather than on a platform. */
  outdoors: boolean;
}

/**
 * Every wait on a journey, with the headway behind it.
 *
 * The first leg has no wait: a rider does not stand at their origin, they
 * leave the house at a time, which is D-24's subject rather than this one's.
 */
export function waitsOn(
  legs: readonly Leg[],
  frequency: SegmentFrequency,
): WaitAtStop[] {
  const waits: WaitAtStop[] = [];
  for (let i = 1; i < legs.length; i++) {
    const leg = legs[i]!;
    const prev = legs[i - 1]!;
    const seconds = leg.departAt - prev.arriveAt;
    if (seconds <= 0) continue;
    const band = bandOfSeconds(leg.departAt);
    const ride = leg.kind === "ride" && leg.routeId !== undefined;
    const next = leg.stopIds?.[1];
    waits.push({
      legIndex: i,
      scheduledMinutes: Math.round(seconds / 60),
      headwayMinutes:
        ride && next !== undefined
          ? headwayMinutes(frequency, leg.routeId!, leg.fromStop, next, band)
          : null,
      bandLabel: band.label,
      // Waiting to board a subway train happens on a platform; waiting for
      // anything else happens on a street. Toronto plans 100 heated shelter
      // kits over seven years (E-L11), so we do not know which street stops
      // are sheltered and must not imply that we do — this says outside, and
      // nothing about what is over your head.
      outdoors: !(ride && isSubwayRoute(leg.routeId!)),
    });
  }
  return waits;
}

/**
 * The wait on this trip whose headway is worth telling the rider about.
 *
 * Decided here rather than in the web app on purpose. A threshold duplicated
 * across the two projects has already gone wrong once — `MATERIAL_RATIO` was
 * copied into the browser under a comment claiming it was shared, and the two
 * were free to drift silently. The server owns every verdict; the client
 * renders it.
 *
 * The worst one, not all of them: a rider needs to know the trip has a fragile
 * wait in it, and the tag row is a summary (D-33). The full set is in the
 * steps.
 */
export function notableWait(waits: readonly WaitAtStop[]): WaitAtStop | null {
  let worst: WaitAtStop | null = null;
  for (const w of waits) {
    if (w.headwayMinutes === null || w.headwayMinutes < NOTABLE_HEADWAY_MINUTES) continue;
    if (worst === null || w.headwayMinutes > worst.headwayMinutes!) worst = w;
  }
  return worst;
}

/**
 * Minutes of this trip spent outside: waiting at street stops, plus walking.
 *
 * U-02 optimises "whether the trip is viable at all, and how long they will be
 * outside". The app has never stated the second half. A 47-minute trip that is
 * 6 minutes outside and a 47-minute trip that is 31 minutes outside are the
 * same number today and different decisions in January (PR-13).
 *
 * Deliberately not folded into risk. It is a duration, not a probability, and
 * blending a comfort cost into a reliability score is the mistake P-05 refuses
 * for accessibility and D-11 refuses for severity.
 *
 * **Not every walk is outside.** Changing from Line 1 to Line 2 at St George is
 * a footpath in the graph and a corridor in life. Counting it added five
 * minutes of January to a trip that never left the station — a wrong number of
 * exactly the kind PR-08 says riders have already learned to distrust. A walk
 * between two platforms of the same station is indoors; everything else is
 * treated as outside, which errs toward the honest direction.
 */
export function outsideMinutes(
  legs: readonly Leg[],
  waits: readonly WaitAtStop[],
  stopName: (id: string) => string,
): number {
  let seconds = 0;
  for (const l of legs) {
    if (l.kind !== "walk") continue;
    const a = stationFromPlatform(stopName(l.fromStop));
    const b = stationFromPlatform(stopName(l.toStop));
    if (a !== "" && a === b) continue;
    seconds += l.arriveAt - l.departAt;
  }
  let minutes = Math.round(seconds / 60);
  for (const w of waits) if (w.outdoors) minutes += w.scheduledMinutes;
  return minutes;
}
