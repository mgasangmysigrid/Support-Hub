import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import LeaveBalanceCards from "@/components/leave/LeaveBalanceCards";
import SubmitLeaveDialog from "@/components/leave/SubmitLeaveDialog";
import { useMyLeaveRequests, usePTOLedger } from "@/hooks/useLeaveData";
import {
  getLeaveStatusStyle, getLeaveTypeLabel, getDurationLabel, formatHoursToDays,
} from "@/lib/leave-utils";
import type { LeaveRequest, PTOLedgerEntry } from "@/lib/leave-utils";



export default function MyLeave() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: requests, isLoading: loadingRequests } = useMyLeaveRequests(user?.id);
  const { data: ledger, isLoading: loadingLedger } = usePTOLedger(user?.id);

  // Auto-mark leave notifications as read when visiting this page
  useEffect(() => {
    if (!user) return;
    const markLeaveNotificationsRead = async () => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false)
        .in("type", ["leave_submitted", "leave_approved", "leave_declined"]);
      queryClient.invalidateQueries({ queryKey: ["sidebar-badge-my-leave"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    markLeaveNotificationsRead();
  }, [user, queryClient]);

  const handleCancel = async (req: LeaveRequest) => {
    const newStatus = req.status === "submitted" ? "withdrawn" : "cancelled";

    // If cancelling an approved paid PTO request, reverse the allocation
    if (req.status === "approved" && req.leave_type === "paid_pto") {
      try {
        // Find the deduction ledger entry for this request
        const { data: deductions } = await supabase
          .from("pto_ledger")
          .select("id")
          .eq("related_request_id", req.id)
          .eq("entry_type", "deduction");

        if (deductions && deductions.length > 0) {
          for (const ded of deductions) {
            // Find all allocations for this deduction
            const { data: allocs } = await supabase
              .from("pto_allocations")
              .select("id, accrual_ledger_id, hours_allocated")
              .eq("deduction_ledger_id", ded.id);

            // Restore hours to each accrual bucket
            for (const alloc of (allocs || [])) {
              const { data: accrual } = await supabase
                .from("pto_ledger")
                .select("remaining_hours")
                .eq("id", alloc.accrual_ledger_id)
                .single();
              if (accrual) {
                await supabase.from("pto_ledger").update({
                  remaining_hours: Number(accrual.remaining_hours) + Number(alloc.hours_allocated),
                }).eq("id", alloc.accrual_ledger_id);
              }
              // Delete the allocation
              await supabase.from("pto_allocations").delete().eq("id", alloc.id);
            }

            // Create a reversal entry
            await supabase.from("pto_ledger").insert({
              user_id: req.user_id,
              entry_type: "reversal",
              hours: Math.abs(Number(req.total_hours)),
              related_request_id: req.id,
              created_by: user!.id,
              notes: `Reversed: leave ${format(new Date(req.date_from), "MMM d")} – ${format(new Date(req.date_to), "MMM d")} cancelled`,
            });

            // Delete the deduction entry
            await supabase.from("pto_ledger").delete().eq("id", ded.id);
          }
        }
      } catch (err: any) {
        console.error("Reversal error:", err);
      }
    }

    const { error } = await supabase
      .from("leave_requests")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", req.id);
    if (error) {
      toast.error("Error", { description: error.message });
      return;
    }

    // Audit log
    void supabase.from("leave_audit_log").insert({
      actor_id: user!.id,
      entity_type: "leave_request",
      entity_id: req.id,
      action: newStatus === "withdrawn" ? "leave_withdrawn" : "leave_cancelled",
      before_snapshot: { status: req.status },
      after_snapshot: { status: newStatus },
    });

    toast.success(newStatus === "withdrawn" ? "Request withdrawn" : "Request cancelled");
    queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
    queryClient.invalidateQueries({ queryKey: ["pto-balance"] });
    queryClient.invalidateQueries({ queryKey: ["pto-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["approved-leaves-calendar"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Leave</h1>
          <p className="text-sm text-muted-foreground">Manage your leave requests and PTO balance</p>
        </div>
        <SubmitLeaveDialog />
      </div>

      <LeaveBalanceCards />

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">My Requests</TabsTrigger>
          <TabsTrigger value="ledger">PTO Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          {loadingRequests ? (
            <p className="text-muted-foreground py-8 text-center">Loading...</p>
          ) : !requests?.length ? (
            <p className="text-muted-foreground py-8 text-center">No leave requests yet</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Working Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => {
                    const style = getLeaveStatusStyle(req.status);
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {getLeaveTypeLabel(req.leave_type)}
                            {req.is_backdated && (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300 text-[10px] px-1.5 py-0">
                                Backdated
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {format(new Date(req.date_from), "MMM d, yyyy")}
                          {req.date_from !== req.date_to && ` – ${format(new Date(req.date_to), "MMM d, yyyy")}`}
                        </TableCell>
                        <TableCell>{getDurationLabel(req.duration_type)}</TableCell>
                        <TableCell>{req.working_days_count}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${style.bg} ${style.text} border-0`}>
                            {style.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(req.status === "submitted" || req.status === "approved") && (
                            <Button variant="ghost" size="sm" onClick={() => handleCancel(req)} className="text-red-600 hover:text-red-700">
                              {req.status === "submitted" ? "Withdraw" : "Cancel"}
                            </Button>
                          )}
                          {req.decline_notes && req.status === "declined" && (
                            <span className="text-xs text-muted-foreground" title={req.decline_notes}>
                              Reason: {req.decline_notes.substring(0, 40)}...
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ledger">
          {loadingLedger ? (
            <p className="text-muted-foreground py-8 text-center">Loading...</p>
          ) : !ledger?.length ? (
            <p className="text-muted-foreground py-8 text-center">No PTO ledger entries yet. Your PTO will appear here as it accrues.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(new Date(entry.earned_at || entry.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          entry.entry_type === "accrual" ? "bg-emerald-500/10 text-emerald-600 border-0" :
                          entry.entry_type === "deduction" ? "bg-red-500/10 text-red-600 border-0" :
                          entry.entry_type === "expired" ? "bg-muted text-muted-foreground border-0" :
                          "bg-blue-500/10 text-blue-600 border-0"
                        }>
                          {entry.entry_type.charAt(0).toUpperCase() + entry.entry_type.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className={entry.hours < 0 ? "text-red-600" : "text-emerald-600"}>
                        {entry.hours > 0 ? "+" : ""}{Number(entry.hours).toFixed(2)}h
                      </TableCell>
                      <TableCell>{formatHoursToDays(Math.abs(Number(entry.hours)))}</TableCell>
                      <TableCell>{entry.expires_at ? format(new Date(entry.expires_at), "MMM d, yyyy") : "—"}</TableCell>
                      <TableCell>{entry.remaining_hours != null ? `${Number(entry.remaining_hours).toFixed(2)}h` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{entry.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
