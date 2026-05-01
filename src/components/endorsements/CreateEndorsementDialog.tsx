import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const LEAVE_TYPES = [
  { value: "paid_time_off", label: "Paid Time Off" },
  { value: "unpaid_leave", label: "Unpaid Leave" },
  { value: "birthday_leave", label: "Birthday Leave" },
];

export default function CreateEndorsementDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"leave" | "manual">("leave");
  const [selectedLeaveId, setSelectedLeaveId] = useState<string>("");
  const [leaveType, setLeaveType] = useState("paid_time_off");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch approved leave requests that don't have ACTIVE endorsements
  const { data: availableLeaves } = useQuery({
    queryKey: ["available-leaves-for-endorsement", user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, leave_type, date_from, date_to, status")
        .eq("user_id", user!.id)
        .eq("status", "approved")
        .order("date_from", { ascending: false });
      if (error) throw error;

      // Filter out leaves that already have ACTIVE endorsements (exclude cancelled)
      const { data: existing } = await supabase
        .from("leave_endorsements")
        .select("leave_request_id, status")
        .eq("employee_user_id", user!.id)
        .not("leave_request_id", "is", null);

      const usedIds = new Set(
        (existing || [])
          .filter((e) => e.status !== "cancelled")
          .map((e) => e.leave_request_id)
      );
      return (data || []).filter((l) => !usedIds.has(l.id));
    },
  });

  const selectedLeave = availableLeaves?.find((l) => l.id === selectedLeaveId);

  const handleCreate = async () => {
    if (!user) {
      toast.error("You must be signed in to create an endorsement.");
      return;
    }

    // Re-verify session to avoid stale auth.uid() RLS rejections
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) {
      toast.error("Your session has expired. Please sign in again.");
      return;
    }
    const authUid = sessionData.session.user.id;
    if (authUid !== user.id) {
      toast.error("Session mismatch detected. Please refresh and try again.");
      return;
    }

    let leaveRequestId: string | null = null;
    let finalLeaveType = leaveType;
    let finalStart = startDate;
    let finalEnd = endDate;

    if (mode === "leave") {
      if (!selectedLeave) {
        toast.error("Please select a leave request");
        return;
      }
      leaveRequestId = selectedLeave.id;
      finalLeaveType = selectedLeave.leave_type;
      finalStart = selectedLeave.date_from;
      finalEnd = selectedLeave.date_to;
    } else {
      if (!finalStart || !finalEnd) {
        toast.error("Please enter leave dates");
        return;
      }
    }

    // Duplicate check: only check ACTIVE statuses, not cancelled
    const dupQuery = supabase
      .from("leave_endorsements")
      .select("id")
      .eq("employee_user_id", authUid)
      .in("status", ["draft", "open", "acknowledged", "in_progress"]);

    if (leaveRequestId) {
      dupQuery.eq("leave_request_id", leaveRequestId);
    } else {
      dupQuery.eq("leave_start_date", finalStart).eq("leave_end_date", finalEnd).is("leave_request_id", null);
    }

    const { data: dups } = await dupQuery.limit(1);
    if (dups && dups.length > 0) {
      toast.error("An active endorsement already exists for this leave period");
      return;
    }

    setSaving(true);
    try {
      const { data: deptMember } = await supabase
        .from("department_members")
        .select("department_id")
        .eq("user_id", authUid)
        .limit(1)
        .maybeSingle();

      const { data: profile } = await supabase
        .from("profiles")
        .select("reporting_manager_id")
        .eq("id", authUid)
        .maybeSingle();

      const [y, m, d] = finalEnd.split("-").map(Number);
      const ret = new Date(Date.UTC(y, m - 1, d));
      ret.setUTCDate(ret.getUTCDate() + 1);
      const returnDateStr = ret.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("leave_endorsements")
        .insert({
          leave_request_id: leaveRequestId,
          employee_user_id: authUid, // RLS: must equal auth.uid()
          department_id: deptMember?.department_id || null,
          leave_type: finalLeaveType,
          leave_start_date: finalStart,
          leave_end_date: finalEnd,
          return_date: returnDateStr,
          manager_user_id: profile?.reporting_manager_id || null,
          status: "draft" as any,
          system_generated: false,
        })
        .select("id")
        .single();

      if (error) throw error;

      toast.success("Endorsement created");
      qc.invalidateQueries({ queryKey: ["endorsements"] });
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
      qc.invalidateQueries({ queryKey: ["available-leaves-for-endorsement"] });
      onCreated(data.id);
    } catch (err: any) {
      console.error("[CreateEndorsementDialog] insert failed:", err);
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("violates row-level")) {
        toast.error(
          "You don't have permission to create this leave endorsement. Please check that the endorsement is for your own leave or contact People & Culture."
        );
      } else {
        toast.error(msg || "Failed to create endorsement. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Endorsement</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "leave" | "manual")} className="flex gap-4">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="leave" id="mode-leave" />
              <Label htmlFor="mode-leave">From approved leave</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="manual" id="mode-manual" />
              <Label htmlFor="mode-manual">Manual entry</Label>
            </div>
          </RadioGroup>

          {mode === "leave" && (
            <div className="space-y-2">
              <Label>Select Leave Request</Label>
              <Select value={selectedLeaveId} onValueChange={setSelectedLeaveId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an approved leave..." />
                </SelectTrigger>
                <SelectContent>
                  {(availableLeaves || []).length === 0 && (
                    <SelectItem value="__none" disabled>No available approved leaves</SelectItem>
                  )}
                  {(availableLeaves || []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.leave_type.replace(/_/g, " ")} — {l.date_from} to {l.date_to}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "manual" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Leave Type</Label>
                <Select value={leaveType} onValueChange={setLeaveType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Creating..." : "Create Endorsement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
