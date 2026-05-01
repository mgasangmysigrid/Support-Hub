import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function AddUserDialog({ open, onOpenChange, onCreated }: AddUserDialogProps) {
  // Account
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Organization
  const [departmentId, setDepartmentId] = useState("");
  const [role, setRole] = useState<AppRole>("employee");
  const [isManager, setIsManager] = useState(false);
  const [isAssignable, setIsAssignable] = useState(true);

  // Profile
  const [startDate, setStartDate] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [scheduleId, setScheduleId] = useState("default");

  const [creating, setCreating] = useState(false);

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: schedules } = useQuery({
    queryKey: ["schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedules").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPassword("");
    setDepartmentId("");
    setRole("employee");
    setIsManager(false);
    setIsAssignable(true);
    setStartDate("");
    setDateOfBirth("");
    setScheduleId("default");
  };

  const isValid = fullName.trim() && email.trim() && password.length >= 6 && departmentId && startDate && dateOfBirth;

  const handleSubmit = async () => {
    if (!isValid) {
      toast.error("Please fill in all required fields");
      return;
    }
    setCreating(true);
    try {
      // 1. Create user via edge function
      const res = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create_user_full",
          email: email.trim(),
          full_name: fullName.trim(),
          password,
          department_id: departmentId,
          role,
          is_manager: isManager,
          is_assignable: isAssignable,
          start_date: startDate,
          date_of_birth: dateOfBirth,
          schedule_id: scheduleId === "default" ? null : scheduleId,
        },
      });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || res.error?.message || "Failed to create user");
        return;
      }

      toast.success(`${fullName.trim()} has been added successfully`);
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>Create a fully configured user account. All required fields must be filled.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ─── Account ─── */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Account</h4>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Full Name <span className="text-destructive">*</span></Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Dela Cruz" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@mysigrid.com" type="email" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Password <span className="text-destructive">*</span></Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" type="password" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ─── Organization ─── */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Organization</h4>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Department <span className="text-destructive">*</span></Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                  <SelectContent>
                    {departments?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role <span className="text-destructive">*</span></Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="super_admin">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Is Department Manager?</Label>
                <Switch checked={isManager} onCheckedChange={setIsManager} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Assignable for Tickets</Label>
                <Switch checked={isAssignable} onCheckedChange={setIsAssignable} />
              </div>
            </div>
          </div>

          <Separator />

          {/* ─── Profile / Employment ─── */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Employment</h4>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date of Birth <span className="text-destructive">*</span></Label>
                <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Schedule <span className="text-destructive">*</span></Label>
                <Select value={scheduleId} onValueChange={setScheduleId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (Mon-Fri)</SelectItem>
                    {schedules?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={creating || !isValid}>
            {creating ? "Creating..." : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
