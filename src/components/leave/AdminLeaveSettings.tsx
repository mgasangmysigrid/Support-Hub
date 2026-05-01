import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { formatHoursToDays, getAnnualPTODays, getYearsOfService } from "@/lib/leave-utils";
import { Calendar, Pencil, Plus, Play, History } from "lucide-react";
import { lazy, Suspense } from "react";
const AdminLeaveCredits = lazy(() => import("./AdminLeaveCredits"));
const LeaveApproverMatrix = lazy(() => import("./LeaveApproverMatrix"));


export default function AdminLeaveSettings() {
  const { user, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  // ─── Schedules ───
  const { data: schedules, refetch: refetchSchedules } = useQuery({
    queryKey: ["admin-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedules").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [schedName, setSchedName] = useState("");
  const [schedDays, setSchedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [schedHours, setSchedHours] = useState("8");

  const handleAddSchedule = async () => {
    if (!schedName) return;
    const { error } = await supabase.from("schedules").insert({
      name: schedName,
      working_days: schedDays,
      hours_per_day: parseFloat(schedHours) || 8,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Schedule created");
      setShowAddSchedule(false);
      setSchedName("");
      setSchedDays([1, 2, 3, 4, 5]);
      setSchedHours("8");
      refetchSchedules();
    }
  };

  // ─── User PTO Profiles ───
  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles-leave"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, start_date, accrual_start_date, schedule_id, is_active, date_of_birth").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const [editProfile, setEditProfile] = useState<any>(null);
  const [epStartDate, setEpStartDate] = useState("");
  const [epAccrualDate, setEpAccrualDate] = useState("");
  const [epScheduleId, setEpScheduleId] = useState("");
  const [epDateOfBirth, setEpDateOfBirth] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSearch, setProfileSearch] = useState("");

  const handleSaveProfile = async () => {
    if (!editProfile) return;
    setSavingProfile(true);
    try {
      const res = await supabase.functions.invoke("manage-users", {
        body: {
          action: "update_leave_profile",
          user_id: editProfile.id,
          start_date: epStartDate || null,
          accrual_start_date: epAccrualDate || null,
          schedule_id: epScheduleId || null,
          date_of_birth: epDateOfBirth || null,
        },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || res.error?.message);
      toast.success("PTO profile updated");
      setEditProfile(null);
      queryClient.invalidateQueries({ queryKey: ["admin-profiles-leave"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // ─── PTO Adjustments ───
  const [adjUserId, setAdjUserId] = useState("");
  const [adjHours, setAdjHours] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjExpiry, setAdjExpiry] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const handleAdjustment = async () => {
    if (!adjUserId || !adjHours || !adjReason) {
      toast.error("All fields are required");
      return;
    }
    setAdjusting(true);
    try {
      const hours = parseFloat(adjHours);
      const { error } = await supabase.from("pto_ledger").insert({
        user_id: adjUserId,
        entry_type: "adjustment",
        hours,
        remaining_hours: hours > 0 ? hours : null,
        earned_at: new Date().toISOString().split("T")[0],
        expires_at: adjExpiry || null,
        created_by: user!.id,
        notes: adjReason,
      });
      if (error) throw error;

      // Audit log
      await supabase.from("leave_audit_log").insert({
        actor_id: user!.id,
        entity_type: "pto_adjustment",
        entity_id: adjUserId,
        action: "pto_adjustment",
        after_snapshot: { hours, reason: adjReason, expiry: adjExpiry || null },
        notes: adjReason,
      });

      toast.success("PTO adjustment applied");
      setAdjUserId("");
      setAdjHours("");
      setAdjReason("");
      setAdjExpiry("");
      queryClient.invalidateQueries({ queryKey: ["pto-balance"] });
      queryClient.invalidateQueries({ queryKey: ["pto-ledger"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdjusting(false);
    }
  };

  // ─── Department Capacity ───
  const { data: departments, refetch: refetchDepts } = useQuery({
    queryKey: ["admin-depts-capacity"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, max_out_per_day").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const handleCapacityChange = async (deptId: string, value: string) => {
    const maxOut = parseInt(value) || 2;
    const { error } = await supabase.from("departments").update({ max_out_per_day: maxOut }).eq("id", deptId);
    if (error) toast.error(error.message);
    else {
      toast.success("Capacity updated");
      refetchDepts();
    }
  };

  // ─── Run Accruals ───
  const [runningAccruals, setRunningAccruals] = useState(false);
  const handleRunAccruals = async () => {
    setRunningAccruals(true);
    try {
      const res = await supabase.functions.invoke("process-accruals");
      if (res.error) throw res.error;
      toast.success(`Accruals processed: ${res.data?.processed || 0} users, ${res.data?.expired || 0} expired, ${res.data?.birthday_credited || 0} birthday leaves`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRunningAccruals(false);
    }
  };

  // ─── Audit Log ───
  const { data: auditLogs } = useQuery({
    queryKey: ["leave-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_audit_log")
        .select("*, profiles:actor_id(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <Tabs defaultValue="credits">
      <TabsList className="mb-4 flex-wrap">
        <TabsTrigger value="credits">Leave Credits</TabsTrigger>
        <TabsTrigger value="approver">Leave Approver</TabsTrigger>
        <TabsTrigger value="profiles">User PTO Profiles</TabsTrigger>
        <TabsTrigger value="schedules">Schedules</TabsTrigger>
        <TabsTrigger value="adjustments">PTO Adjustments</TabsTrigger>
        <TabsTrigger value="capacity">Dept. Capacity</TabsTrigger>
        <TabsTrigger value="accruals">Accruals</TabsTrigger>
        <TabsTrigger value="audit">Audit Log</TabsTrigger>
      </TabsList>

      {/* ─── Leave Credits ─── */}
      <TabsContent value="credits">
        <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading...</div>}>
          <AdminLeaveCredits />
        </Suspense>
      </TabsContent>


      {/* ─── Leave Approver ─── */}
      <TabsContent value="approver">
        <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading...</div>}>
          <LeaveApproverMatrix />
        </Suspense>
      </TabsContent>

      {/* ─── User PTO Profiles ─── */}
      <TabsContent value="profiles" className="space-y-4">
        <Input
          placeholder="Search by name or email..."
          value={profileSearch}
          onChange={(e) => setProfileSearch(e.target.value)}
          className="max-w-xs h-9"
        />
        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>PTO Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles
                ?.filter((p) => {
                  if (!profileSearch.trim()) return true;
                  const q = profileSearch.toLowerCase();
                  return (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
                })
                .map((p) => {
                  const sched = schedules?.find((s) => s.id === p.schedule_id);
                  const yos = p.start_date ? getYearsOfService(p.start_date) : 0;
                  const annualDays = p.start_date ? getAnnualPTODays(yos) : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name || p.email || "—"}</TableCell>
                      <TableCell className="text-sm">{p.start_date || "—"}</TableCell>
                      <TableCell className="text-sm">{p.date_of_birth || "—"}</TableCell>
                      <TableCell className="text-sm">{sched?.name || "Default"}</TableCell>
                      <TableCell className="text-sm">{annualDays}d/yr</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.is_active ? "bg-emerald-500/10 text-emerald-600 border-0" : "bg-muted text-muted-foreground border-0"}>
                          {p.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditProfile(p);
                          setEpStartDate(p.start_date || "");
                          setEpAccrualDate(p.accrual_start_date || "");
                          setEpScheduleId(p.schedule_id || "");
                          setEpDateOfBirth(p.date_of_birth || "");
                        }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* ─── Schedules ─── */}
      <TabsContent value="schedules" className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowAddSchedule(true)}><Plus className="h-4 w-4 mr-2" /> Add Schedule</Button>
        </div>
        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Working Days</TableHead>
                <TableHead>Hours/Day</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules?.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-sm">{s.working_days.map((d: number) => dayNames[d]).join(", ")}</TableCell>
                  <TableCell className="text-sm">{s.hours_per_day}h</TableCell>
                  <TableCell>{s.is_default ? <Badge className="bg-primary/10 text-primary border-0">Default</Badge> : "—"}</TableCell>
                  <TableCell>{s.active ? "✓" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* ─── PTO Adjustments ─── */}
      <TabsContent value="adjustments" className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Manual PTO Adjustment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Employee</Label>
                <Select value={adjUserId} onValueChange={setAdjUserId}>
                  <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                  <SelectContent>
                    {profiles?.filter((p) => p.is_active).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hours (+/-)</Label>
                <Input type="number" value={adjHours} onChange={(e) => setAdjHours(e.target.value)} placeholder="e.g. 8 or -16" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Reason (required)</Label>
                <Textarea value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Reason for adjustment..." rows={2} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiry Date (optional)</Label>
                <Input type="date" value={adjExpiry} onChange={(e) => setAdjExpiry(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleAdjustment} disabled={adjusting || !adjUserId || !adjHours || !adjReason}>
              {adjusting ? "Applying..." : "Apply Adjustment"}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ─── Department Capacity ─── */}
      <TabsContent value="capacity" className="space-y-4">
        <p className="text-sm text-muted-foreground">Set maximum employees allowed out per day per department.</p>
        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Max Out Per Day</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments?.map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className="w-20 h-8"
                      defaultValue={d.max_out_per_day}
                      min={1}
                      onBlur={(e) => handleCapacityChange(d.id, e.target.value)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* ─── Accruals ─── */}
      <TabsContent value="accruals" className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Run Accrual Processing</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Manually trigger accrual processing for all eligible employees. This checks each user's accrual anniversary date and creates PTO entries. It also expires any past-due accrual buckets.
            </p>
            <p className="text-sm text-muted-foreground">
              This runs automatically daily via scheduled job. Use manual trigger for initial setup or testing.
            </p>
            <Button onClick={handleRunAccruals} disabled={runningAccruals}>
              <Play className="h-4 w-4 mr-2" /> {runningAccruals ? "Processing..." : "Run Accruals Now"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">PTO Policy Reference</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium mb-2">Annual PTO Rates</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>Year 1: 20 days</li>
                  <li>Year 2: 21 days</li>
                  <li>Year 3: 22 days</li>
                  <li>Year 4: 23 days</li>
                  <li>Year 5: 24 days</li>
                  <li>Year 6+: 25 days</li>
                </ul>
              </div>
              <div>
                <p className="font-medium mb-2">Rules</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>Probation: 6 months (no Paid Time Off)</li>
                  <li>Filing window: 90 days max</li>
                  <li>Notice: 14d for 1-2d leave, 30d for 3d+</li>
                  <li>Accrual: Monthly on anniversary day</li>
                  <li>Expiry: 1 year from earned date</li>
                  <li>Usage: FIFO (oldest first)</li>
                  <li>Birthday Leave: 1 day for 1+ yr employees</li>
                  <li className="text-[10px]">Credited 30d before DOB, expires 30d after</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ─── Audit Log ─── */}
      <TabsContent value="audit" className="space-y-4">
        <div className="rounded-lg border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs?.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No audit entries yet</TableCell></TableRow>
              )}
              {auditLogs?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">{format(new Date(log.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                  <TableCell className="text-sm">{log.profiles?.full_name || log.profiles?.email || "System"}</TableCell>
                  <TableCell className="text-sm font-medium">{log.action.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.entity_type}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{log.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* ─── Edit Profile Dialog ─── */}
      <Dialog open={!!editProfile} onOpenChange={(o) => !o && setEditProfile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit PTO Profile</DialogTitle>
            <DialogDescription>{editProfile?.full_name || editProfile?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Employment Start Date</Label>
              <Input type="date" value={epStartDate} onChange={(e) => setEpStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Accrual Start Date</Label>
              <Input type="date" value={epAccrualDate} onChange={(e) => setEpAccrualDate(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Defaults to employment start date if blank</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date of Birth</Label>
              <Input type="date" value={epDateOfBirth} onChange={(e) => setEpDateOfBirth(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Used for Birthday Leave benefit (1 day, credited 30 days before DOB for 1+ year employees)</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Work Schedule</Label>
              <Select value={epScheduleId} onValueChange={setEpScheduleId}>
                <SelectTrigger><SelectValue placeholder="Default schedule" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (Mon-Fri)</SelectItem>
                  {schedules?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editProfile?.start_date && (
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                <p>Probation ends: <strong>{format(new Date(new Date(editProfile.start_date).setMonth(new Date(editProfile.start_date).getMonth() + 6)), "MMM d, yyyy")}</strong></p>
                <p>Years of service: <strong>{getYearsOfService(editProfile.start_date).toFixed(1)}</strong></p>
                <p>PTO rate: <strong>{getAnnualPTODays(getYearsOfService(editProfile.start_date))} days/year</strong></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfile(null)}>Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Schedule Dialog ─── */}
      <Dialog open={showAddSchedule} onOpenChange={setShowAddSchedule}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Work Schedule</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={schedName} onChange={(e) => setSchedName(e.target.value)} placeholder="e.g. Tue-Sat" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Working Days</Label>
              <div className="flex gap-2 flex-wrap">
                {dayNames.map((name, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant={schedDays.includes(i) ? "default" : "outline"}
                    onClick={() => setSchedDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort())}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hours per Day</Label>
              <Input type="number" value={schedHours} onChange={(e) => setSchedHours(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSchedule(false)}>Cancel</Button>
            <Button onClick={handleAddSchedule} disabled={!schedName}>Create Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
