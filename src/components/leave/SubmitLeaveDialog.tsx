import { useState, useMemo, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Plus, AlertTriangle, CheckCircle, Info, Clock } from "lucide-react";
import { format, addDays, subDays, differenceInCalendarDays } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackActivity, ANALYTICS_EVENTS } from "@/hooks/use-activity-tracker";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  countWorkingDays, checkNoticeRule, isInProbation, calculateTotalHours,
  formatHoursToDays, getLeaveTypeLabel, getDurationLabel, getManilaDate,
} from "@/lib/leave-utils";
import { useDefaultSchedule, usePTOBalance, useUserProfile, useUserDepartment, useDepartmentManager, useLeaveExemption } from "@/hooks/useLeaveData";
import { useApprovalSettings, resolveApproversForEmployee } from "@/hooks/useLeaveApproverMatrix";



export default function SubmitLeaveDialog() {
  const { user, isManager } = useAuth();
  const queryClient = useQueryClient();
  const DRAFT_KEY = "leave-request-draft";
  const savedDraft = (() => { try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; } })();

  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<"paid_pto" | "unpaid_leave" | "birthday_leave">(savedDraft?.leaveType || "paid_pto");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(savedDraft?.dateFrom ? new Date(savedDraft.dateFrom) : undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(savedDraft?.dateTo ? new Date(savedDraft.dateTo) : undefined);
  const [durationType, setDurationType] = useState<"full_day" | "half_day_am" | "half_day_pm">(savedDraft?.durationType || "full_day");
  const [reason, setReason] = useState(savedDraft?.reason || "");
  const [notes, setNotes] = useState(savedDraft?.notes || "");
  const [submitting, setSubmitting] = useState(false);
  const [backdatedConfirm, setBackdatedConfirm] = useState(false);

  // Auto-save draft
  useEffect(() => {
    const hasData = reason || notes || dateFrom;
    if (hasData) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          leaveType, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString(),
          durationType, reason, notes,
        }));
      } catch {}
    } else {
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }
  }, [leaveType, dateFrom, dateTo, durationType, reason, notes]);

  const { data: schedule } = useDefaultSchedule();
  const { data: balance } = usePTOBalance(user?.id);
  const { data: profile } = useUserProfile(user?.id);
  const { data: userDept } = useUserDepartment(user?.id);
  const { data: manager } = useDepartmentManager(userDept?.department_id);
  const { data: approvalSettings } = useApprovalSettings();
  const { data: exemption } = useLeaveExemption(user?.id);
  const isExempt = exemption?.can_file_pto_anytime === true;
  const allowNegative = exemption?.allow_negative_pto_balance === true;

  // ─── RJ Raquinio owner-only override ───
  const isRJOverride = profile?.email?.toLowerCase() === "rraquinio@mysigrid.com";

  // For department managers, the approver is the Owner (super_admin) — legacy fallback
  const { data: ownerProfile } = useQuery({
    queryKey: ["owner-approver"],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin")
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
  });

  // Legacy approver (when matrix is disabled)
  const legacyApproverId = isManager
    ? (ownerProfile?.user_id || null)
    : (manager?.user_id || null);

  // ─── Matrix-based approver resolution ───
  const [resolvedApprovers, setResolvedApprovers] = useState<{
    approver_ids: string[];
    approval_mode: string;
    source: string;
    source_name?: string;
  } | null>(null);
  const [resolvedApproverNames, setResolvedApproverNames] = useState<string[]>([]);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!user || !approvalSettings) return;
    if (!approvalSettings.enabled) {
      setResolvedApprovers(null);
      setResolvedApproverNames([]);
      return;
    }

    let cancelled = false;
    setResolving(true);

    (async () => {
      const result = await resolveApproversForEmployee(user.id, isManager);
      if (cancelled) return;
      setResolvedApprovers(result);

      if (result.approver_ids.length > 0) {
        const { data: names } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", result.approver_ids);
        if (!cancelled) {
          setResolvedApproverNames(
            (names || []).map((n: any) => n.full_name || n.email || "Unknown")
          );
        }
      } else {
        if (!cancelled) setResolvedApproverNames([]);
      }
      setResolving(false);
    })();

    return () => { cancelled = true; };
  }, [user, approvalSettings, isManager]);

  const matrixEnabled = approvalSettings?.enabled || false;
  const effectiveApproverIds = matrixEnabled ? (resolvedApprovers?.approver_ids || []) : (legacyApproverId ? [legacyApproverId] : []);
  const effectiveApprovalMode = matrixEnabled ? (resolvedApprovers?.approval_mode || "single") : "single";
  const noApprover = effectiveApproverIds.length === 0;

  // Check birthday leave eligibility
  const birthdayLeaveEligible = useMemo(() => {
    if (!profile?.start_date || !profile.date_of_birth) return false;
    const yos = (new Date().getTime() - new Date(profile.start_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return yos >= 1;
  }, [profile]);

  // Check if there's available birthday leave balance (adjustment entries with "Birthday Leave" notes)
  const { data: birthdayBalance } = useQuery({
    queryKey: ["birthday-leave-balance-submit", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data } = await supabase
        .from("pto_ledger")
        .select("remaining_hours")
        .eq("user_id", user.id)
        .eq("entry_type", "adjustment")
        .gt("remaining_hours", 0)
        .ilike("notes", "%Birthday Leave%");
      return (data || []).reduce((sum: number, e) => sum + Number(e.remaining_hours || 0), 0);
    },
    enabled: !!user && birthdayLeaveEligible,
  });

  const today = getManilaDate();
  const maxDate = addDays(today, 90);
  const minBackdateDate = subDays(today, 90);

  const isHalfDay = durationType !== "full_day";

  // Force same date for half-day
  const effectiveDateTo = isHalfDay ? dateFrom : dateTo;

  const workingDays = useMemo(() => {
    if (!dateFrom || !schedule) return 0;
    const to = effectiveDateTo || dateFrom;
    return countWorkingDays(
      format(dateFrom, "yyyy-MM-dd"),
      format(to, "yyyy-MM-dd"),
      schedule.working_days,
      durationType
    );
  }, [dateFrom, effectiveDateTo, schedule, durationType]);

  const totalHours = useMemo(() => {
    if (!schedule) return 0;
    return calculateTotalHours(workingDays, schedule.hours_per_day);
  }, [workingDays, schedule]);

  const noticeCheck = useMemo(() => {
    if (!dateFrom) return { met: true, required: 0 };
    return checkNoticeRule(format(dateFrom, "yyyy-MM-dd"), workingDays);
  }, [dateFrom, workingDays]);

  const probation = profile?.start_date ? isInProbation(profile.start_date) : false;

  // Determine if paid PTO is blocked (exempt users bypass all restrictions)
  const paidPTOBlocked = !isExempt && !isRJOverride && (probation || !noticeCheck.met);

  // Birthday leave blocked if not eligible or no balance
  const birthdayLeaveBlocked = !birthdayLeaveEligible || (birthdayBalance || 0) <= 0;

  // Force unpaid if paid is blocked — but birthday leave is exempt from notice rules
  const effectiveLeaveType = (paidPTOBlocked && leaveType === "paid_pto") ? "unpaid_leave" : leaveType;

  // Backdated leave detection (only unpaid leave can be backdated)
  const isBackdated = dateFrom ? dateFrom < today : false;
  const daysBackdated = dateFrom && isBackdated ? differenceInCalendarDays(today, dateFrom) : 0;
  const backdateTooOld = daysBackdated > 90;
  const backdatedButWrongType = isBackdated && effectiveLeaveType !== "unpaid_leave";

  const balanceAfter = (balance?.available || 0) - (effectiveLeaveType === "paid_pto" ? totalHours : 0) - (balance?.pending || 0);
  const insufficientBalance = !allowNegative && (
    (effectiveLeaveType === "paid_pto" && balanceAfter < 0) ||
    (effectiveLeaveType === "birthday_leave" && totalHours > (birthdayBalance || 0))
  );

  // ─── Overlap Validation ───
  const [overlapError, setOverlapError] = useState<string | null>(null);

  // Check for overlapping requests whenever dates/duration change
  useEffect(() => {
    setOverlapError(null);
    if (!dateFrom || !user) return;

    let cancelled = false;
    const toDate = effectiveDateTo || dateFrom;
    const fromStr = format(dateFrom, "yyyy-MM-dd");
    const toStr = format(toDate, "yyyy-MM-dd");

    (async () => {
      const { data: existing } = await supabase
        .from("leave_requests")
        .select("id, date_from, date_to, duration_type, status")
        .eq("user_id", user.id)
        .in("status", ["submitted", "approved", "draft"])
        .lte("date_from", toStr)
        .gte("date_to", fromStr);

      if (cancelled || !existing || existing.length === 0) return;

      for (const ex of existing) {
        // Check half-day conflicts
        if (durationType !== "full_day" && ex.duration_type !== "full_day") {
          if (durationType === ex.duration_type) {
            setOverlapError(`Conflicts with existing ${ex.duration_type === "half_day_am" ? "AM" : "PM"} half-day request`);
            return;
          }
          continue; // AM + PM on same day is OK
        }
        setOverlapError("Overlaps with an existing leave request for the selected dates");
        return;
      }
    })();

    return () => { cancelled = true; };
  }, [dateFrom, effectiveDateTo, durationType, user]);

  const reasonTrimmedLength = reason.trim().length;
  const reasonValid = reasonTrimmedLength >= 30;

  const canSubmit = dateFrom && (isHalfDay || effectiveDateTo) && workingDays > 0 && !insufficientBalance &&
    !overlapError && (isRJOverride || !noApprover) && !backdateTooOld && !backdatedButWrongType &&
    reasonValid &&
    (!isBackdated || backdatedConfirm) && !submitting;

  const handleSubmit = async () => {
    if (!user || !dateFrom) return;
    if (!isRJOverride && noApprover) {
      toast.error("No approver assigned. Please contact admin.");
      return;
    }

    // Self-approval prevention (RJ exempt)
    if (!isRJOverride && effectiveApproverIds.length === 1 && effectiveApproverIds[0] === user.id) {
      toast.error("You cannot approve your own leave request.");
      return;
    }

    setSubmitting(true);
    try {
      const toDate = effectiveDateTo || dateFrom;

      // RJ override: auto-approve on submit
      const isAutoApproved = isRJOverride;

      const { error } = await supabase.from("leave_requests").insert({
        user_id: user.id,
        approver_id: isAutoApproved ? user.id : (effectiveApproverIds[0] || null),
        approver_ids: isAutoApproved ? [user.id] : effectiveApproverIds,
        approval_mode: isAutoApproved ? "single" : effectiveApprovalMode,
        approvals_completed: isAutoApproved ? [{ approver_id: user.id, approved_at: new Date().toISOString() }] : [],
        leave_type: effectiveLeaveType,
        date_from: format(dateFrom, "yyyy-MM-dd"),
        date_to: format(toDate, "yyyy-MM-dd"),
        duration_type: durationType,
        total_hours: totalHours,
        working_days_count: workingDays,
        notice_rule_met: isAutoApproved ? true : (isBackdated ? true : noticeCheck.met),
        reason: reason || null,
        notes: isBackdated ? `[Backdated: ${daysBackdated} day(s)] ${notes || ""}`.trim() : (notes || null),
        status: isAutoApproved ? "approved" : "submitted",
        approved_at: isAutoApproved ? new Date().toISOString() : null,
        approved_by: isAutoApproved ? user.id : null,
        is_backdated: isBackdated,
      } as any);
      if (error) throw error;

      // If auto-approved and paid PTO, handle PTO deduction (FIFO)
      if (isAutoApproved && effectiveLeaveType === "paid_pto" && totalHours > 0) {
        // Get the newly created request to get its ID
        const { data: newReq } = await supabase
          .from("leave_requests")
          .select("id")
          .eq("user_id", user.id)
          .eq("date_from", format(dateFrom, "yyyy-MM-dd"))
          .eq("date_to", format(toDate, "yyyy-MM-dd"))
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (newReq) {
          const { data: deduction } = await supabase.from("pto_ledger").insert({
            user_id: user.id,
            entry_type: "deduction",
            hours: -totalHours,
            earned_at: format(dateFrom, "yyyy-MM-dd"),
            related_request_id: newReq.id,
            created_by: user.id,
            notes: `Leave ${format(dateFrom, "MMM d")} – ${format(toDate, "MMM d")}`,
          }).select().single();

          if (deduction) {
            const dedRecord = deduction;
            const todayStr = new Date().toISOString().split("T")[0];
            const { data: accruals } = await supabase
              .from("pto_ledger")
              .select("*")
              .eq("user_id", user.id)
              .eq("entry_type", "accrual")
              .gt("remaining_hours", 0)
              .or(`expires_at.is.null,expires_at.gt.${todayStr}`)
              .order("earned_at", { ascending: true });

            let remaining = totalHours;
            for (const accrual of (accruals || [])) {
              if (remaining <= 0) break;
              const available = Number(accrual.remaining_hours);
              const alloc = Math.min(available, remaining);
              await supabase.from("pto_allocations").insert({
                deduction_ledger_id: dedRecord.id,
                accrual_ledger_id: accrual.id,
                hours_allocated: alloc,
              });
              await supabase.from("pto_ledger").update({
                remaining_hours: available - alloc,
              }).eq("id", accrual.id);
              remaining -= alloc;
            }
          }
        }
      }

      toast.success(isAutoApproved ? "Leave auto-approved" : "Leave request submitted",
        { description: isAutoApproved ? "Your leave has been automatically approved." : "Your request has been sent for approval." });
      if (user) trackActivity(user.id, ANALYTICS_EVENTS.SUBMITTED_LEAVE.module, ANALYTICS_EVENTS.SUBMITTED_LEAVE.event, "leave_request");
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["pto-balance"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pto-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["approved-leaves-calendar"] });
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error("Error", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setLeaveType("paid_pto");
    setDateFrom(undefined);
    setDateTo(undefined);
    setDurationType("full_day");
    setReason("");
    setNotes("");
    setBackdatedConfirm(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="bg-teal-600 hover:bg-teal-700 text-white">
          <Plus className="h-4 w-4 mr-2" /> Submit Leave Request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Submit Leave Request</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* Leave Type */}
          <div className="grid gap-2">
            <Label>Leave Type</Label>
            <Select value={effectiveLeaveType} onValueChange={(v) => setLeaveType(v as "paid_pto" | "unpaid_leave" | "birthday_leave")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid_pto" disabled={paidPTOBlocked}>Paid Time Off</SelectItem>
                <SelectItem value="birthday_leave" disabled={birthdayLeaveBlocked}>Birthday Leave</SelectItem>
                <SelectItem value="unpaid_leave">Unpaid Leave</SelectItem>
              </SelectContent>
            </Select>
            {probation && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Probation period — Paid Time Off is not available
              </p>
            )}
            {!isRJOverride && !probation && !noticeCheck.met && dateFrom && effectiveLeaveType !== "birthday_leave" && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Notice rule not met ({noticeCheck.required} days required) — only Unpaid Leave allowed
              </p>
            )}
          </div>

          {/* Duration Type */}
          <div className="grid gap-2">
            <Label>Duration</Label>
            <Select value={durationType} onValueChange={(v) => setDurationType(v as "full_day" | "half_day_am" | "half_day_pm")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_day">Full Day</SelectItem>
                <SelectItem value="half_day_am">Half Day (AM)</SelectItem>
                <SelectItem value="half_day_pm">Half Day (PM)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className={cn("grid gap-4", isHalfDay ? "grid-cols-1" : "grid-cols-2")}>
            <div className="grid gap-2">
              <Label>{isHalfDay ? "Date" : "Date From"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(d) => { setDateFrom(d); setBackdatedConfirm(false); if (!isHalfDay && dateTo && d && d > dateTo) setDateTo(undefined); }}
                    disabled={(d) => {
                      if (d > maxDate) return true;
                      // RJ can file any date including today
                      if (isRJOverride) return d < today;
                      // Allow past dates only for unpaid leave (up to 90 days back)
                      if (effectiveLeaveType === "unpaid_leave") return d < minBackdateDate;
                      return d < today;
                    }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            {!isHalfDay && (
              <div className="grid gap-2">
                <Label>Date To</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      disabled={(d) => {
                        if (d > maxDate) return true;
                        if (effectiveLeaveType === "unpaid_leave") return d < (dateFrom || minBackdateDate);
                        return d < (dateFrom || today);
                      }}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Backdated Leave Notices */}
          {effectiveLeaveType === "unpaid_leave" && !isBackdated && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Backdated Unpaid Leave is allowed up to 90 days.
            </p>
          )}
          {backdatedButWrongType && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Only Unpaid Leave can be filed for past dates.
            </p>
          )}
          {backdateTooOld && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> You can no longer file this in Support Hub. Please contact People &amp; Culture.
            </p>
          )}
          {isBackdated && !backdateTooOld && !backdatedButWrongType && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300 text-xs">
                  <Clock className="h-3 w-3 mr-1" /> Backdated Leave — {daysBackdated} day(s) ago
                </Badge>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="backdate-confirm"
                  checked={backdatedConfirm}
                  onCheckedChange={(v) => setBackdatedConfirm(v === true)}
                />
                <label htmlFor="backdate-confirm" className="text-xs text-amber-800 cursor-pointer leading-relaxed">
                  I confirm this leave was already taken and I am filing it retroactively.
                </label>
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="grid gap-2">
            <Label>
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Briefly explain the reason for this leave (min 30 characters)..."
              rows={3}
              className={cn(
                reasonTrimmedLength > 0 && !reasonValid && "border-amber-500 focus-visible:ring-amber-500"
              )}
              aria-invalid={reasonTrimmedLength > 0 && !reasonValid}
            />
            <div className="flex items-center justify-between gap-2">
              <p className={cn(
                "text-xs",
                reasonTrimmedLength === 0
                  ? "text-muted-foreground"
                  : !reasonValid
                  ? "text-amber-600"
                  : "text-emerald-600"
              )}>
                {reasonTrimmedLength === 0
                  ? "Reason is required."
                  : !reasonValid
                  ? "Reason must be at least 30 characters."
                  : "Looks good."}
              </p>
              <span className={cn(
                "text-xs tabular-nums",
                reasonTrimmedLength === 0
                  ? "text-muted-foreground"
                  : !reasonValid
                  ? "text-amber-600 font-medium"
                  : "text-emerald-600 font-medium"
              )}>
                {reasonTrimmedLength}/30
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>

          {/* Overlap Warning */}
          {overlapError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {overlapError}
            </p>
          )}

          {/* Smart Summary Panel */}
          {dateFrom && workingDays > 0 && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-4 space-y-3">
              <h4 className="font-semibold text-sm text-teal-800 flex items-center gap-2">
                <Info className="h-4 w-4" /> Request Summary
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Leave Type</span>
                  <p className="font-medium">{getLeaveTypeLabel(effectiveLeaveType)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration</span>
                  <p className="font-medium">{getDurationLabel(durationType)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Working Days</span>
                  <p className="font-medium">{workingDays}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Hours to Deduct</span>
                  <p className="font-medium">{effectiveLeaveType === "paid_pto" ? formatHoursToDays(totalHours) : "N/A (Unpaid)"}</p>
                </div>
                {!isRJOverride && (
                <div>
                  <span className="text-muted-foreground">Notice Rule</span>
                  <p className={cn("font-medium flex items-center gap-1", noticeCheck.met ? "text-emerald-600" : "text-amber-600")}>
                    {noticeCheck.met ? <><CheckCircle className="h-3 w-3" /> Met</> : <><AlertTriangle className="h-3 w-3" /> Not met</>}
                  </p>
                </div>
                )}
                {effectiveLeaveType === "paid_pto" && (
                  <>
                    <div>
                      <span className="text-muted-foreground">PTO Balance Before</span>
                      <p className="font-medium">{formatHoursToDays(balance?.available || 0)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">PTO Balance After</span>
                      <p className={cn("font-medium", balanceAfter < 0 ? "text-red-600" : "text-emerald-600")}>
                        {formatHoursToDays(Math.max(0, balanceAfter))}
                      </p>
                    </div>
                  </>
                )}
                {effectiveLeaveType === "birthday_leave" && (
                  <div>
                    <span className="text-muted-foreground">Birthday Leave Balance</span>
                    <p className={cn("font-medium", (birthdayBalance || 0) < totalHours ? "text-red-600" : "text-emerald-600")}>
                      {formatHoursToDays(birthdayBalance || 0)}
                    </p>
                  </div>
                )}
              </div>
              {insufficientBalance && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Insufficient PTO balance for this request
                </p>
              )}
            </div>
          )}

          {/* Approver info */}
          {isRJOverride ? (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> This leave will be auto-approved.
            </p>
          ) : (
            <>
              {noApprover && !resolving && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> No approver assigned. Please contact admin.
                </p>
              )}
              {resolving && (
                <p className="text-xs text-muted-foreground">Resolving approver...</p>
              )}
              {!noApprover && !resolving && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                    Your leave will be approved by:{" "}
                    {matrixEnabled
                      ? resolvedApproverNames.join(", ")
                      : (manager?.profiles?.full_name || manager?.profiles?.email || "Department Manager")}
                  </p>
                  {matrixEnabled && resolvedApprovers && (
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] border-0 bg-muted px-1.5 py-0">
                        {resolvedApprovers.source === "individual_override" ? "Individual Override"
                          : resolvedApprovers.source === "group" ? `Group: ${resolvedApprovers.source_name || ""}`
                          : resolvedApprovers.source === "department" ? "Department Manager"
                          : resolvedApprovers.source === "fallback" ? "Global Fallback"
                          : ""}
                      </Badge>
                      {effectiveApprovalMode !== "single" && (
                        <Badge variant="outline" className="text-[10px] border-0 bg-muted px-1.5 py-0">
                          {effectiveApprovalMode === "any_one" ? "Any one can approve" : "All must approve"}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit} className="bg-teal-600 hover:bg-teal-700 text-white">
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
