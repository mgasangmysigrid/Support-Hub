import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle, XCircle, AlertTriangle, Users, Clock, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePendingApprovals, useAllPendingApprovals, useCanSelfApprove } from "@/hooks/useLeaveData";
import { getLeaveTypeLabel, getDurationLabel } from "@/lib/leave-utils";
import type { LeaveRequest } from "@/lib/leave-utils";

export default function LeaveApprovals() {
  const { user, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const { data: canSelfApprove } = useCanSelfApprove(user?.id);

  const { data: myPending, isLoading: myLoading } = usePendingApprovals();
  const { data: allPending, isLoading: allLoading } = useAllPendingApprovals();

  const pending = (showAll && isSuperAdmin) ? allPending : myPending;
  const isLoading = (showAll && isSuperAdmin) ? allLoading : myLoading;

  const [selectedReq, setSelectedReq] = useState<(LeaveRequest & { profiles: any }) | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineNotes, setDeclineNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleApprove = async (req: any) => {
    if (!user) return;

    // Self-approval prevention (users with can_self_approve exemption or super admins are exempt)
    if (req.user_id === user.id && !isSuperAdmin && !canSelfApprove) {
      toast.error("You cannot approve your own leave request.");
      return;
    }

    // Check if user is an assigned approver
    const approverIds: string[] = req.approver_ids || [];
    if (approverIds.length > 0 && !approverIds.includes(user.id) && !isSuperAdmin) {
      toast.error("You are not an assigned approver for this request.");
      return;
    }

    // Prevent duplicate approvals
    const completedApprovals: any[] = req.approvals_completed || [];
    if (completedApprovals.some((a: any) => a.approver_id === user.id)) {
      toast.error("You have already approved this request.");
      return;
    }

    setProcessing(true);
    try {
      const approvalMode = req.approval_mode || "single";

      // Add this user's approval to the completed list
      const newApprovals = [...completedApprovals, {
        approver_id: user.id,
        approved_at: new Date().toISOString(),
      }];

      // Determine if fully approved
      let isFullyApproved = false;
      if (approvalMode === "all_must_approve") {
        // Check if all approvers have approved
        const allApproved = approverIds.every((id: string) =>
          newApprovals.some((a: any) => a.approver_id === id)
        );
        isFullyApproved = allApproved;
      } else {
        // single or any_one — first approval is enough
        isFullyApproved = true;
      }

      if (isFullyApproved) {
        // Full approval — update status
        const { error } = await supabase.from("leave_requests").update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user.id,
          approvals_completed: newApprovals,
          updated_at: new Date().toISOString(),
        }).eq("id", req.id);
        if (error) throw error;

        // If paid PTO, create deduction in ledger and do FIFO allocation
        if (req.leave_type === "paid_pto" && req.total_hours > 0) {
          const { data: deduction, error: dedErr } = await supabase.from("pto_ledger").insert({
            user_id: req.user_id,
            entry_type: "deduction",
            hours: -req.total_hours,
            earned_at: req.date_from,
            related_request_id: req.id,
            created_by: user.id,
            notes: `Leave ${format(new Date(req.date_from), "MMM d")} – ${format(new Date(req.date_to), "MMM d")}`,
          }).select().single();
          if (dedErr) throw dedErr;

          // FIFO allocation
          const today = new Date().toISOString().split("T")[0];
          const { data: accruals } = await supabase
            .from("pto_ledger")
            .select("*")
            .eq("user_id", req.user_id)
            .eq("entry_type", "accrual")
            .gt("remaining_hours", 0)
            .or(`expires_at.is.null,expires_at.gt.${today}`)
            .order("earned_at", { ascending: true });

          let remaining = req.total_hours;
          for (const accrual of (accruals || [])) {
            if (remaining <= 0) break;
            const available = Number(accrual.remaining_hours);
            const alloc = Math.min(available, remaining);

            await supabase.from("pto_allocations").insert({
              deduction_ledger_id: deduction.id,
              accrual_ledger_id: accrual.id,
              hours_allocated: alloc,
            });

            await supabase.from("pto_ledger").update({
              remaining_hours: available - alloc,
            }).eq("id", accrual.id);

            remaining -= alloc;
          }
        }

        toast.success("Leave approved");
      } else {
        // Partial approval — just record this approver's approval
        const { error } = await supabase.from("leave_requests").update({
          approvals_completed: newApprovals,
          updated_at: new Date().toISOString(),
        }).eq("id", req.id);
        if (error) throw error;

        const remaining = approverIds.filter((id: string) =>
          !newApprovals.some((a: any) => a.approver_id === id)
        ).length;

        toast.success(`Your approval recorded. ${remaining} more approval(s) needed.`);
      }

      // Audit log
      void supabase.from("leave_audit_log").insert({
        actor_id: user.id,
        entity_type: "leave_request",
        entity_id: req.id,
        action: isFullyApproved ? "leave_approved" : "leave_partial_approval",
        before_snapshot: { status: "submitted" },
        after_snapshot: {
          status: isFullyApproved ? "approved" : "submitted",
          leave_type: req.leave_type,
          total_hours: req.total_hours,
          approval_mode: approvalMode,
          approvals_completed: newApprovals,
          is_backdated: req.is_backdated || false,
        },
      });

      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["all-pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["pto-balance"] });
      queryClient.invalidateQueries({ queryKey: ["pto-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["approved-leaves-calendar"] });
      setSelectedReq(null);
    } catch (err: any) {
      toast.error("Error", { description: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (!selectedReq || !declineNotes.trim() || !user) return;
    setProcessing(true);
    try {
      const { error } = await supabase.from("leave_requests").update({
        status: "declined",
        decline_notes: declineNotes,
        updated_at: new Date().toISOString(),
      }).eq("id", selectedReq.id);
      if (error) throw error;

      void supabase.from("leave_audit_log").insert({
        actor_id: user.id,
        entity_type: "leave_request",
        entity_id: selectedReq.id,
        action: "leave_declined",
        before_snapshot: { status: "submitted" },
        after_snapshot: { status: "declined", decline_notes: declineNotes },
        notes: declineNotes,
      });

      toast.success("Leave declined");
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["all-pending-approvals"] });
      setDeclineOpen(false);
      setDeclineNotes("");
      setSelectedReq(null);
    } catch (err: any) {
      toast.error("Error", { description: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const getApprovalProgress = (req: any) => {
    if (!req.approval_mode || req.approval_mode === "single" || req.approval_mode === "any_one") return null;
    const completed = (req.approvals_completed || []).length;
    const total = (req.approver_ids || []).length;
    if (total <= 1) return null;
    return `${completed}/${total}`;
  };

  const hasUserApproved = (req: any) => {
    if (!user) return false;
    return (req.approvals_completed || []).some((a: any) => a.approver_id === user.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pending Approvals</h1>
          <p className="text-sm text-muted-foreground">Review and manage leave requests</p>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Show All</Label>
            <Switch checked={showAll} onCheckedChange={setShowAll} />
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground py-8 text-center">Loading...</p>
      ) : !pending?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No pending leave requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Working Days</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Notice Rule</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TooltipProvider delayDuration={200}>
              {pending.map((req: any) => {
                const progress = getApprovalProgress(req);
                const alreadyApproved = hasUserApproved(req);
                const reasonText = (req.reason || "").trim();
                return (
                  <TableRow key={req.id} className="cursor-pointer hover:bg-accent/30" onClick={() => setSelectedReq(req)}>
                    <TableCell className="font-medium">{req.profiles?.full_name || req.profiles?.email || "Employee"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {getLeaveTypeLabel(req.leave_type)}
                        {req.is_backdated && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                            <Clock className="h-2.5 w-2.5 mr-0.5" /> Backdated
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {format(new Date(req.date_from), "MMM d")} – {format(new Date(req.date_to), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{getDurationLabel(req.duration_type)}</TableCell>
                    <TableCell>{req.working_days_count}</TableCell>
                    <TableCell className="max-w-[220px]">
                      {reasonText ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-start gap-1.5 text-xs text-foreground/80">
                              <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                              <span className="line-clamp-2 leading-snug">{reasonText}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap text-xs">
                            {reasonText}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No reason</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {req.notice_rule_met ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-0">Met</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-0">Not Met</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {progress ? (
                        <Badge variant="outline" className="border-0 bg-muted text-xs">
                          <Users className="h-3 w-3 mr-1" /> {progress}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Single</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {alreadyApproved ? (
                          <Badge variant="outline" className="border-0 bg-emerald-500/10 text-emerald-600 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" /> Approved
                          </Badge>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700" onClick={() => handleApprove(req)} disabled={processing}>
                              <CheckCircle className="h-4 w-4 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setSelectedReq(req); setDeclineOpen(true); }} disabled={processing}>
                              <XCircle className="h-4 w-4 mr-1" /> Decline
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              </TooltipProvider>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Decline Dialog */}
      <Dialog open={declineOpen} onOpenChange={(v) => { setDeclineOpen(v); if (!v) setDeclineNotes(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for declining this request.
            </p>
            <div className="grid gap-2">
              <Label>Reason (required)</Label>
              <Textarea
                value={declineNotes}
                onChange={(e) => setDeclineNotes(e.target.value)}
                placeholder="Enter reason for declining..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeclineOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleDecline}
                disabled={!declineNotes.trim() || processing}
              >
                {processing ? "Declining..." : "Decline Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
