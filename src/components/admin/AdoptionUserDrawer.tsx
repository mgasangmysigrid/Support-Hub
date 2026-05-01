import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, TrendingUp, Users, UserX, Clock, Search, Copy, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { UserAdoptionRow } from "@/hooks/use-adoption-analytics";

export type MetricType = "active_today" | "active_7d" | "active_30d" | "never_logged_in" | "dormant";

const METRIC_CONFIG: Record<MetricType, {
  label: string;
  icon: typeof Activity;
  color: string;
  helper: string;
  statusFilter: (u: UserAdoptionRow) => boolean;
}> = {
  active_today: {
    label: "Active Today",
    icon: Activity,
    color: "text-emerald-500",
    helper: "Users who logged in today",
    statusFilter: (u) => {
      if (!u.lastLogin) return false;
      const today = new Date();
      const login = new Date(u.lastLogin);
      return login.toDateString() === today.toDateString();
    },
  },
  active_7d: {
    label: "7-Day Active",
    icon: TrendingUp,
    color: "text-blue-500",
    helper: "Users who logged in within the last 7 days",
    statusFilter: (u) => {
      if (!u.lastLogin) return false;
      const cutoff = new Date(Date.now() - 7 * 86400000);
      return new Date(u.lastLogin) >= cutoff;
    },
  },
  active_30d: {
    label: "30-Day Active",
    icon: Users,
    color: "text-primary",
    helper: "Users who logged in within the last 30 days",
    statusFilter: (u) => {
      if (!u.lastLogin) return false;
      const cutoff = new Date(Date.now() - 30 * 86400000);
      return new Date(u.lastLogin) >= cutoff;
    },
  },
  never_logged_in: {
    label: "Never Logged In",
    icon: UserX,
    color: "text-destructive",
    helper: "Users with no login record",
    statusFilter: (u) => !u.lastLogin,
  },
  dormant: {
    label: "Dormant (14D+)",
    icon: Clock,
    color: "text-amber-500",
    helper: "Users whose last login was more than 14 days ago",
    statusFilter: (u) => {
      if (!u.lastLogin) return false;
      const cutoff = new Date(Date.now() - 14 * 86400000);
      return new Date(u.lastLogin) < cutoff;
    },
  },
};

const STATUS_COLORS: Record<string, string> = {
  "Power User": "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
  "Healthy Adoption": "bg-blue-500/20 text-blue-600 border-blue-500/30",
  "Low Adoption": "bg-amber-500/20 text-amber-600 border-amber-500/30",
  "At Risk": "bg-orange-500/20 text-orange-600 border-orange-500/30",
  "Dormant": "bg-red-500/20 text-red-600 border-red-500/30",
  "Never Logged In": "bg-muted text-muted-foreground border-muted",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric: MetricType | null;
  users: UserAdoptionRow[];
}

export default function AdoptionUserDrawer({ open, onOpenChange, metric, users }: Props) {
  const [search, setSearch] = useState("");

  const config = metric ? METRIC_CONFIG[metric] : null;

  const filtered = useMemo(() => {
    if (!config) return [];
    let list = users.filter(config.statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      if (!a.lastLogin && !b.lastLogin) return a.name.localeCompare(b.name);
      if (!a.lastLogin) return -1;
      if (!b.lastLogin) return 1;
      return new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime();
    });
  }, [config, users, search]);

  const handleCopyEmail = (name: string) => {
    // We don't have email in the adoption table, copy name instead
    navigator.clipboard.writeText(name);
    toast.success("Name copied to clipboard");
  };

  if (!config || !metric) return null;

  const Icon = config.icon;

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2 border-b">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg bg-muted ${config.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <SheetTitle className="text-base">{config.label} — {filtered.length} user{filtered.length !== 1 ? "s" : ""}</SheetTitle>
              <SheetDescription className="text-xs">{config.helper}</SheetDescription>
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <UserX className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm font-medium">No users found</p>
              <p className="text-xs mt-1">
                {search ? "Try a different search term" : `No ${config.label.toLowerCase()} users in this filter`}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-2 px-3">Employee</TableHead>
                  <TableHead className="py-2 px-3">Department</TableHead>
                  <TableHead className="py-2 px-3">Last Login</TableHead>
                  <TableHead className="py-2 px-3 text-center">Status</TableHead>
                  <TableHead className="py-2 px-3 w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.userId} className="text-xs">
                    <TableCell className="py-1.5 px-3 font-medium">{row.name}</TableCell>
                    <TableCell className="py-1.5 px-3 text-muted-foreground">{row.department || "—"}</TableCell>
                    <TableCell className="py-1.5 px-3">
                      {row.lastLogin
                        ? format(new Date(row.lastLogin), "MMM d, yyyy HH:mm")
                        : <span className="text-muted-foreground italic">Never</span>}
                    </TableCell>
                    <TableCell className="py-1.5 px-3 text-center">
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[row.status] || ""}`}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 px-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopyEmail(row.name)}
                        title="Copy name"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>

        <div className="border-t p-3 text-[10px] text-muted-foreground text-center">
          Showing {filtered.length} of {users.filter(config.statusFilter).length} user{users.filter(config.statusFilter).length !== 1 ? "s" : ""}
        </div>
      </SheetContent>
    </Sheet>
  );
}
