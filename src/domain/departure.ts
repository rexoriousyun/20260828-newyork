/**
 * Departure advice: "when do I need to leave?" (J-01).
 *
 * The rider works backwards from an arrival time, often one with a penalty
 * attached. Today they buy blanket insurance — U-02 leaves twenty minutes
 * early every day, about an hour a week of unpaid buffer. The job here is to
 * replace that guess with the two numbers we can actually stand behind.
 *
 * **What this model covers, and what it does not.** The reliability layer
 * measures *logged* TTC disruptions: how often one lands on a journey, and
 * what it costs when it does. It says nothing about whether a bus that is not
 * disrupted runs to its timetable. So the advice is never phrased as a
 * percentile of arrival time — a model that sees only big events would put the
 * 90th percentile at the scheduled time and tell a rider with a deadline to
 * leave with no buffer at all. That is the single confident ETA J-01 names as
 * the failure case, dressed as statistics.
 *
 * Instead we state both outcomes and let the rider choose the buffer:
 * the normal arrival, the disrupted arrival with its rate, and the departure
 * that would cover a disrupted morning too.
 */

/**
 * Percentile of the pooled severity distribution used for the covered
 * departure. Registered here rather than argued in the write-up: a rider with
 * a hard deadline has asymmetric tolerance and plans by the tail (E-L03), so
 * "covered" means covered on all but the worst tenth of bad mornings, not on
 * the median bad morning.
 */
export const COVERED_SEVERITY_PERCENTILE = 90;

/**
 * There is deliberately no threshold at which this recommends a buffer.
 *
 * The first build had one — recommend the earlier departure above roughly one
 * disruption in two hundred trips — and it immediately produced advice no
 * honest person would give: leave 58 minutes earlier every morning to cover
 * something that happens twice a year. Rewriting it as expected value fails
 * the other way, because the expected cost of a disruption is a fraction of a
 * minute and no buffer is ever "worth it".
 *
 * Neither is wrong arithmetic; the recommendation is the wrong act. What a
 * buffer is worth depends on what being late costs *this* rider, and that
 * varies from an annoyance to a missed shift and a warning (U-02). We know the
 * rate and the price. They know the penalty. So the advice states both numbers
 * and stops — which is what U-02 needs from us: an honest number and
 * permission to act on it, not an instruction.
 */

export interface DepartureAdvice {
  /** Latest departure that still meets the deadline on a normal day. */
  leaveAt: number;
  /** Arrival on a normal day. */
  arriveAt: number;
  /** Minutes to spare on a normal day. Negative if this option cannot make it. */
  slackMinutes: number;
  /** Arrival on a morning that goes wrong, and how often that is. */
  disrupted: { arriveAt: number; oneInTrips: number | null } | null;
  /** Departure that would also make the deadline on a disrupted morning. */
  covered: { leaveAt: number; extraMinutes: number } | null;
}

/**
 * Turn a planned journey and a deadline into advice.
 *
 * All times are seconds since midnight, in the service day the journey was
 * planned in.
 */
export function departureAdvice(input: {
  departAt: number;
  arriveAt: number;
  arriveBy: number;
  disruptionRisk: number;
  oneInTrips: number | null;
  /** Pooled severity at COVERED_SEVERITY_PERCENTILE, in minutes. */
  severityCoveredMinutes: number;
  /** Pooled median severity, in minutes — the typical bad morning. */
  severityTypicalMinutes: number;
}): DepartureAdvice {
  const slackMinutes = Math.round((input.arriveBy - input.arriveAt) / 60);

  const disrupted =
    input.disruptionRisk > 0
      ? {
          arriveAt: input.arriveAt + input.severityTypicalMinutes * 60,
          oneInTrips: input.oneInTrips,
        }
      : null;

  // The covered departure is only meaningful when a disruption would actually
  // make the rider late. If the normal arrival already leaves more slack than a
  // bad morning costs, there is nothing to buy.
  //
  // **And only when the trip works on an ordinary day.** With negative slack the
  // arithmetic silently folded the trip's everyday shortfall into the figure: an
  // option already 34 minutes late was offered a "93 min earlier" buffer sitting
  // directly under the disruption it appeared to answer, when 34 of those
  // minutes were owed every single morning and had nothing to do with it. An
  // option that cannot make the deadline needs a different sentence, not a
  // padded one — and it already has it, in the line saying nothing this way
  // makes it.
  const coveredLeaveAt = input.departAt + (input.arriveBy - input.arriveAt) - input.severityCoveredMinutes * 60;
  const extraMinutes = Math.round((input.departAt - coveredLeaveAt) / 60);
  const covered =
    input.disruptionRisk > 0 && extraMinutes > 0 && slackMinutes >= 0
      ? { leaveAt: coveredLeaveAt, extraMinutes }
      : null;

  return {
    leaveAt: input.departAt,
    arriveAt: input.arriveAt,
    slackMinutes,
    disrupted,
    covered,
  };
}

/**
 * The latest departure whose earliest arrival still meets the deadline.
 *
 * The planner runs in single-digit milliseconds warm, which makes a couple of
 * dozen probes cheaper than the alternative of planning forward from an
 * arbitrary time and hoping it lands.
 */
export function latestDeparture(
  arriveBy: number,
  searchWindowSeconds: number,
  arrivalFor: (departAt: number) => number | null,
  toleranceSeconds = 60,
): { departAt: number; arriveAt: number } | null {
  // Widen until a departure is found, rather than searching one fixed lookback.
  //
  // **A fixed window broke monotonicity, and badly.** Looking back only three
  // hours from the deadline meant that arriving by 03:34 found an overnight bus
  // leaving at 00:34, and arriving by 03:34:01 found nothing at all — the same
  // departure, now four seconds outside the window. Loosening a deadline was
  // turning a working trip into "no journey", across the whole 03:34-06:00
  // range on a route where service plainly existed. A later deadline is a
  // strictly weaker constraint and must never return fewer options.
  //
  // Doubling keeps the common case at one probe and bounds the rare one: an
  // overnight trip may sit many hours behind its deadline, and the caller's own
  // service window stops the search running away.
  for (let window = searchWindowSeconds; ; window *= 2) {
    const lo = Math.max(0, arriveBy - window);
    const at = arrivalFor(lo);
    if (at !== null && at <= arriveBy) return bisect(lo, arriveBy, arriveBy, arrivalFor, toleranceSeconds);
    if (lo === 0 || window > MAX_LOOKBACK_S) return null;
  }
}

/** How far back a deadline may reach before we accept there is nothing. */
const MAX_LOOKBACK_S = 24 * 3600;

/**
 * The latest departure in [lo, hi] that still arrives by the deadline.
 *
 * Earliest arrival is monotone non-decreasing in departure time, so this is a
 * binary search rather than a scan.
 */
function bisect(
  lo: number,
  hi: number,
  arriveBy: number,
  arrivalFor: (departAt: number) => number | null,
  toleranceSeconds: number,
): { departAt: number; arriveAt: number } | null {
  const at = arrivalFor(lo);
  if (at === null || at > arriveBy) return null;
  let best = { departAt: lo, arriveAt: at };
  let low = lo;
  let high = hi;
  while (high - low > toleranceSeconds) {
    const mid = Math.floor((low + high) / 2);
    const arrival = arrivalFor(mid);
    if (arrival !== null && arrival <= arriveBy) {
      best = { departAt: mid, arriveAt: arrival };
      low = mid;
    } else {
      high = mid;
    }
  }
  return best;
}
