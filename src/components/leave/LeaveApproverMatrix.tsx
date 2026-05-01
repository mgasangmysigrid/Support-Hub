import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, UserCheck, Shield, Eye, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { resolveApproversForEmployee } from "@/hooks/useLeaveApproverMatrix";

export default function LeaveApproverMatrix() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ─── Settings ───
  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ["leave-approval-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_approval_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles-approver"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_active")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  // ─── Groups ───
  const { data: groups, refetch: refetchGroups } = useQuery({
    queryKey: ["leave-approver-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_approver_groups")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: allGroupMembers, refetch: refetchAllMembers } = useQuery({
    queryKey: ["all-leave-group-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_group_members")
        .select("*, profiles:user_id(id, full_name, email)");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: allGroupApprovers, refetch: refetchAllApprovers } = useQuery({
    queryKey: ["all-leave-group-approvers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_group_approvers")
        .select("*, profiles:approver_id(id, full_name, email)");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // ─── Overrides ───
  const { data: overrides, refetch: refetchOverrides } = useQuery({
    queryKey: ["leave-approver-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_approver_overrides")
        .select("*, profiles:employee_id(id, full_name, email)");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: allOverrideApprovers, refetch: refetchAllOverrideApprovers } = useQuery({
    queryKey: ["all-leave-override-approvers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_override_approvers")
        .select("*, profiles:approver_id(id, full_name, email)");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // ─── Settings handlers ───
  const handleToggleEnabled = async (enabled: boolean) => {
    if (!settings?.id) return;
    const { error } = await supabase
      .from("leave_approval_settings")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", settings.id);
    if (error) toast.error(error.message);
    else {
      toast.success(enabled ? "Leave Approver Matrix enabled" : "Matrix disabled — using legacy logic");
      refetchSettings();
    }
  };

  const handleFallbackChange = async (approver_id: string) => {
    if (!settings?.id) return;
    const { error } = await supabase
      .from("leave_approval_settings")
      .update({
        fallback_approver_id: approver_id === "none" ? null : approver_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Global fallback updated");
      refetchSettings();
    }
  };

  const handleDefaultModeChange = async (mode: string) => {
    if (!settings?.id) return;
    const { error } = await supabase
      .from("leave_approval_settings")
      .update({ default_approval_mode: mode, updated_at: new Date().toISOString() })
      .eq("id", settings.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Default approval mode updated");
      refetchSettings();
    }
  };

  // ─── Group CRUD ───
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [groupMode, setGroupMode] = useState("single");
  const [savingGroup, setSavingGroup] = useState(false);

  const openGroupDialog = (group?: any) => {
    if (group) {
      setEditingGroup(group);
      setGroupName(group.name);
      setGroupDesc(group.description || "");
      setGroupMode(group.approval_mode);
    } else {
      setEditingGroup(null);
      setGroupName("");
      setGroupDesc("");
      setGroupMode("single");
    }
    setShowGroupDialog(true);
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim()) return;
    setSavingGroup(true);
    try {
      if (editingGroup) {
        const { error } = await supabase
          .from("leave_approver_groups")
          .update({ name: groupName, description: groupDesc || null, approval_mode: groupMode, updated_at: new Date().toISOString() })
          .eq("id", editingGroup.id);
        if (error) throw error;
        toast.success("Group updated");
      } else {
        const { error } = await supabase
          .from("leave_approver_groups")
          .insert({ name: groupName, description: groupDesc || null, approval_mode: groupMode });
        if (error) throw error;
        toast.success("Group created");
      }
      setShowGroupDialog(false);
      refetchGroups();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    const { error } = await supabase.from("leave_approver_groups").delete().eq("id", groupId);
    if (error) toast.error(error.message);
    else {
      toast.success("Group deleted");
      refetchGroups();
      refetchAllMembers();
      refetchAllApprovers();
    }
  };

  // ─── Group member / approver management ───
  const [manageGroupId, setManageGroupId] = useState<string | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState("");
  const [addApproverUserId, setAddApproverUserId] = useState("");

  const managedGroup = groups?.find((g: any) => g.id === manageGroupId);
  const managedMembers = allGroupMembers?.filter((m: any) => m.group_id === manageGroupId) || [];
  const managedApprovers = allGroupApprovers?.filter((a: any) => a.group_id === manageGroupId) || [];

  const handleAddGroupMember = async () => {
    if (!manageGroupId || !addMemberUserId) return;
    const { error } = await supabase.from("leave_group_members").insert({ group_id: manageGroupId, user_id: addMemberUserId });
    if (error) {
      if (error.code === "23505") toast.error("Employee already in this group");
      else toast.error(error.message);
    } else {
      toast.success("Member added");
      setAddMemberUserId("");
      refetchAllMembers();
    }
  };

  const handleRemoveGroupMember = async (memberId: string) => {
    const { error } = await supabase.from("leave_group_members").delete().eq("id", memberId);
    if (error) toast.error(error.message);
    else {
      toast.success("Member removed");
      refetchAllMembers();
    }
  };

  const handleAddGroupApprover = async () => {
    if (!manageGroupId || !addApproverUserId) return;
    const { error } = await supabase.from("leave_group_approvers").insert({ group_id: manageGroupId, approver_id: addApproverUserId });
    if (error) {
      if (error.code === "23505") toast.error("Approver already in this group");
      else toast.error(error.message);
    } else {
      toast.success("Approver added");
      setAddApproverUserId("");
      refetchAllApprovers();
    }
  };

  const handleRemoveGroupApprover = async (id: string) => {
    const { error } = await supabase.from("leave_group_approvers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Approver removed");
      refetchAllApprovers();
    }
  };

  // ─── Override CRUD ───
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideEmployeeId, setOverrideEmployeeId] = useState("");
  const [overrideMode, setOverrideMode] = useState("single");
  const [overrideApproverIds, setOverrideApproverIds] = useState<string[]>([]);
  const [addOverrideApproverId, setAddOverrideApproverId] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  const handleSaveOverride = async () => {
    if (!overrideEmployeeId || overrideApproverIds.length === 0) {
      toast.error("Select an employee and at least one approver");
      return;
    }
    setSavingOverride(true);
    try {
      // Check if override already exists
      const { data: existing } = await supabase
        .from("leave_approver_overrides")
        .select("id")
        .eq("employee_id", overrideEmployeeId)
        .maybeSingle();

      let overrideId: string;
      if (existing) {
        // Update existing
        await supabase
          .from("leave_approver_overrides")
          .update({ approval_mode: overrideMode, updated_at: new Date().toISOString() })
          .eq("id", (existing as any).id);
        overrideId = (existing as any).id;
        // Clear old approvers
        await supabase.from("leave_override_approvers").delete().eq("override_id", overrideId);
      } else {
        const { data: newOverride, error } = await supabase
          .from("leave_approver_overrides")
          .insert({ employee_id: overrideEmployeeId, approval_mode: overrideMode })
          .select("id")
          .single();
        if (error) throw error;
        overrideId = (newOverride as any).id;
      }

      // Insert approvers
      for (const appId of overrideApproverIds) {
        await supabase.from("leave_override_approvers").insert({ override_id: overrideId, approver_id: appId });
      }

      toast.success("Individual override saved");
      setShowOverrideDialog(false);
      setOverrideEmployeeId("");
      setOverrideMode("single");
      setOverrideApproverIds([]);
      refetchOverrides();
      refetchAllOverrideApprovers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleDeleteOverride = async (overrideId: string) => {
    const { error } = await supabase.from("leave_approver_overrides").delete().eq("id", overrideId);
    if (error) toast.error(error.message);
    else {
      toast.success("Override removed");
      refetchOverrides();
      refetchAllOverrideApprovers();
    }
  };

  // ─── Approval Preview ───
  const [previewEmployeeId, setPreviewEmployeeId] = useState("");
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handlePreview = async () => {
    if (!previewEmployeeId) return;
    setPreviewLoading(true);
    try {
      const result = await resolveApproversForEmployee(previewEmployeeId, false);
      // Resolve approver names
      if (result.approver_ids.length > 0) {
        const { data: approverProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", result.approver_ids);
        setPreviewResult({ ...result, approverProfiles: approverProfiles || [] });
      } else {
        setPreviewResult({ ...result, approverProfiles: [] });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const [overrideSearch, setOverrideSearch] = useState("");

  const modeLabel = (mode: string) => {
    switch (mode) {
      case "single": return "Single Approver";
      case "any_one": return "Any One Can Approve";
      case "all_must_approve": return "All Must Approve";
      default: return mode;
    }
  };

  const sourceLabel = (source: string) => {
    switch (source) {
      case "individual_override": return "Individual Override";
      case "group": return "Group";
      case "department": return "Department";
      case "fallback": return "Fallback";
      default: return "None";
    }
  };

  const sourceBadgeClass = (source: string) => {
    switch (source) {
      case "individual_override": return "bg-blue-500/10 text-blue-600 border-0";
      case "group": return "bg-purple-500/10 text-purple-600 border-0";
      case "department": return "bg-teal-500/10 text-teal-600 border-0";
      case "fallback": return "bg-amber-500/10 text-amber-600 border-0";
      default: return "bg-muted text-muted-foreground border-0";
    }
  };

  const getName = (id: string) => {
    const p = profiles?.find((pr) => pr.id === id);
    return p?.full_name || p?.email || id;
  };

  return (
    <div className="space-y-6">
      {/* A. Settings Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" /> Leave Approval Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Leave Approver Matrix</Label>
              <p className="text-xs text-muted-foreground">When disabled, the legacy department manager logic is used</p>
            </div>
            <Switch
              checked={settings?.enabled || false}
              onCheckedChange={handleToggleEnabled}
            />
          </div>

          {settings?.enabled && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Global Fallback Approver</Label>
                  <Select
                    value={settings?.fallback_approver_id || "none"}
                    onValueChange={handleFallbackChange}
                  >
                    <SelectTrigger><SelectValue placeholder="Select fallback..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No fallback</SelectItem>
                      {profiles?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Default Approval Mode</Label>
                  <Select
                    value={settings?.default_approval_mode || "single"}
                    onValueChange={handleDefaultModeChange}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single Approver</SelectItem>
                      <SelectItem value="any_one">Any One Can Approve</SelectItem>
                      <SelectItem value="all_must_approve">All Must Approve</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Resolution Priority:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Individual Override (highest priority)</li>
                  <li>Employee Group Assignment</li>
                  <li>Department Manager (legacy fallback)</li>
                  <li>Global Fallback Approver</li>
                </ol>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {settings?.enabled && (
        <>
          {/* B. Approver Groups */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" /> Approver Groups
              </CardTitle>
              <Button size="sm" onClick={() => openGroupDialog()}>
                <Plus className="h-4 w-4 mr-1" /> Create Group
              </Button>
            </CardHeader>
            <CardContent>
              {!groups?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No groups created yet</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Group Name</TableHead>
                        <TableHead>Employees</TableHead>
                        <TableHead>Approvers</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups.map((g: any) => {
                        const memberCount = allGroupMembers?.filter((m: any) => m.group_id === g.id).length || 0;
                        const approverNames = allGroupApprovers
                          ?.filter((a: any) => a.group_id === g.id)
                          .map((a: any) => a.profiles?.full_name || a.profiles?.email)
                          .join(", ") || "—";
                        return (
                          <TableRow key={g.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{g.name}</p>
                                {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-0 bg-muted">{memberCount}</Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">{approverNames}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-0 bg-purple-500/10 text-purple-600 text-xs">
                                {modeLabel(g.approval_mode)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setManageGroupId(g.id)} title="Manage members & approvers">
                                  <Users className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => openGroupDialog(g)} title="Edit group">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteGroup(g.id)} title="Delete group">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* C. Individual Overrides */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="h-4 w-4" /> Individual Overrides
              </CardTitle>
              <Button size="sm" onClick={() => setShowOverrideDialog(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Override
              </Button>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Search employees..."
                value={overrideSearch}
                onChange={(e) => setOverrideSearch(e.target.value)}
                className="max-w-xs h-8 mb-3"
              />
              {!overrides?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No individual overrides</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Approver(s)</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overrides
                        .filter((o: any) => {
                          if (!overrideSearch.trim()) return true;
                          const q = overrideSearch.toLowerCase();
                          return (o.profiles?.full_name || "").toLowerCase().includes(q) || (o.profiles?.email || "").toLowerCase().includes(q);
                        })
                        .map((o: any) => {
                          const approverNames = allOverrideApprovers
                            ?.filter((a: any) => a.override_id === o.id)
                            .map((a: any) => a.profiles?.full_name || a.profiles?.email)
                            .join(", ") || "—";
                          return (
                            <TableRow key={o.id}>
                              <TableCell className="font-medium text-sm">{o.profiles?.full_name || o.profiles?.email || "—"}</TableCell>
                              <TableCell className="text-sm max-w-[200px] truncate">{approverNames}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="border-0 bg-blue-500/10 text-blue-600 text-xs">
                                  {modeLabel(o.approval_mode)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteOverride(o.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* D. Approval Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" /> Approval Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Select an employee to preview their resolved approver assignment.</p>
              <div className="flex gap-2">
                <Select value={previewEmployeeId} onValueChange={setPreviewEmployeeId}>
                  <SelectTrigger className="max-w-xs"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                  <SelectContent>
                    {profiles?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handlePreview} disabled={!previewEmployeeId || previewLoading} size="sm">
                  {previewLoading ? "Resolving..." : "Preview"}
                </Button>
              </div>

              {previewResult && (
                <div className="rounded-md border p-4 space-y-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Source:</span>
                    <Badge variant="outline" className={sourceBadgeClass(previewResult.source)}>
                      {sourceLabel(previewResult.source)}
                      {previewResult.source_name ? ` — ${previewResult.source_name}` : ""}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Mode:</span>
                    <span className="text-sm">{modeLabel(previewResult.approval_mode)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Approver(s):</span>
                    {previewResult.approverProfiles?.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {previewResult.approverProfiles.map((ap: any) => (
                          <Badge key={ap.id} variant="outline" className="border-0 bg-primary/10 text-primary text-xs">
                            {ap.full_name || ap.email}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-destructive mt-1">⚠ No approver found — submission will be blocked</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── Group Dialog ─── */}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "Create Approver Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Group Name</Label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Engineering Team" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} placeholder="Description..." rows={2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Approval Mode</Label>
              <Select value={groupMode} onValueChange={setGroupMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Approver</SelectItem>
                  <SelectItem value="any_one">Any One Can Approve</SelectItem>
                  <SelectItem value="all_must_approve">All Must Approve</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGroupDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={savingGroup || !groupName.trim()}>
              {savingGroup ? "Saving..." : editingGroup ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Manage Group Members/Approvers Dialog ─── */}
      <Dialog open={!!manageGroupId} onOpenChange={(o) => !o && setManageGroupId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage: {managedGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {/* Members */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Employees in Group</Label>
              <div className="flex gap-2">
                <Select value={addMemberUserId} onValueChange={setAddMemberUserId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Add employee..." /></SelectTrigger>
                  <SelectContent>
                    {profiles
                      ?.filter((p) => !managedMembers.some((m: any) => m.user_id === p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddGroupMember} disabled={!addMemberUserId} size="sm">Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {managedMembers.map((m: any) => (
                  <Badge key={m.id} variant="outline" className="flex items-center gap-1 pr-1">
                    {m.profiles?.full_name || m.profiles?.email}
                    <button onClick={() => handleRemoveGroupMember(m.id)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {managedMembers.length === 0 && <p className="text-xs text-muted-foreground">No employees added</p>}
              </div>
            </div>

            {/* Approvers */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Approvers for Group</Label>
              <div className="flex gap-2">
                <Select value={addApproverUserId} onValueChange={setAddApproverUserId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Add approver..." /></SelectTrigger>
                  <SelectContent>
                    {profiles
                      ?.filter((p) => !managedApprovers.some((a: any) => a.approver_id === p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddGroupApprover} disabled={!addApproverUserId} size="sm">Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {managedApprovers.map((a: any) => (
                  <Badge key={a.id} variant="outline" className="flex items-center gap-1 pr-1 bg-primary/10 text-primary border-0">
                    {a.profiles?.full_name || a.profiles?.email}
                    <button onClick={() => handleRemoveGroupApprover(a.id)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {managedApprovers.length === 0 && <p className="text-xs text-muted-foreground">No approvers assigned</p>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Override Dialog ─── */}
      <Dialog open={showOverrideDialog} onOpenChange={(o) => { setShowOverrideDialog(o); if (!o) { setOverrideEmployeeId(""); setOverrideMode("single"); setOverrideApproverIds([]); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Individual Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Employee</Label>
              <Select value={overrideEmployeeId} onValueChange={setOverrideEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {profiles
                    ?.filter((p) => !overrides?.some((o: any) => o.employee_id === p.id))
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Approval Mode</Label>
              <Select value={overrideMode} onValueChange={setOverrideMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Approver</SelectItem>
                  <SelectItem value="any_one">Any One Can Approve</SelectItem>
                  <SelectItem value="all_must_approve">All Must Approve</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Approver(s)</Label>
              <div className="flex gap-2">
                <Select value={addOverrideApproverId} onValueChange={(v) => {
                  if (v && !overrideApproverIds.includes(v)) {
                    setOverrideApproverIds([...overrideApproverIds, v]);
                  }
                  setAddOverrideApproverId("");
                }}>
                  <SelectTrigger><SelectValue placeholder="Add approver..." /></SelectTrigger>
                  <SelectContent>
                    {profiles
                      ?.filter((p) => !overrideApproverIds.includes(p.id) && p.id !== overrideEmployeeId)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {overrideApproverIds.map((id) => (
                  <Badge key={id} variant="outline" className="flex items-center gap-1 pr-1">
                    {getName(id)}
                    <button onClick={() => setOverrideApproverIds(overrideApproverIds.filter((i) => i !== id))} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverrideDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveOverride} disabled={savingOverride || !overrideEmployeeId || overrideApproverIds.length === 0}>
              {savingOverride ? "Saving..." : "Save Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
