/**
 * SLA utilities — central logic for SLA status, overdue computation, and formatting.
 * All calculations skip weekends (Saturday=6, Sunday=0).
 */

/** Returns true if date falls on Saturday or Sunday */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Add `hours` of business time to a start date, skipping weekends entirely.
 */
export function addBusinessHours(start: Date, hours: number): Date {
  const result = new Date(start);
  let remainingMs = hours * 60 * 60 * 1000;

  while (remainingMs > 0) {
    if (isWeekend(result)) {
      const daysToAdd = result.getDay() === 6 ? 2 : 1;
      result.setDate(result.getDate() + daysToAdd);
      result.setHours(0, 0, 0, 0);
      continue;
    }

    const endOfDay = new Date(result);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setHours(0, 0, 0, 0);
    const msUntilEndOfDay = endOfDay.getTime() - result.getTime();

    if (remainingMs <= msUntilEndOfDay) {
      result.setTime(result.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= msUntilEndOfDay;
      result.setTime(endOfDay.getTime());
    }
  }

  return result;
}

/**
 * Calculate remaining business-hours milliseconds between `now` and `due`,
 * skipping weekend time. Returns negative if overdue.
 */
export function getBusinessTimeDiffMs(now: Date, due: Date): number {
  if (now >= due) {
    return -getBusinessTimeDiffMs(due, now);
  }

  let totalMs = 0;
  const cursor = new Date(now);

  while (cursor < due) {
    if (isWeekend(cursor)) {
      const daysToAdd = cursor.getDay() === 6 ? 2 : 1;
      cursor.setDate(cursor.getDate() + daysToAdd);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }

    const endOfDay = new Date(cursor);
    endOfDay.setDate(endOfDay.getDate() + 1);
    endOfDay.setHours(0, 0, 0, 0);

    const segmentEnd = due < endOfDay ? due : endOfDay;
    totalMs += segmentEnd.getTime() - cursor.getTime();
    cursor.setTime(endOfDay.getTime());
  }

  return totalMs;
}

// ─── SLA Status Types ───────────────────────────────────────────────

export type SlaStatusLabel =
  | "on_time"
  | "due_soon"
  | "overdue"
  | "resolved_on_time"
  | "resolved_late"
  | "no_due_date"
  | "breached";

export type OverdueSeverity = "none" | "minor" | "moderate" | "critical";

export interface SlaStatus {
  label: SlaStatusLabel;
  /** Overdue duration in seconds (0 if not overdue). For open overdue tickets this is live-computed. */
  overdueSeconds: number;
  /** Business-time remaining in ms (positive = time left, negative = overdue). null if no due date. */
  remainingMs: number | null;
  /** Severity band based on overdue hours */
  severity: OverdueSeverity;
}

/**
 * Central SLA status computation.
 *
 * @param slaDueAt   - ISO string of the SLA due date
 * @param closedAt   - ISO string when ticket was closed/resolved (null if still open)
 * @param slaBreachedAt - ISO string if SLA was formally breached (null otherwise)
 * @param finalOverdueSeconds - stored final overdue seconds for closed tickets
 * @param status     - current ticket status
 */
export function computeSlaStatus(
  slaDueAt: string | null,
  closedAt: string | null,
  slaBreachedAt: string | null,
  finalOverdueSeconds: number | null,
  status: string,
): SlaStatus {
  if (!slaDueAt) {
    return { label: "no_due_date", overdueSeconds: 0, remainingMs: null, severity: "none" };
  }

  const now = new Date();
  const due = new Date(slaDueAt);
  const isClosed = status === "closed" || status === "for_review";

  if (isClosed && closedAt) {
    const closed = new Date(closedAt);
    if (closed > due) {
      // Resolved late — use stored value if available, otherwise compute
      const overdueMs = finalOverdueSeconds != null
        ? finalOverdueSeconds * 1000
        : Math.abs(getBusinessTimeDiffMs(due, closed));
      const overdueSec = overdueMs / 1000;
      return {
        label: "resolved_late",
        overdueSeconds: overdueSec,
        remainingMs: 0,
        severity: getSeverity(overdueSec),
      };
    }
    return { label: "resolved_on_time", overdueSeconds: 0, remainingMs: 0, severity: "none" };
  }

  // Open ticket
  if (slaBreachedAt) {
    const diffMs = getBusinessTimeDiffMs(now, due);
    const overdueSec = Math.abs(diffMs) / 1000;
    return {
      label: "breached",
      overdueSeconds: overdueSec,
      remainingMs: diffMs,
      severity: getSeverity(overdueSec),
    };
  }

  const diffMs = getBusinessTimeDiffMs(now, due);

  if (diffMs <= 0) {
    // Overdue
    const overdueSec = Math.abs(diffMs) / 1000;
    return {
      label: "overdue",
      overdueSeconds: overdueSec,
      remainingMs: diffMs,
      severity: getSeverity(overdueSec),
    };
  }

  // Due soon threshold: 4 hours in ms
  const dueSoonThresholdMs = 4 * 60 * 60 * 1000;
  if (diffMs <= dueSoonThresholdMs) {
    return { label: "due_soon", overdueSeconds: 0, remainingMs: diffMs, severity: "none" };
  }

  return { label: "on_time", overdueSeconds: 0, remainingMs: diffMs, severity: "none" };
}

function getSeverity(overdueSeconds: number): OverdueSeverity {
  const hours = overdueSeconds / 3600;
  if (hours <= 0) return "none";
  if (hours <= 4) return "minor";
  if (hours <= 24) return "moderate";
  return "critical";
}

// ─── Duration Formatter ─────────────────────────────────────────────

/**
 * Format a duration in seconds to a human-friendly string.
 * Examples: "18m", "2h 14m", "1d 3h"
 */
export function formatOverdueDuration(seconds: number): string {
  if (seconds <= 0) return "0m";

  const totalMinutes = Math.floor(seconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (totalHours > 0) {
    return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  }
  return `${minutes}m`;
}

/**
 * Format remaining time (ms) as countdown string.
 */
export function formatRemainingTime(remainingMs: number): string {
  if (remainingMs <= 0) return "0m";
  const totalSeconds = Math.floor(remainingMs / 1000);
  return formatOverdueDuration(totalSeconds);
}

/**
 * Get a compact display label for a ticket's SLA status.
 */
export function getSlaDisplayLabel(slaStatus: SlaStatus): string {
  switch (slaStatus.label) {
    case "no_due_date":
      return "No due date";
    case "resolved_on_time":
      return "Resolved on time";
    case "resolved_late":
      return `Resolved ${formatOverdueDuration(slaStatus.overdueSeconds)} overdue`;
    case "overdue":
    case "breached":
      return `Overdue by ${formatOverdueDuration(slaStatus.overdueSeconds)}`;
    case "due_soon":
      return `Due in ${formatRemainingTime(slaStatus.remainingMs!)}`;
    case "on_time":
      return `${formatRemainingTime(slaStatus.remainingMs!)} left`;
    default:
      return "";
  }
}
