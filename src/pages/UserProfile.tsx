import { useParams, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReadOnlyFieldStatic } from "@/components/ProfileFields";
import FeaturedPhotos from "@/components/profile/FeaturedPhotos";
import {
  AlertCircle, Briefcase, Building2, Phone, Mail, MapPin,
  Shield, Calendar, Clock, User, UserCheck, ArrowLeft,
} from "lucide-react";
import { format } from "date-fns";

function formatTime12(time: string | null): string {
  if (!time) return "—";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatScheduleDisplay(profile: { schedule_type: string | null; work_start_time: string | null; work_end_time: string | null; work_timezone: string | null }): string {
  if (profile.schedule_type === "flexible") return "Flexible Schedule";
  if (!profile.work_start_time || !profile.work_end_time) return "—";
  const tzLabel = profile.work_timezone === "Asia/Manila" ? "Manila Time" : profile.work_timezone ?? "";
  return `${formatTime12(profile.work_start_time)} – ${formatTime12(profile.work_end_time)} ${tzLabel}`;
}

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, job_title, profile_photo_url, is_active, mobile_number, emergency_contact_name, emergency_contact_number, employment_type, work_location, start_date, reporting_manager_id, profile_updated_at, profile_updated_by, schedule_type, work_start_time, work_end_time, work_timezone")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: deptData } = useQuery({
    queryKey: ["user-profile-dept", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("department_id, departments(name)")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: managerName } = useQuery({
    queryKey: ["user-profile-manager", profile?.reporting_manager_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", profile!.reporting_manager_id!)
        .maybeSingle();
      if (error) throw error;
      return data?.full_name ?? "—";
    },
    enabled: !!profile?.reporting_manager_id,
  });

  // Redirect to own profile page (after all hooks)
  if (userId === user?.id) {
    return <Navigate to="/profile" replace />;
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <AlertCircle className="h-8 w-8" />
        <p>Profile not found.</p>
      </div>
    );
  }

  const initials = (profile.full_name ?? "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const departmentName = (deptData as any)?.departments?.name ?? "—";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/directory")} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Directory
        </Button>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{profile.full_name ?? "Employee"}'s Profile</h1>

      {/* PROFILE HEADER */}
      <Card>
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6">
          <Avatar className="h-20 w-20 text-2xl border-2 border-primary/20">
            {profile.profile_photo_url && (
              <AvatarImage src={profile.profile_photo_url} alt={profile.full_name ?? "Profile"} />
            )}
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{profile.full_name ?? "—"}</h2>
              {profile.is_active && (
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20 text-xs">
                  Active
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" /> {profile.job_title ?? "Employee"}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> {departmentName}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> {formatScheduleDisplay(profile)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* FEATURED PHOTOS */}
      <FeaturedPhotos profileUserId={profile.id} isOwnProfile={false} />

      {/* TWO COLUMN GRID */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* CONTACT INFORMATION */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReadOnlyFieldStatic label="Work Email" value={profile.email} icon={Mail} />
            <ReadOnlyFieldStatic label="Mobile Number" value={profile.mobile_number} icon={Phone} />
            <ReadOnlyFieldStatic label="Emergency Contact Name" value={profile.emergency_contact_name} icon={UserCheck} />
            <ReadOnlyFieldStatic label="Emergency Contact Number" value={profile.emergency_contact_number} icon={Phone} />
          </CardContent>
        </Card>

        {/* JOB ROLE */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Job Role
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReadOnlyFieldStatic label="Job Title" value={profile.job_title} icon={Briefcase} />
            <ReadOnlyFieldStatic label="Department" value={departmentName} icon={Building2} />
            <ReadOnlyFieldStatic label="Reporting Manager" value={managerName ?? "—"} icon={User} />
            <ReadOnlyFieldStatic label="Employment Type" value={profile.employment_type} icon={Shield} />
            <ReadOnlyFieldStatic
              label="Hire Date"
              value={profile.start_date ? format(new Date(profile.start_date), "MMM d, yyyy") : null}
              icon={Calendar}
            />
            <ReadOnlyFieldStatic label="Work Location" value={profile.work_location} icon={MapPin} />
          </CardContent>
        </Card>

        {/* PROFILE ACTIVITY */}
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
                profile.profile_updated_at
                  ? format(new Date(profile.profile_updated_at), "MMM d, yyyy 'at' h:mm a")
                  : "—"
              }
              icon={Calendar}
            />
            <ReadOnlyFieldStatic label="Updated By" value={profile.profile_updated_by ?? "—"} icon={User} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
