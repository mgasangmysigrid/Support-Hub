import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Building2, Users } from "lucide-react";

interface EditDepartmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  currentDepartmentIds: string[];
  currentAssigneeIds: string[];
  userId: string;
  onSaved: () => void;
}

interface DepartmentSelection {
  departmentId: string;
  selectedMembers: string[];
}

export function EditDepartmentsDialog({
  open,
  onOpenChange,
  ticketId,
  currentDepartmentIds,
  currentAssigneeIds,
  userId,
  onSaved,
}: EditDepartmentsDialogProps) {
  const [selections, setSelections] = useState<DepartmentSelection[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: departments } = useQuery({
    queryKey: ["all-departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: allMembers } = useQuery({
    queryKey: ["all-dept-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("*, profile:profiles!department_members_user_id_fkey(id, full_name, email, is_active)")
        .eq("is_assignable", true);
      if (error) throw error;
      return data?.filter((m) => m.profile?.is_active) || [];
    },
  });

  // Initialize selections when dialog opens
  useEffect(() => {
    if (open && departments) {
      const initial: DepartmentSelection[] = currentDepartmentIds.map((deptId) => ({
        departmentId: deptId,
        selectedMembers: currentAssigneeIds.filter((uid) =>
          allMembers?.some((m) => m.user_id === uid && m.department_id === deptId)
        ) || [],
      }));
      // Include assignees that don't match any current department (keep them in first dept)
      if (initial.length > 0) {
        const accountedFor = initial.flatMap((s) => s.selectedMembers);
        const unaccounted = currentAssigneeIds.filter((uid) => !accountedFor.includes(uid));
        if (unaccounted.length > 0) {
          initial[0].selectedMembers = [...initial[0].selectedMembers, ...unaccounted];
        }
      }
      setSelections(initial.length > 0 ? initial : []);
    }
  }, [open, departments, currentDepartmentIds, currentAssigneeIds, allMembers]);

  const toggleDepartment = (deptId: string) => {
    setSelections((prev) => {
      const exists = prev.find((s) => s.departmentId === deptId);
      if (exists) {
        return prev.filter((s) => s.departmentId !== deptId);
      }
      return [...prev, { departmentId: deptId, selectedMembers: [] }];
    });
  };

  const toggleMember = (deptId: string, memberId: string) => {
    setSelections((prev) =>
      prev.map((s) => {
        if (s.departmentId !== deptId) return s;
        const has = s.selectedMembers.includes(memberId);
        return {
          ...s,
          selectedMembers: has
            ? s.selectedMembers.filter((id) => id !== memberId)
            : [...s.selectedMembers, memberId],
        };
      })
    );
  };

  const getMembersForDept = (deptId: string) =>
    allMembers?.filter((m) => m.department_id === deptId) || [];

  const allSelectedMembers = selections.flatMap((s) => s.selectedMembers);

  const handleSave = async () => {
    if (selections.length === 0) {
      toast.error("Select at least one department");
      return;
    }
    if (allSelectedMembers.length === 0) {
      toast.error("Select at least one assignee");
      return;
    }

    setSaving(true);
    try {
      const newDeptIds = selections.map((s) => s.departmentId);
      const newAssigneeIds = [...new Set(allSelectedMembers)];

      // Update primary department_id to first selected
      await supabase
        .from("tickets")
        .update({ department_id: newDeptIds[0], assignee_id: newAssigneeIds[0] })
        .eq("id", ticketId);

      // Replace ticket_departments: delete old, insert new
      await supabase.from("ticket_departments").delete().eq("ticket_id", ticketId);
      await supabase.from("ticket_departments").insert(
        newDeptIds.map((deptId) => ({ ticket_id: ticketId, department_id: deptId }))
      );

      // Replace ticket_assignees: delete old, insert new
      await supabase.from("ticket_assignees").delete().eq("ticket_id", ticketId);
      await supabase.from("ticket_assignees").insert(
        newAssigneeIds.map((uid) => ({
          ticket_id: ticketId,
          user_id: uid,
          added_by: userId,
        }))
      );

      // Log activity
      await supabase.from("ticket_activity").insert({
        ticket_id: ticketId,
        actor_id: userId,
        action: "departments_changed",
        from_value: { department_ids: currentDepartmentIds, assignee_ids: currentAssigneeIds },
        to_value: { department_ids: newDeptIds, assignee_ids: newAssigneeIds },
      });

      toast.success("Departments & assignees updated");
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Departments & Assignees</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {departments?.map((dept) => {
            const isSelected = selections.some((s) => s.departmentId === dept.id);
            const members = getMembersForDept(dept.id);
            const selection = selections.find((s) => s.departmentId === dept.id);

            return (
              <div key={dept.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`dept-${dept.id}`}
                    checked={isSelected}
                    onCheckedChange={() => toggleDepartment(dept.id)}
                  />
                  <Label htmlFor={`dept-${dept.id}`} className="cursor-pointer flex items-center gap-1.5 font-medium text-sm">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {dept.name}
                  </Label>
                </div>

                {isSelected && members.length > 0 && (
                  <>
                    <Separator />
                    <div className="pl-6 space-y-1.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" /> Assign members:
                      </span>
                      {members.map((m) => (
                        <div key={m.user_id} className="flex items-center gap-2">
                          <Checkbox
                            id={`member-${dept.id}-${m.user_id}`}
                            checked={selection?.selectedMembers.includes(m.user_id) || false}
                            onCheckedChange={() => toggleMember(dept.id, m.user_id)}
                          />
                          <Label htmlFor={`member-${dept.id}-${m.user_id}`} className="cursor-pointer text-sm">
                            {m.profile?.full_name || m.profile?.email || m.user_id}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {isSelected && members.length === 0 && (
                  <p className="pl-6 text-xs text-muted-foreground">No assignable members</p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || selections.length === 0 || allSelectedMembers.length === 0}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
