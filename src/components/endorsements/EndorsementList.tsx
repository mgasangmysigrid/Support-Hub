import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDeleteEndorsement, type Endorsement } from "@/hooks/useEndorsements";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "bg-muted", text: "text-muted-foreground", label: "Draft" },
  open: { bg: "bg-blue-500/10", text: "text-blue-600", label: "Open" },
  acknowledged: { bg: "bg-emerald-500/10", text: "text-emerald-600", label: "Acknowledged" },
  in_progress: { bg: "bg-amber-500/10", text: "text-amber-600", label: "In Progress" },
  closed: { bg: "bg-muted", text: "text-muted-foreground", label: "Closed" },
  cancelled: { bg: "bg-red-500/10", text: "text-red-600", label: "Cancelled" },
};

export default function EndorsementList({
  endorsements,
  loading,
  emptyMessage,
  onSelect,
  role,
}: {
  endorsements: Endorsement[];
  loading: boolean;
  emptyMessage: string;
  onSelect: (id: string) => void;
  role: "employee" | "recipient";
}) {
  const { user, isSuperAdmin, isPcMember } = useAuth();
  const deleteEndorsement = useDeleteEndorsement();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Fetch unread endorsement notification links for row-level indicators
  const { data: unreadEndorsementIds } = useQuery({
    queryKey: ["endorsement-unread-rows", user?.id, endorsements.length],
    enabled: !!user && endorsements.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("link, type")
        .eq("user_id", user!.id)
        .eq("is_read", false)
        .in("type", [
          "endorsement_submitted",
          "endorsement_updated",
          "endorsement_acknowledged",
          "endorsement_task_updated",
          "endorsement_cancelled",
        ]);
      const ids = new Map<string, string>(); // endorsement_id -> latest type
      (data || []).forEach((n) => {
        const eid = n.link?.split("/").pop();
        if (eid && eid.length === 36) {
          // Priority: submitted > acknowledged > task_updated > updated
          if (!ids.has(eid)) ids.set(eid, n.type);
        }
      });
      return ids;
    },
    staleTime: 10000,
  });

  // Pending acknowledgement for recipient view
  const { data: pendingAckIds } = useQuery({
    queryKey: ["endorsement-pending-ack", user?.id],
    enabled: !!user && role === "recipient",
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_endorsement_recipients")
        .select("endorsement_id")
        .eq("recipient_user_id", user!.id)
        .eq("status", "pending");
      return new Set((data || []).map((r) => r.endorsement_id));
    },
    staleTime: 10000,
  });

  const getRowIndicator = (e: Endorsement) => {
    // Pending acknowledgement (recipient hasn't accepted yet)
    if (role === "recipient" && pendingAckIds?.has(e.id)) {
      return { label: "Action Required", className: "bg-blue-600 text-white" };
    }
    // Unread notification
    const notifType = unreadEndorsementIds?.get(e.id);
    if (notifType === "endorsement_submitted") {
      return { label: "New", className: "bg-blue-600 text-white" };
    }
    if (notifType === "endorsement_acknowledged") {
      return { label: "Accepted", className: "bg-emerald-600 text-white" };
    }
    if (notifType === "endorsement_task_updated") {
      return { label: "Updated", className: "bg-amber-500 text-white" };
    }
    if (notifType === "endorsement_updated") {
      return { label: "Updated", className: "bg-amber-500 text-white" };
    }
    return null;
  };

  const canDelete = (e: Endorsement) =>
    e.status === "draft" &&
    (e.employee_user_id === user?.id || isSuperAdmin || isPcMember);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEndorsement.mutateAsync(deleteTarget);
      toast.success("Draft endorsement deleted");
    } catch (err: any) {
      toast.error(err.message);
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return <p className="text-muted-foreground py-8 text-center">Loading...</p>;
  }

  if (!endorsements.length) {
    return <p className="text-muted-foreground py-8 text-center">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Control No.</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Leave Type</TableHead>
              <TableHead>Leave Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {endorsements.map((e) => {
              const style = statusStyles[e.status] || statusStyles.draft;
              const indicator = getRowIndicator(e);
              return (
                <TableRow
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => onSelect(e.id)}
                  tabIndex={0}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(e.id); } }}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {(e as any).control_number || "—"}
                      {indicator && (
                        <Badge className={`${indicator.className} border-0 text-[9px] font-semibold px-1.5 py-0`}>
                          {indicator.label}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {e.employee?.full_name || e.employee?.email || "—"}
                  </TableCell>
                  <TableCell className="capitalize text-sm">
                    {e.leave_type?.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(e.leave_start_date), "MMM d")} –{" "}
                    {format(new Date(e.leave_end_date), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${style.bg} ${style.text} border-0`}>
                      {style.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(e.updated_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    {canDelete(e) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-7 w-7 p-0"
                        onClick={(ev) => { ev.stopPropagation(); setDeleteTarget(e.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Endorsement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this draft endorsement? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
