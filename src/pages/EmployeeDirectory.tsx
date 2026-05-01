import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronRight, Users, MapPin, Building2 } from "lucide-react";

type EmployeeRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  profile_photo_url: string | null;
  is_active: boolean;
  work_location: string | null;
  employment_type: string | null;
};

type DeptMember = {
  user_id: string;
  departments: { name: string } | null;
};

export default function EmployeeDirectory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  const { data: employees, isLoading } = useQuery({
    queryKey: ["employee-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, job_title, profile_photo_url, is_active, work_location, employment_type")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmployeeRow[];
    },
  });

  const { data: deptMembers } = useQuery({
    queryKey: ["employee-directory-depts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("user_id, departments(name)");
      if (error) throw error;
      return (data ?? []) as DeptMember[];
    },
  });

  const deptMap = useMemo(() => {
    const map: Record<string, string> = {};
    (deptMembers ?? []).forEach((dm) => {
      if (dm.departments?.name) map[dm.user_id] = dm.departments.name;
    });
    return map;
  }, [deptMembers]);

  const departments = useMemo(() => {
    const set = new Set(Object.values(deptMap));
    return Array.from(set).sort();
  }, [deptMap]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    (employees ?? []).forEach((e) => {
      if (e.work_location) set.add(e.work_location);
    });
    return Array.from(set).sort();
  }, [employees]);

  const filtered = useMemo(() => {
    if (!employees) return [];
    const q = search.toLowerCase().trim();
    return employees.filter((e) => {
      if (deptFilter !== "all" && deptMap[e.id] !== deptFilter) return false;
      if (locationFilter !== "all" && e.work_location !== locationFilter) return false;
      if (!q) return true;
      const name = (e.full_name ?? "").toLowerCase();
      const title = (e.job_title ?? "").toLowerCase();
      const dept = (deptMap[e.id] ?? "").toLowerCase();
      return name.includes(q) || title.includes(q) || dept.includes(q);
    });
  }, [employees, search, deptFilter, locationFilter, deptMap]);

  const getInitials = (name: string | null) =>
    (name ?? "U")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const handleClick = (id: string) => {
    if (id === user?.id) {
      navigate("/profile");
    } else {
      navigate(`/profile/${id}`);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Employee Directory
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find and view team members
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, job title, or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-full sm:w-[180px] h-10">
            <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-full sm:w-[180px] h-10">
            <MapPin className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} employee{filtered.length !== 1 ? "s" : ""} found
        </p>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Employee List */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Users className="h-10 w-10 opacity-40" />
          <p className="text-sm">No employees match your search.</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="divide-y divide-border rounded-lg border bg-card">
          {filtered.map((emp) => (
            <button
              key={emp.id}
              onClick={() => handleClick(emp.id)}
              className="flex items-center gap-4 w-full px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
            >
              <Avatar className="h-10 w-10 shrink-0 border border-border">
                {emp.profile_photo_url && (
                  <AvatarImage src={emp.profile_photo_url} alt={emp.full_name ?? ""} />
                )}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {getInitials(emp.full_name)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {emp.full_name ?? "—"}
                  </span>
                  {emp.id === user?.id && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">You</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                  {emp.job_title && <span>{emp.job_title}</span>}
                  {deptMap[emp.id] && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {deptMap[emp.id]}
                    </span>
                  )}
                  {emp.work_location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {emp.work_location}
                    </span>
                  )}
                </div>
              </div>

              {emp.employment_type && (
                <Badge variant="outline" className="hidden sm:flex text-[10px] shrink-0">
                  {emp.employment_type}
                </Badge>
              )}

              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
