import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { ReadOnlyFieldStatic, EditableFieldInput } from "@/components/ProfileFields";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import FeaturedPhotos from "@/components/profile/FeaturedPhotos";
import NotificationPreferences from "@/components/profile/NotificationPreferences";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  User, Mail, Phone, MapPin, Briefcase, Shield, Pencil, Save, X,
  AlertCircle, Building2, Calendar, Clock, UserCheck, Timer,
} from "lucide-react";
import { format } from "date-fns";

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
  schedule_type: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
  work_timezone: string | null;
};

type DeptInfo = { department_id: string; departments: { name: string } | null };

function formatTime12(time: string | null): string {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatScheduleTime(start: string | null, end: string | null, tz: string | null): string {
  if (!start || !end) return "—";
  const tzLabel = tz === "Asia/Manila" ? "Manila Time" : tz ?? "";
  return `${formatTime12(start)} – ${formatTime12(end)} ${tzLabel}`;
}

function convertToLocalTime(start: string, end: string, sourceTz: string, localTz: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const fmt = (t: string) => {
    const d = new Date(`${today}T${t}`);
    const source = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: sourceTz }).format(d);
    // Create date in source tz then convert to local
    const utcEstimate = new Date(d.toLocaleString("en-US", { timeZone: sourceTz }));
    const localEstimate = new Date(d.toLocaleString("en-US", { timeZone: localTz }));
    const diff = localEstimate.getTime() - utcEstimate.getTime();
    const local = new Date(d.getTime() + diff);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: localTz }).format(d);
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function MyProfile() {
  const { user } = useAuth();
  const location = useLocation();
  const featuredRef = useRef<HTMLDivElement>(null);
  const scrollTarget = new URLSearchParams(location.search).get("section");
  
  const qc = useQueryClient();

  const [editingSection, setEditingSectionRaw] = useState<"contact" | "address" | null>(() => {
    try { return localStorage.getItem("my-profile-editing-section") as "contact" | "address" | null; } catch { return null; }
  });
  const [form, setForm] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem("my-profile-form"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

  const setEditingSection = (v: "contact" | "address" | null) => {
    setEditingSectionRaw(v);
    try { if (v) localStorage.setItem("my-profile-editing-section", v); else localStorage.removeItem("my-profile-editing-section"); } catch {}
  };

  // Persist form data
  useEffect(() => {
    try {
      if (Object.keys(form).length > 0) localStorage.setItem("my-profile-form", JSON.stringify(form));
      else localStorage.removeItem("my-profile-form");
    } catch {}
  }, [form]);

  const { data: profileData, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as ProfileRow | null;
    },
    enabled: !!user?.id,
  });

  // Re-populate form from profile if returning with an editing section but empty form
  useEffect(() => {
    if (editingSection && profileData && Object.keys(form).length === 0) {
      if (editingSection === "contact") {
        setForm({
          mobile_number: profileData.mobile_number ?? "",
          emergency_contact_name: profileData.emergency_contact_name ?? "",
          emergency_contact_number: profileData.emergency_contact_number ?? "",
        });
      } else if (editingSection === "address") {
        setForm({
          current_address: profileData.current_address ?? "",
          permanent_address: profileData.permanent_address ?? "",
          city_province: profileData.city_province ?? "",
          postal_code: profileData.postal_code ?? "",
          country: profileData.country ?? "",
        });
      }
    }
  }, [editingSection, profileData]);

  // Auto-scroll to Featured Photos when navigated with ?section=featured-photos
  useEffect(() => {
    if (scrollTarget === "featured-photos" && featuredRef.current) {
      setTimeout(() => {
        featuredRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [scrollTarget, isLoading]);

  const { data: deptData } = useQuery({
    queryKey: ["my-profile-dept", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("department_id, departments(name)")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as DeptInfo | null;
    },
    enabled: !!user?.id,
  });

  const { data: managerName } = useQuery({
    queryKey: ["my-profile-manager", profileData?.reporting_manager_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", profileData!.reporting_manager_id!)
        .maybeSingle();
      if (error) throw error;
      return data?.full_name ?? "—";
    },
    enabled: !!profileData?.reporting_manager_id,
  });

  const departmentName = (deptData as any)?.departments?.name ?? "—";

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string | null>) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          ...updates,
          profile_updated_at: new Date().toISOString(),
          profile_updated_by: "Employee",
        } as any)
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      setEditingSection(null);
      setForm({});
      try { localStorage.removeItem("my-profile-form"); } catch {}
      toast.success("Profile updated", { description: "Your changes have been saved." });
    },
    onError: (err: any) => {
      toast.error("Error saving", { description: err.message });
    },
  });

  const completionFields = [
    profileData?.profile_photo_url,
    profileData?.mobile_number,
    profileData?.emergency_contact_name,
    profileData?.emergency_contact_number,
    profileData?.current_address,
    profileData?.email,
  ];
  const filled = completionFields.filter(Boolean).length;
  const completionPct = Math.round((filled / completionFields.length) * 100);

  const startEditContact = () => {
    setEditingSection("contact");
    setForm({
      mobile_number: profileData?.mobile_number ?? "",
      emergency_contact_name: profileData?.emergency_contact_name ?? "",
      emergency_contact_number: profileData?.emergency_contact_number ?? "",
    });
  };

  const startEditAddress = () => {
    setEditingSection("address");
    setForm({
      current_address: profileData?.current_address ?? "",
      permanent_address: profileData?.permanent_address ?? "",
      city_province: profileData?.city_province ?? "",
      postal_code: profileData?.postal_code ?? "",
      country: profileData?.country ?? "",
    });
  };

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setForm({});
    try { localStorage.removeItem("my-profile-form"); } catch {}
  };

  const initials = (profileData?.full_name ?? "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <AlertCircle className="h-8 w-8" />
        <p>Unable to load profile. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>

      {/* SECTION 1: PROFILE HEADER */}
      <Card>
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6">
          <Avatar className="h-20 w-20 text-2xl border-2 border-primary/20">
            {profileData.profile_photo_url && (
              <AvatarImage src={profileData.profile_photo_url} alt={profileData.full_name ?? "Profile"} />
            )}
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{profileData.full_name ?? "—"}</h2>
              {profileData.is_active && (
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20 text-xs">
                  Active
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{profileData.job_title ?? "Employee"}</p>
            <p className="text-sm text-muted-foreground">{departmentName}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {profileData.schedule_type === "flexible"
                ? "Flexible Schedule"
                : profileData.work_start_time && profileData.work_end_time
                  ? formatScheduleTime(profileData.work_start_time, profileData.work_end_time, profileData.work_timezone)
                  : "—"}
            </p>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              ID: {profileData.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 2: PROFILE COMPLETION */}
      {completionPct < 100 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Profile Completion</span>
              <span className="text-sm font-semibold text-primary">{completionPct}% Complete</span>
            </div>
            <Progress value={completionPct} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Complete your profile to ensure your information is up to date.
            </p>
          </CardContent>
        </Card>
      )}

      {/* FEATURED PHOTOS */}
      <div ref={featuredRef}>
        <FeaturedPhotos profileUserId={user!.id} isOwnProfile={true} />
      </div>

      {/* SECTION 3: QUICK ACTIONS */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={startEditContact} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Edit Contact Info
            </Button>
            <Button variant="outline" size="sm" onClick={startEditAddress} className="gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Update Address
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* TWO COLUMN GRID */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* SECTION 4: CONTACT INFO */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" /> Contact Information
              </CardTitle>
              {editingSection !== "contact" && (
                <Button variant="ghost" size="sm" onClick={startEditContact} className="h-7 text-xs gap-1">
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingSection === "contact" ? (
              <>
                <ReadOnlyFieldStatic label="Work Email" value={profileData.email} icon={Mail} />
                <EditableFieldInput label="Mobile Number" field="mobile_number" icon={Phone} form={form} setForm={setForm} />
                <EditableFieldInput label="Emergency Contact Name" field="emergency_contact_name" icon={UserCheck} form={form} setForm={setForm} />
                <EditableFieldInput label="Emergency Contact Number" field="emergency_contact_number" icon={Phone} form={form} setForm={setForm} />
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={cancelEdit} className="gap-1.5">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <ReadOnlyFieldStatic label="Work Email" value={profileData.email} icon={Mail} />
                <ReadOnlyFieldStatic label="Personal Email" value={profileData.personal_email} icon={Mail} />
                <ReadOnlyFieldStatic label="Mobile Number" value={profileData.mobile_number} icon={Phone} />
                <ReadOnlyFieldStatic label="Emergency Contact Name" value={profileData.emergency_contact_name} icon={UserCheck} />
                <ReadOnlyFieldStatic label="Emergency Contact Number" value={profileData.emergency_contact_number} icon={Phone} />
              </>
            )}
          </CardContent>
        </Card>

        {/* SECTION 5: ADDRESS INFO */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Address Information
              </CardTitle>
              {editingSection !== "address" && (
                <Button variant="ghost" size="sm" onClick={startEditAddress} className="h-7 text-xs gap-1">
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingSection === "address" ? (
              <>
                <EditableFieldInput label="Current Address" field="current_address" icon={MapPin} form={form} setForm={setForm} />
                <EditableFieldInput label="Permanent Address" field="permanent_address" icon={MapPin} form={form} setForm={setForm} />
                <EditableFieldInput label="City / Province" field="city_province" icon={Building2} form={form} setForm={setForm} />
                <EditableFieldInput label="Postal Code" field="postal_code" form={form} setForm={setForm} />
                <EditableFieldInput label="Country" field="country" form={form} setForm={setForm} />
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" /> Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={cancelEdit} className="gap-1.5">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <ReadOnlyFieldStatic label="Current Address" value={profileData.current_address} icon={MapPin} />
                <ReadOnlyFieldStatic label="Permanent Address" value={profileData.permanent_address} icon={MapPin} />
                <ReadOnlyFieldStatic label="City / Province" value={profileData.city_province} icon={Building2} />
                <ReadOnlyFieldStatic label="Postal Code" value={profileData.postal_code} />
                <ReadOnlyFieldStatic label="Country" value={profileData.country} />
              </>
            )}
          </CardContent>
        </Card>

        {/* SECTION 6: JOB ROLE */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Job Role
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReadOnlyFieldStatic label="Job Title" value={profileData.job_title} icon={Briefcase} />
            <ReadOnlyFieldStatic label="Department" value={departmentName} icon={Building2} />
            <ReadOnlyFieldStatic label="Reporting Manager" value={managerName ?? "—"} icon={User} />
            <ReadOnlyFieldStatic label="Employment Type" value={profileData.employment_type} icon={Shield} />
            <ReadOnlyFieldStatic
              label="Hire Date"
              value={profileData.start_date ? format(new Date(profileData.start_date), "MMM d, yyyy") : null}
              icon={Calendar}
            />
            <ReadOnlyFieldStatic label="Work Location" value={profileData.work_location} icon={MapPin} />
          </CardContent>
        </Card>

        {/* SECTION 7: WORKING SCHEDULE */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" /> Working Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profileData.schedule_type === "flexible" ? (
              <ReadOnlyFieldStatic label="Schedule" value="Flexible Schedule" icon={Clock} />
            ) : (
              <>
                <ReadOnlyFieldStatic
                  label="Schedule"
                  value={formatScheduleTime(profileData.work_start_time, profileData.work_end_time, profileData.work_timezone)}
                  icon={Clock}
                />
                {profileData.work_timezone === "Asia/Manila" && (() => {
                  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                  if (browserTz !== "Asia/Manila" && profileData.work_start_time && profileData.work_end_time) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        Your local time: {convertToLocalTime(profileData.work_start_time, profileData.work_end_time, profileData.work_timezone ?? "Asia/Manila", browserTz)}
                      </p>
                    );
                  }
                  return null;
                })()}
              </>
            )}
          </CardContent>
        </Card>

        {/* SECTION 8: PROFILE ACTIVITY */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Profile Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReadOnlyFieldStatic
              label="Last Updated"
              value={
                profileData.profile_updated_at
                  ? format(new Date(profileData.profile_updated_at), "MMM d, yyyy 'at' h:mm a")
                  : "—"
              }
              icon={Calendar}
            />
            <ReadOnlyFieldStatic label="Updated By" value={profileData.profile_updated_by ?? "—"} icon={User} />
          </CardContent>
        </Card>

        <NotificationPreferences />
      </div>
    </div>
  );
}
