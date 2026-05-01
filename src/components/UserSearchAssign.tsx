import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, X, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface UserSearchResult {
  userId: string;
  fullName: string;
  email: string;
  departments: { id: string; name: string }[];
}

interface UserSearchAssignProps {
  onSelect: (result: UserSearchResult, chosenDeptId: string) => void;
  currentUserId?: string;
}

export function UserSearchAssign({ onSelect, currentUserId }: UserSearchAssignProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [choosingDept, setChoosingDept] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fetch all active profiles with their departments
  const { data: profilesWithDepts } = useQuery({
    queryKey: ["profiles-with-depts"],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("department_members")
        .select("user_id, department_id, is_assignable, profile:profiles!department_members_user_id_fkey(id, full_name, email, is_active), department:departments!department_members_department_id_fkey(id, name)")
        .eq("is_assignable", true);
      if (error) throw error;

      // Group by user
      const userMap = new Map<string, UserSearchResult>();
      for (const m of members || []) {
        if (!m.profile?.is_active) continue;
        const uid = m.user_id;
        if (!userMap.has(uid)) {
          userMap.set(uid, {
            userId: uid,
            fullName: m.profile.full_name?.trim() || "",
            email: m.profile.email?.trim() || "",
            departments: [],
          });
        }
        if (m.department) {
          const existing = userMap.get(uid)!;
          if (!existing.departments.find((d) => d.id === m.department.id)) {
            existing.departments.push({ id: m.department.id, name: m.department.name });
          }
        }
      }
      return Array.from(userMap.values());
    },
  });

  const filtered = useMemo(() => {
    if (!query.trim() || !profilesWithDepts) return [];
    const q = query.trim().toLowerCase();
    return profilesWithDepts
      .filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, profilesWithDepts]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectUser = (user: UserSearchResult) => {
    if (user.departments.length === 1) {
      onSelect(user, user.departments[0].id);
      setQuery("");
      setOpen(false);
      setSelectedUser(null);
      setChoosingDept(false);
    } else if (user.departments.length > 1) {
      setSelectedUser(user);
      setChoosingDept(true);
      setOpen(false);
    }
  };

  const handleChooseDept = (deptId: string) => {
    if (selectedUser) {
      onSelect(selectedUser, deptId);
      setQuery("");
      setSelectedUser(null);
      setChoosingDept(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setSelectedUser(null);
    setChoosingDept(false);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" />
        Quick Assign — Search by name
      </Label>
      <div className="relative" ref={wrapperRef}>
        <Input
          placeholder="Type a name to search..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setChoosingDept(false);
            setSelectedUser(null);
          }}
          onFocus={() => query.trim() && setOpen(true)}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {open && filtered.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto">
            {filtered.map((u) => (
              <button
                key={u.userId}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                onClick={() => handleSelectUser(u)}
              >
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{u.fullName || u.email}{u.userId === currentUserId && <span className="text-muted-foreground font-normal ml-1">(You)</span>}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {u.departments.map((d) => d.name).join(", ")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {open && query.trim() && filtered.length === 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
            No users found
          </div>
        )}
      </div>

      {choosingDept && selectedUser && (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <p className="text-sm">
            <strong>{selectedUser.fullName || selectedUser.email}</strong> belongs to multiple departments. Choose one:
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedUser.departments.map((d) => (
              <Button
                key={d.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleChooseDept(d.id)}
              >
                {d.name}
              </Button>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
