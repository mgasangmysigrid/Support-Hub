// Leave module utility functions
// Timezone: Asia/Manila (Philippine Time)

export type LeaveRequest = {
  id: string;
  user_id: string;
  approver_id: string | null;
  leave_type: "paid_pto" | "unpaid_leave" | "birthday_leave";
  date_from: string;
  date_to: string;
  duration_type: "full_day" | "half_day_am" | "half_day_pm";
  total_hours: number;
  working_days_count: number;
  notice_rule_met: boolean;
  reason: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "declined" | "cancelled" | "withdrawn";
  is_backdated?: boolean;
  decline_notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null; email: string | null };
};

export type PTOLedgerEntry = {
  id: string;
  user_id: string;
  entry_type: "accrual" | "deduction" | "adjustment" | "reversal" | "expired";
  hours: number;
  earned_at: string | null;
  expires_at: string | null;
  remaining_hours: number | null;
  related_request_id: string | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
};

export type Schedule = {
  id: string;
  name: string;
  working_days: number[];
  hours_per_day: number;
  is_default: boolean;
  active: boolean;
};

/** Get annual PTO days based on years of service */
export function getAnnualPTODays(yearsOfService: number): number {
  if (yearsOfService < 1) return 20;
  if (yearsOfService < 2) return 20;
  if (yearsOfService < 3) return 21;
  if (yearsOfService < 4) return 22;
  if (yearsOfService < 5) return 23;
  if (yearsOfService < 6) return 24;
  return 25;
}

/** Calculate years of service from start date */
export function getYearsOfService(startDate: string | Date): number {
  const start = new Date(startDate);
  const now = getManilaDate();
  const diff = now.getTime() - start.getTime();
  return diff / (365.25 * 24 * 60 * 60 * 1000);
}

/** Check if employee is in probation (first 6 months) */
export function isInProbation(startDate: string | Date): boolean {
  const start = new Date(startDate);
  const probEnd = new Date(start);
  probEnd.setMonth(probEnd.getMonth() + 6);
  return getManilaDate() < probEnd;
}

/** Get current Manila date */
export function getManilaDate(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
}

/** Get Manila date string (YYYY-MM-DD) */
export function getManilaDateStr(): string {
  return getManilaDate().toISOString().split("T")[0];
}

/** Count working days between two dates given schedule working_days (0=Sun..6=Sat) */
export function countWorkingDays(
  dateFrom: string,
  dateTo: string,
  workingDays: number[],
  durationT: "full_day" | "half_day_am" | "half_day_pm" = "full_day"
): number {
  if (durationT !== "full_day") return 0.5;

  let count = 0;
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const current = new Date(start);

  while (current <= end) {
    if (workingDays.includes(current.getDay())) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/** Check notice rule: 1-2 working days → 14 days notice, 3+ → 30 days */
export function checkNoticeRule(dateFrom: string, workingDaysCount: number): { met: boolean; required: number } {
  const today = getManilaDate();
  const from = new Date(dateFrom);
  const diffDays = Math.floor((from.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (workingDaysCount <= 2) {
    return { met: diffDays >= 14, required: 14 };
  }
  return { met: diffDays >= 30, required: 30 };
}

/** Calculate total hours for a leave request */
export function calculateTotalHours(workingDays: number, hoursPerDay: number): number {
  return workingDays * hoursPerDay;
}

/** Format hours to display string like "2d 4h" */
export function formatHoursToDays(hours: number, hoursPerDay: number = 8): string {
  const days = Math.floor(hours / hoursPerDay);
  const remainingHours = Math.round((hours % hoursPerDay) * 100) / 100;
  if (days === 0) return `${remainingHours}h`;
  if (remainingHours === 0) return `${days}d`;
  return `${days}d ${remainingHours}h`;
}

/** Get monthly accrual hours */
export function getMonthlyAccrualHours(yearsOfService: number, hoursPerDay: number = 8): number {
  const annualDays = getAnnualPTODays(yearsOfService);
  const annualHours = annualDays * hoursPerDay;
  return annualHours / 12;
}

/** Status color/badge mapping for leave requests */
export function getLeaveStatusStyle(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case "draft": return { bg: "bg-muted", text: "text-muted-foreground", label: "Draft" };
    case "submitted": return { bg: "bg-blue-500/10", text: "text-blue-600", label: "Submitted" };
    case "approved": return { bg: "bg-emerald-500/10", text: "text-emerald-600", label: "Approved" };
    case "declined": return { bg: "bg-red-500/10", text: "text-red-600", label: "Declined" };
    case "cancelled": return { bg: "bg-muted", text: "text-muted-foreground", label: "Cancelled" };
    case "withdrawn": return { bg: "bg-muted", text: "text-muted-foreground", label: "Withdrawn" };
    default: return { bg: "bg-muted", text: "text-muted-foreground", label: status };
  }
}

/** Leave type display label */
export function getLeaveTypeLabel(type: string): string {
  switch (type) {
    case "paid_pto": return "Paid Time Off";
    case "birthday_leave": return "Birthday Leave";
    case "unpaid_leave": return "Unpaid Leave";
    default: return type;
  }
}

/** Duration type display label */
export function getDurationLabel(type: string): string {
  switch (type) {
    case "full_day": return "Full Day";
    case "half_day_am": return "Half Day (AM)";
    case "half_day_pm": return "Half Day (PM)";
    default: return type;
  }
}
