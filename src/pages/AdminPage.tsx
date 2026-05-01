import { useState, lazy, Suspense, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Database } from "@/integrations/supabase/types";
import { UserPlus, Trash2, Pencil, KeyRound, UserX, UserCheck } from "lucide-react";
import AdminLeaveSettings from "@/components/leave/AdminLeaveSettings";
const AdminHolidays = lazy(() => import("@/components/home/AdminHolidays"));
const ProfileSettingsTab = lazy(() => import("@/pages/ProfileSettings"));
const DocumentManagement = lazy(() => import("@/components/documents/DocumentManagement"));
const AppAdoptionTab = lazy(() => import("@/components/admin/AppAdoptionTab"));
const PushoverManagementTab = lazy(() => import("@/components/admin/PushoverManagementTab"));
const AddUserDialog = lazy(() => import("@/components/admin/AddUserDialog"));


type AppRole = Database["public"]["Enums"]["app_role"];

const PC_DEPT_ID = "9530bde6-2ba9-4a39-9dc6-1f49d79472c3";

export default function AdminPage() {
  const { isSuperAdmin, isManager, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "users";
  const setActiveTab = useCallback((tab: string) => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);
  const queryClient = useQueryClient();

  // Check if current user is a member of People & Culture department
  const { data: isPCMember } = useQuery({
    queryKey: ["is-pc-member", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("department_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("department_id", PC_DEPT_ID)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user,
  });

  const canAccessLeaveSettings = isSuperAdmin || !!isPCMember;

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles, refetch: refetchProfiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: userRoles } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: deptMembers } = useQuery({
    queryKey: ["all-dept-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("*, profile:profiles!department_members_user_id_fkey(full_name, email), department:departments!department_members_department_id_fkey(name)");
      if (error) throw error;
      return data;
    },
  });

  // State for department members tab
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedDept, setSelectedDept] = useState("");

  // State for create user dialog
  const [showCreateUser, setShowCreateUser] = useState(false);

  // State for delete user dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // State for edit user dialog
  const [editTarget, setEditTarget] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // State for reset password dialog
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // State for deactivate user
  const [deactivating, setDeactivating] = useState<string | null>(null);

  // Search / filter state
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [roleSearch, setRoleSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");

  if (!isSuperAdmin && !isManager) {
    return <div className="text-center py-20 text-muted-foreground">Access denied. Owner or Manager only.</div>;
  }

  const getRoleForUser = (userId: string) => {
    return userRoles?.find((r) => r.user_id === userId)?.role || "employee";
  };

  const handleAddMember = async () => {
    if (!selectedUser || !selectedDept) return;
    const { error } = await supabase.from("department_members").insert({
      department_id: selectedDept,
      user_id: selectedUser,
    });
    if (error) {
      if (error.code === "23505") toast.error("User already in this department");
      else toast.error(error.message);
    } else {
      toast.success("Member added");
      queryClient.invalidateQueries({ queryKey: ["all-dept-members"] });
    }
  };

  const handleToggle = async (memberId: string, field: "is_manager" | "is_assignable", current: boolean) => {
    const { error } = await supabase.from("department_members").update({ [field]: !current }).eq("id", memberId);
    if (error) toast.error(error.message);
    else queryClient.invalidateQueries({ queryKey: ["all-dept-members"] });
  };

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await supabase.from("department_members").delete().eq("id", memberId);
    if (error) toast.error(error.message);
    else {
      toast.success("Member removed");
      queryClient.invalidateQueries({ queryKey: ["all-dept-members"] });
    }
  };

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    // Insert new role first, then remove old ones — ensures user is never left without a role
    const { data: inserted, error: insertErr } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: newRole })
      .select("id")
      .single();
    if (insertErr) {
      // If duplicate (already has this role), just clean up others
      if (insertErr.code !== "23505") {
        toast.error(insertErr.message);
        return;
      }
    }
    // Delete all other roles for this user
    let deleteQuery = supabase.from("user_roles").delete().eq("user_id", userId).neq("role", newRole);
    const { error: delErr } = await deleteQuery;
    if (delErr) toast.error(delErr.message);
    else {
      toast.success("Role updated");
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
    }
  };

  const handleUserCreated = () => {
    refetchProfiles();
    queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
    queryClient.invalidateQueries({ queryKey: ["all-dept-members"] });
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke("manage-users", {
        body: { action: "delete_user", user_id: deleteTarget.id },
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || res.error?.message || "Failed to remove user");
      } else {
        toast.success("User removed successfully");
        setDeleteTarget(null);
        refetchProfiles();
        queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
        queryClient.invalidateQueries({ queryKey: ["all-dept-members"] });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleEditUser = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await supabase.functions.invoke("manage-users", {
        body: { action: "update_user", user_id: editTarget.id, email: editEmail, full_name: editFullName },
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || res.error?.message || "Failed to update user");
      } else {
        toast.success("User updated successfully");
        setEditTarget(null);
        refetchProfiles();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPassword) return;
    if (resetPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setResetting(true);
    try {
      const res = await supabase.functions.invoke("manage-users", {
        body: { action: "reset_password", user_id: resetTarget.id, new_password: resetPassword },
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || res.error?.message || "Failed to reset password");
      } else {
        toast.success("Password reset successfully");
        setResetTarget(null);
        setResetPassword("");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResetting(false);
    }
  };

  const openEditDialog = (p: { id: string; full_name: string | null; email: string | null }) => {
    setEditTarget({ id: p.id, full_name: p.full_name || "", email: p.email || "" });
    setEditFullName(p.full_name || "");
    setEditEmail(p.email || "");
  };

  const canDeleteUser = (targetId: string) => {
    if (!isSuperAdmin) return false; // Only owners can delete
    if (targetId === user?.id) return false;
    return true;
  };

  const canDeactivateUser = (targetId: string) => {
    if (targetId === user?.id) return false;
    const targetRole = getRoleForUser(targetId);
    if (targetRole === "super_admin" && !isSuperAdmin) return false;
    return true;
  };

  const handleDeactivateUser = async (targetId: string, currentlyActive: boolean) => {
    setDeactivating(targetId);
    try {
      const res = await supabase.functions.invoke("manage-users", {
        body: { action: "deactivate_user", user_id: targetId, is_active: !currentlyActive },
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || res.error?.message || "Failed to update user status");
      } else {
        toast.success(currentlyActive ? "User deactivated" : "User reactivated");
        refetchProfiles();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeactivating(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Panel</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="members">Department Members</TabsTrigger>
          <TabsTrigger value="roles">User Roles</TabsTrigger>
          {canAccessLeaveSettings && <TabsTrigger value="leave">Leave Settings</TabsTrigger>}
          {canAccessLeaveSettings && <TabsTrigger value="profiles">Profile Settings</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="holidays">Holidays</TabsTrigger>}
          {canAccessLeaveSettings && <TabsTrigger value="documents">Documents</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="adoption">App Adoption</TabsTrigger>}
          {(isSuperAdmin || isManager) && <TabsTrigger value="pushover">Push Notifications</TabsTrigger>}
        </TabsList>

        {/* ─── Users Tab ─── */}
        <TabsContent value="users" className="space-y-4 mt-4">
          {(() => {
            const filteredUsers = profiles?.filter((p) => {
              const q = userSearch.trim().toLowerCase();
              const matchesSearch = !q || (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
              const matchesStatus = userStatusFilter === "all" || (userStatusFilter === "active" ? p.is_active : !p.is_active);
              return matchesSearch && matchesStatus;
            });
            const countLabel = userStatusFilter === "all"
              ? `${filteredUsers?.length ?? 0} users total`
              : userStatusFilter === "active"
                ? `${filteredUsers?.length ?? 0} active users`
                : `${filteredUsers?.length ?? 0} inactive users`;
            return (<>
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-3 flex-1">
              <Input
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="max-w-xs h-9"
              />
              <Select value={userStatusFilter} onValueChange={(v) => setUserStatusFilter(v as "all" | "active" | "inactive")}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground whitespace-nowrap">{countLabel}</p>
            </div>
            <Button onClick={() => setShowCreateUser(true)} size="sm">
              <UserPlus className="mr-2 h-4 w-4" /> Add User
            </Button>
          </div>

          <div className="rounded-lg border bg-card overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers && filteredUsers.length > 0 ? filteredUsers.map((p) => {
                  const role = getRoleForUser(p.id);
                  const roleLabel = role === "super_admin" ? "Owner" : role === "manager" ? "Manager" : "Employee";
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm font-medium">{p.full_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.email}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          role === "super_admin" ? "bg-primary/20 text-primary" :
                          role === "manager" ? "bg-accent text-accent-foreground" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {roleLabel}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.is_active
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : "bg-destructive/15 text-destructive"
                        }`}>
                          {p.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="flex items-center gap-1">
                        {(isSuperAdmin || (isManager && role !== "super_admin")) && p.id !== user?.id && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setResetTarget({ id: p.id, name: p.full_name || p.email || p.id })}>
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {canDeactivateUser(p.id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={p.is_active ? "text-warning hover:text-warning" : "text-green-500 hover:text-green-500"}
                            onClick={() => handleDeactivateUser(p.id, p.is_active)}
                            disabled={deactivating === p.id}
                            title={p.is_active ? "Deactivate user" : "Reactivate user"}
                          >
                            {p.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </Button>
                        )}
                        {canDeleteUser(p.id) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget({ id: p.id, name: p.full_name || p.email || p.id })}
                            title="Permanently delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : p.id === user?.id ? (
                          <span className="text-xs text-muted-foreground">You</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {userSearch.trim()
                        ? "No users match your search"
                        : userStatusFilter === "active"
                          ? "No active users found"
                          : userStatusFilter === "inactive"
                            ? "No inactive users found"
                            : "No users found"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          </>);
          })()}
        </TabsContent>

        {/* ─── Department Members Tab ─── */}
        <TabsContent value="members" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Add Member to Department</CardTitle></CardHeader>
            <CardContent className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">User</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger><SelectValue placeholder="Select user..." /></SelectTrigger>
                  <SelectContent>
                    {profiles?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Department</Label>
                <Select value={selectedDept} onValueChange={setSelectedDept}>
                  <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                  <SelectContent>
                    {departments?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddMember} disabled={!selectedUser || !selectedDept}>Add</Button>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 mb-3">
            <Label className="text-xs whitespace-nowrap">Filter by Department</Label>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-card overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Assignable</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deptMembers
                  ?.filter((m) => deptFilter === "all" || m.department_id === deptFilter)
                  .map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{m.profile?.full_name || "—"}</TableCell>
                    <TableCell className="text-sm">{m.department?.name}</TableCell>
                    <TableCell>
                      <Switch checked={m.is_manager} onCheckedChange={() => handleToggle(m.id, "is_manager", m.is_manager)} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={m.is_assignable} onCheckedChange={() => handleToggle(m.id, "is_assignable", m.is_assignable)} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleRemoveMember(m.id)}>Remove</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ─── Roles Tab (Owners and Managers) ─── */}
        <TabsContent value="roles" className="mt-4 space-y-3">
          <Input
            placeholder="Search by name or email..."
            value={roleSearch}
            onChange={(e) => setRoleSearch(e.target.value)}
            className="max-w-xs h-9"
          />
          <div className="rounded-lg border bg-card overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles
                  ?.filter((p) => {
                    if (!roleSearch.trim()) return true;
                    const q = roleSearch.toLowerCase();
                    return (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
                  })
                  .map((p) => {
                  const currentRole = getRoleForUser(p.id);
                  const isTargetOwner = currentRole === "super_admin";
                  // Managers can't change Owner roles, and can't promote to Owner
                  const canChangeRole = isSuperAdmin || (!isTargetOwner && isManager);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm font-medium">{p.full_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.email}</TableCell>
                      <TableCell>
                        {canChangeRole ? (
                          <Select value={currentRole} onValueChange={(v) => handleRoleChange(p.id, v as AppRole)}>
                            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="employee">Employee</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              {isSuperAdmin && <SelectItem value="super_admin">Owner</SelectItem>}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/20 text-primary">Owner</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        </div>
        </TabsContent>

        {/* ─── Leave Settings Tab ─── */}
        {canAccessLeaveSettings && (
          <TabsContent value="leave" className="mt-4">
            <AdminLeaveSettings />
          </TabsContent>
        )}

        {/* Profile Settings Tab */}
        {canAccessLeaveSettings && (
          <TabsContent value="profiles" className="mt-4">
            <Suspense fallback={<div className="flex items-center justify-center py-10 text-muted-foreground">Loading...</div>}>
              <ProfileSettingsTab embedded />
            </Suspense>
          </TabsContent>
        )}

        {/* Holidays Tab */}
        {isSuperAdmin && (
          <TabsContent value="holidays" className="mt-4">
            <Suspense fallback={<div className="flex items-center justify-center py-10 text-muted-foreground">Loading...</div>}>
              <AdminHolidays />
            </Suspense>
          </TabsContent>
        )}

        {/* ─── Documents Tab ─── */}
        {canAccessLeaveSettings && (
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading...</div>}>
            <TabsContent value="documents" className="mt-4">
              <DocumentManagement />
            </TabsContent>
          </Suspense>
        )}

        {/* ─── App Adoption Tab ─── */}
        {isSuperAdmin && (
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading...</div>}>
            <TabsContent value="adoption" className="mt-4">
              <AppAdoptionTab />
            </TabsContent>
          </Suspense>
        )}

        {/* ─── Push Notifications (Pushover) Tab ─── */}
        {(isSuperAdmin || isManager) && (
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading...</div>}>
            <TabsContent value="pushover" className="mt-4">
              <PushoverManagementTab />
            </TabsContent>
          </Suspense>
        )}

      </Tabs>

      {/* ─── Create User Dialog ─── */}
      <Suspense fallback={null}>
        <AddUserDialog open={showCreateUser} onOpenChange={setShowCreateUser} onCreated={handleUserCreated} />
      </Suspense>

      {/* ─── Delete User Confirmation ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently remove <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Removing..." : "Remove User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Edit User Dialog ─── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Full Name</Label>
              <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditUser} disabled={saving || !editEmail}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reset Password Dialog ─── */}

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setResetPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for <strong>{resetTarget?.name}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">New Password</Label>
              <Input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Minimum 6 characters" type="password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetTarget(null); setResetPassword(""); }}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={resetting || !resetPassword}>
              {resetting ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
