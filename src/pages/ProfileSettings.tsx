import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ReadOnlyFieldStatic, EditableFieldInput } from "@/components/ProfileFields";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search, Plus, Eye, Pencil, ArrowLeft, Save, X, User, Mail, Phone,
  MapPin, Briefcase, Building2, Calendar, Clock, UserCheck, Shield,
  AlertCircle, Users, Camera, Loader2,
} from "lucide-react";
import { format } from "date-fns";

const PC_DEPT_ID = "9530bde6-2ba9-4a39-9dc6-1f49d79472c3";

function formatTime12h(time: string | null): string {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  mobile_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  personal_email: string | null;
  current_address: string | null;
  permanent_address: string | null;
  city_province: string | null;
  postal_code: string | null;
  country: string | null;
  job_title: string | null;
  employment_type: string | null;
  work_location: string | null;
  reporting_manager_id: string | null;
  profile_photo_url: string | null;
  profile_updated_at: string | null;
  profile_updated_by: string | null;
  start_date: string | null;
  date_of_birth: string | null;
  employee_id: string | null;
  schedule_type: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
  work_timezone: string | null;
};

type ViewMode = "list" | "view" | "edit" | "add";

export default function ProfileSettings({ embedded }: { embedded?: boolean } = {}) {
  const { user, isSuperAdmin } = useAuth();
  
  const qc = useQueryClient();

  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get("psView") as ViewMode) || "list";
  const selectedId = searchParams.get("psId") || null;
  const navigatePS = useCallback((v: ViewMode, id?: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "profiles");
      if (v === "list") {
        next.delete("psId");
        next.delete("psView");
      } else {
        next.set("psView", v);
        if (id !== undefined) {
          if (id) next.set("psId", id);
          else next.delete("psId");
        }
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formDept, setFormDept] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageSize = 20;

  // Access check
  const { data: isPCMember, isLoading: pcLoading } = useQuery({
    queryKey: ["ps-pc-member", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("department_members")
        .select("id")
        .eq("user_id", user!.id)
        .eq("department_id", PC_DEPT_ID)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const hasAccess = isSuperAdmin || !!isPCMember;

  // Data queries
  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ["ps-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data as ProfileRow[];
    },
    enabled: hasAccess,
  });

  const { data: departments } = useQuery({
    queryKey: ["ps-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: hasAccess,
  });

  const { data: allDeptMembers } = useQuery({
    queryKey: ["ps-dept-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("user_id, department_id, departments(name)");
      if (error) throw error;
      return data;
    },
    enabled: hasAccess,
  });

  const { data: allProfiles } = useQuery({
    queryKey: ["ps-all-profiles-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: hasAccess,
  });

  // Derived data
  const userDeptMap = useMemo(() => {
    const m: Record<string, { id: string; name: string }[]> = {};
    allDeptMembers?.forEach((dm: any) => {
      if (!m[dm.user_id]) m[dm.user_id] = [];
      m[dm.user_id].push({ id: dm.department_id, name: dm.departments?.name ?? "—" });
    });
    return m;
  }, [allDeptMembers]);

  const getDeptName = (userId: string) => userDeptMap[userId]?.[0]?.name ?? "—";
  const getDeptId = (userId: string) => userDeptMap[userId]?.[0]?.id ?? "";

  const jobTitles = useMemo(() => {
    const s = new Set<string>();
    profiles?.forEach((p) => { if (p.job_title) s.add(p.job_title); });
    return Array.from(s).sort();
  }, [profiles]);

  const filtered = useMemo(() => {
    let list = profiles ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.full_name || "").toLowerCase().includes(q) ||
          (p.email || "").toLowerCase().includes(q) ||
          (p.employee_id || "").toLowerCase().includes(q) ||
          p.id.slice(0, 8).toUpperCase().includes(q.toUpperCase())
      );
    }
    if (deptFilter !== "all") {
      list = list.filter((p) => getDeptId(p.id) === deptFilter);
    }
    if (jobFilter !== "all") {
      list = list.filter((p) => p.job_title === jobFilter);
    }
    return list;
  }, [profiles, search, deptFilter, jobFilter, userDeptMap]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pagedList = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const selectedProfile = profiles?.find((p) => p.id === selectedId) ?? null;

  // Re-populate form when returning to edit view from another app/tab
  useEffect(() => {
    if ((view === "edit") && selectedProfile && !form.full_name && selectedProfile.full_name) {
      setForm({
        full_name: selectedProfile.full_name ?? "",
        email: selectedProfile.email ?? "",
        personal_email: selectedProfile.personal_email ?? "",
        mobile_number: selectedProfile.mobile_number ?? "",
        emergency_contact_name: selectedProfile.emergency_contact_name ?? "",
        emergency_contact_number: selectedProfile.emergency_contact_number ?? "",
        current_address: selectedProfile.current_address ?? "",
        permanent_address: selectedProfile.permanent_address ?? "",
        city_province: selectedProfile.city_province ?? "",
        postal_code: selectedProfile.postal_code ?? "",
        country: selectedProfile.country ?? "",
        job_title: selectedProfile.job_title ?? "",
        employment_type: selectedProfile.employment_type ?? "",
        work_location: selectedProfile.work_location ?? "",
        start_date: selectedProfile.start_date ?? "",
        reporting_manager_id: selectedProfile.reporting_manager_id ?? "",
        employee_id: selectedProfile.employee_id ?? "",
        schedule_type: selectedProfile.schedule_type ?? "fixed",
        work_start_time: selectedProfile.work_start_time ?? "08:00",
        work_end_time: selectedProfile.work_end_time ?? "17:00",
        work_timezone: selectedProfile.work_timezone ?? "Asia/Manila",
      });
      setFormDept(getDeptId(selectedProfile.id));
      setPhotoPreview(selectedProfile.profile_photo_url);
    }
  }, [view, selectedProfile, form.full_name]);

  const managerQuery = useQuery({
    queryKey: ["ps-manager", selectedProfile?.reporting_manager_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", selectedProfile!.reporting_manager_id!)
        .maybeSingle();
      return data?.full_name ?? "—";
    },
    enabled: !!selectedProfile?.reporting_manager_id,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          ...updates,
          profile_updated_at: new Date().toISOString(),
          profile_updated_by: user?.email ?? "Admin",
        } as any)
        .eq("id", id);
      if (error) throw error;

      // Update department membership if changed
      if (formDept && formDept !== getDeptId(id)) {
        // Remove old memberships
        await supabase.from("department_members").delete().eq("user_id", id);
        if (formDept !== "none") {
          await supabase.from("department_members").insert({ user_id: id, department_id: formDept });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ps-profiles"] });
      qc.invalidateQueries({ queryKey: ["ps-dept-members"] });
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Employee updated", { description: "Changes have been saved." });
      navigatePS("list");
    },
    onError: (err: any) => {
      toast.error("Error saving", { description: err.message });
    },
  });

  const startEdit = (p: ProfileRow) => {
    setForm({
      full_name: p.full_name ?? "",
      email: p.email ?? "",
      personal_email: p.personal_email ?? "",
      mobile_number: p.mobile_number ?? "",
      emergency_contact_name: p.emergency_contact_name ?? "",
      emergency_contact_number: p.emergency_contact_number ?? "",
      current_address: p.current_address ?? "",
      permanent_address: p.permanent_address ?? "",
      city_province: p.city_province ?? "",
      postal_code: p.postal_code ?? "",
      country: p.country ?? "",
      job_title: p.job_title ?? "",
      employment_type: p.employment_type ?? "",
      work_location: p.work_location ?? "",
      start_date: p.start_date ?? "",
      reporting_manager_id: p.reporting_manager_id ?? "",
      employee_id: p.employee_id ?? "",
      schedule_type: p.schedule_type ?? "fixed",
      work_start_time: p.work_start_time ?? "08:00",
      work_end_time: p.work_end_time ?? "17:00",
      work_timezone: p.work_timezone ?? "Asia/Manila",
    });
    setFormDept(getDeptId(p.id));
    setPhotoPreview(p.profile_photo_url);
    navigatePS("edit", p.id);
  };

  const startAdd = () => {
    setForm({
      full_name: "", email: "", personal_email: "", mobile_number: "",
      emergency_contact_name: "", emergency_contact_number: "",
      current_address: "", permanent_address: "", city_province: "",
      postal_code: "", country: "", job_title: "", employment_type: "Full-time",
      work_location: "", start_date: "", reporting_manager_id: "", employee_id: "",
      schedule_type: "fixed", work_start_time: "08:00", work_end_time: "17:00", work_timezone: "Asia/Manila",
    });
    setFormDept("");
    navigatePS("add");
  };

  const handleSaveEdit = () => {
    if (!selectedId) return;
    const { reporting_manager_id, ...rest } = form;
    const updates: Record<string, any> = {
      ...rest,
      reporting_manager_id: reporting_manager_id || null,
    };
    if (updates.schedule_type === "flexible") {
      updates.work_start_time = null;
      updates.work_end_time = null;
    }
    saveMutation.mutate({ id: selectedId, updates });
  };

  const handleSaveNew = async () => {
    if (!form.full_name?.trim() || !form.email?.trim()) {
      toast.error("Validation error", { description: "Full Name and Work Email are required." });
      return;
    }
    try {
      const res = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create_user",
          email: form.email,
          full_name: form.full_name,
          password: "Temp@1234",
        },
      });
      if (res.error || res.data?.error) {
        toast.error("Error creating user", { description: res.data?.error || res.error?.message });
        return;
      }
      const newUserId = res.data?.user?.id;
      if (newUserId) {
        const { reporting_manager_id, email: _email, full_name: _fn, ...rest } = form;
        const profileUpdates: Record<string, any> = {
          ...rest,
          reporting_manager_id: reporting_manager_id || null,
          profile_updated_at: new Date().toISOString(),
          profile_updated_by: user?.email ?? "Admin",
        };
        if (profileUpdates.schedule_type === "flexible") {
          profileUpdates.work_start_time = null;
          profileUpdates.work_end_time = null;
        }
        await supabase.from("profiles").update(profileUpdates as any).eq("id", newUserId);

        if (formDept) {
          await supabase.from("department_members").insert({ user_id: newUserId, department_id: formDept });
        }
      }
      qc.invalidateQueries({ queryKey: ["ps-profiles"] });
      qc.invalidateQueries({ queryKey: ["ps-dept-members"] });
      toast.success("Employee added", { description: `${form.full_name} has been created with a temporary password.` });
      navigatePS("list");
    } catch (err: any) {
      toast.error("Error", { description: err.message });
    }
  };

  const openView = (p: ProfileRow) => {
    navigatePS("view", p.id);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetUserId: string) => {
    let file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Invalid file", { description: "Please upload an image file." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      try {
        toast.info("Optimizing image for upload...");
        const { optimizeImageBeforeUpload } = await import("@/lib/image-optimizer");
        const result = await optimizeImageBeforeUpload(file);
        file = result.file;
      } catch (err: any) {
        toast.error("File too large", { description: err.message || "Maximum file size is 5MB." });
        return;
      }
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `${targetUserId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl + "?t=" + Date.now();

      await supabase.from("profiles").update({
        profile_photo_url: publicUrl,
        profile_updated_at: new Date().toISOString(),
        profile_updated_by: user?.email ?? "Admin",
      } as any).eq("id", targetUserId);

      setPhotoPreview(publicUrl);
      qc.invalidateQueries({ queryKey: ["ps-profiles"] });
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Photo updated", { description: "Profile photo has been uploaded." });
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initials = (name: string | null) =>
    (name ?? "U").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  // --- ACCESS DENIED ---
  if (pcLoading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <Shield className="h-8 w-8" />
        <p className="font-medium">You do not have permission to access Profile Settings.</p>
      </div>
    );
  }

  // --- VIEW / EDIT EMPLOYEE ---
  if (view === "view" && selectedProfile) {
    const deptName = getDeptName(selectedProfile.id);
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigatePS("list")} className="gap-1.5 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </Button>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Employee Profile</h1>
          <Button size="sm" onClick={() => startEdit(selectedProfile)} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Edit Employee
          </Button>
        </div>

        {/* Header */}
        <Card>
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6">
            <Avatar className="h-20 w-20 text-2xl border-2 border-primary/20">
              {selectedProfile.profile_photo_url && <AvatarImage src={selectedProfile.profile_photo_url} />}
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">{initials(selectedProfile.full_name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{selectedProfile.full_name ?? "—"}</h2>
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20 text-xs">Active</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{selectedProfile.job_title ?? "Employee"}</p>
              <p className="text-sm text-muted-foreground">{deptName}</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">Employee ID: {selectedProfile.employee_id || selectedProfile.id.slice(0, 8).toUpperCase()}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> Contact Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ReadOnlyFieldStatic label="Work Email" value={selectedProfile.email} icon={Mail} />
              <ReadOnlyFieldStatic label="Personal Email" value={selectedProfile.personal_email} icon={Mail} />
              <ReadOnlyFieldStatic label="Mobile Number" value={selectedProfile.mobile_number} icon={Phone} />
              <ReadOnlyFieldStatic label="Emergency Contact Name" value={selectedProfile.emergency_contact_name} icon={UserCheck} />
              <ReadOnlyFieldStatic label="Emergency Contact Number" value={selectedProfile.emergency_contact_number} icon={Phone} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Address Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ReadOnlyFieldStatic label="Current Address" value={selectedProfile.current_address} icon={MapPin} />
              <ReadOnlyFieldStatic label="Permanent Address" value={selectedProfile.permanent_address} icon={MapPin} />
              <ReadOnlyFieldStatic label="City / Province" value={selectedProfile.city_province} icon={Building2} />
              <ReadOnlyFieldStatic label="Postal Code" value={selectedProfile.postal_code} />
              <ReadOnlyFieldStatic label="Country" value={selectedProfile.country} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> Job Role</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ReadOnlyFieldStatic label="Job Title" value={selectedProfile.job_title} icon={Briefcase} />
              <ReadOnlyFieldStatic label="Department" value={deptName} icon={Building2} />
              <ReadOnlyFieldStatic label="Reporting Manager" value={managerQuery.data ?? "—"} icon={User} />
              <ReadOnlyFieldStatic label="Employment Type" value={selectedProfile.employment_type} icon={Shield} />
              <ReadOnlyFieldStatic label="Hire Date" value={selectedProfile.start_date ? format(new Date(selectedProfile.start_date), "MMM d, yyyy") : null} icon={Calendar} />
              <ReadOnlyFieldStatic label="Work Location" value={selectedProfile.work_location} icon={MapPin} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Working Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ReadOnlyFieldStatic label="Schedule Type" value={selectedProfile.schedule_type === "flexible" ? "Flexible" : "Fixed"} icon={Clock} />
              {selectedProfile.schedule_type !== "flexible" && (
                <ReadOnlyFieldStatic
                  label="Working Hours"
                  value={selectedProfile.work_start_time && selectedProfile.work_end_time
                    ? `${formatTime12h(selectedProfile.work_start_time)} – ${formatTime12h(selectedProfile.work_end_time)} ${selectedProfile.work_timezone === "Asia/Manila" ? "Manila Time" : selectedProfile.work_timezone ?? ""}`
                    : "—"}
                  icon={Calendar}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Profile Activity</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ReadOnlyFieldStatic label="Last Updated" value={selectedProfile.profile_updated_at ? format(new Date(selectedProfile.profile_updated_at), "MMM d, yyyy 'at' h:mm a") : "—"} icon={Calendar} />
              <ReadOnlyFieldStatic label="Updated By" value={selectedProfile.profile_updated_by ?? "—"} icon={User} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // --- EDIT / ADD FORM ---
  if (view === "edit" || view === "add") {
    const isAdd = view === "add";
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigatePS("list")} className="gap-1.5 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{isAdd ? "Add Employee" : "Edit Employee"}</h1>

        {/* Header section */}
        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-primary" /> Profile Header</CardTitle></CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-6">
            {/* Photo upload */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative group">
                <Avatar className="h-24 w-24 text-2xl border-2 border-primary/20">
                  {(photoPreview || selectedProfile?.profile_photo_url) && (
                    <AvatarImage src={photoPreview || selectedProfile?.profile_photo_url || ""} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">
                    {initials(form.full_name || selectedProfile?.full_name || null)}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 text-background animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-background" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const targetId = selectedId || "new";
                    if (selectedId) handlePhotoUpload(e, selectedId);
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {uploading ? "Uploading..." : "Click to change"}
              </span>
            </div>

            {/* Name / ID / Status */}
            <div className="flex-1 grid gap-4 sm:grid-cols-2">
              <EditableFieldInput label="Full Name" field="full_name" icon={User} form={form} setForm={setForm} />
              <EditableFieldInput label="Employee ID" field="employee_id" icon={Shield} form={form} setForm={setForm} />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <div className="pt-2"><Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-xs">Active</Badge></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Contact */}
          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> Contact Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <EditableFieldInput label="Work Email" field="email" icon={Mail} type="email" form={form} setForm={setForm} />
              <EditableFieldInput label="Personal Email" field="personal_email" icon={Mail} type="email" form={form} setForm={setForm} />
              <EditableFieldInput label="Mobile Number" field="mobile_number" icon={Phone} form={form} setForm={setForm} />
              <EditableFieldInput label="Emergency Contact Name" field="emergency_contact_name" icon={UserCheck} form={form} setForm={setForm} />
              <EditableFieldInput label="Emergency Contact Number" field="emergency_contact_number" icon={Phone} form={form} setForm={setForm} />
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Address Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <EditableFieldInput label="Current Address" field="current_address" icon={MapPin} form={form} setForm={setForm} />
              <EditableFieldInput label="Permanent Address" field="permanent_address" icon={MapPin} form={form} setForm={setForm} />
              <EditableFieldInput label="City / Province" field="city_province" icon={Building2} form={form} setForm={setForm} />
              <EditableFieldInput label="Postal Code" field="postal_code" form={form} setForm={setForm} />
              <EditableFieldInput label="Country" field="country" form={form} setForm={setForm} />
            </CardContent>
          </Card>

          {/* Job Role */}
          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> Job Role</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <EditableFieldInput label="Job Title" field="job_title" icon={Briefcase} form={form} setForm={setForm} />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Department</Label>
                <Select value={formDept} onValueChange={setFormDept}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><User className="h-3 w-3" /> Reporting Manager</Label>
                <Select value={form.reporting_manager_id || "none"} onValueChange={(v) => setForm((p) => ({ ...p, reporting_manager_id: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select manager" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {allProfiles?.filter((p) => p.id !== selectedId).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Shield className="h-3 w-3" /> Employment Type</Label>
                <Select value={form.employment_type || "Full-time"} onValueChange={(v) => setForm((p) => ({ ...p, employment_type: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full-time">Full-time</SelectItem>
                    <SelectItem value="Part-time">Part-time</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <EditableFieldInput label="Hire Date" field="start_date" icon={Calendar} type="date" form={form} setForm={setForm} />
              <EditableFieldInput label="Work Location" field="work_location" icon={MapPin} form={form} setForm={setForm} />
            </CardContent>
          </Card>

          {/* Working Schedule */}
          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Working Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="h-3 w-3" /> Schedule Type</Label>
                <Select value={form.schedule_type || "fixed"} onValueChange={(v) => setForm((p) => ({ ...p, schedule_type: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.schedule_type !== "flexible" && (
                <>
                  <EditableFieldInput label="Start Time" field="work_start_time" type="time" form={form} setForm={setForm} />
                  <EditableFieldInput label="End Time" field="work_end_time" type="time" form={form} setForm={setForm} />
                  <EditableFieldInput label="Timezone" field="work_timezone" form={form} setForm={setForm} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Activity (edit only) */}
          {!isAdd && selectedProfile && (
            <Card>
              <CardHeader className="pb-4"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Profile Activity</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ReadOnlyFieldStatic label="Last Updated" value={selectedProfile.profile_updated_at ? format(new Date(selectedProfile.profile_updated_at), "MMM d, yyyy 'at' h:mm a") : "—"} icon={Calendar} />
                <ReadOnlyFieldStatic label="Updated By" value={selectedProfile.profile_updated_by ?? "—"} icon={User} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button onClick={isAdd ? handleSaveNew : handleSaveEdit} disabled={saveMutation.isPending} className="gap-1.5">
            <Save className="h-4 w-4" /> {isAdd ? "Create Employee" : "Save Changes"}
          </Button>
          <Button variant="outline" onClick={() => navigatePS("list")} className="gap-1.5">
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  // --- EMPLOYEE LIST ---
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1>
        <Button size="sm" onClick={startAdd} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Employee
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, or ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={(v) => { setDeptFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue placeholder="All Departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments?.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jobFilter} onValueChange={(v) => { setJobFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue placeholder="All Job Titles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Job Titles</SelectItem>
            {jobTitles.map((j) => (
              <SelectItem key={j} value={j}>{j}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {profilesLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Users className="h-8 w-8" />
            <p className="font-medium">
              {profiles?.length === 0
                ? "No employees found. Add your first employee to get started."
                : "No employees match your search criteria."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead className="hidden md:table-cell">Employee ID</TableHead>
                  <TableHead className="hidden sm:table-cell">Work Email</TableHead>
                  <TableHead className="hidden lg:table-cell">Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Job Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedList.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Avatar className="h-8 w-8">
                        {p.profile_photo_url && <AvatarImage src={p.profile_photo_url} />}
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{initials(p.full_name)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{p.full_name || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">{p.employee_id || p.id.slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{p.email || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{getDeptName(p.id)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{p.job_title || "—"}</TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20 text-xs">Active</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openView(p)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(p)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
