import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Pencil, Search } from "lucide-react";
import PushoverEditDialog, { type PushoverRow } from "./PushoverEditDialog";

interface PushoverStatusRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  departments: string[] | null;
  pushover_user_key: string | null;
  pushover_enabled: boolean;
  has_key: boolean;
}

function maskKey(key: string | null): string {
  if (!key) return "—";
  if (key.length <= 4) return "•".repeat(key.length);
  return "•".repeat(Math.max(8, key.length - 4)) + key.slice(-4);
}

export default function PushoverManagementTab() {
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<PushoverRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-pushover-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_pushover_status");
      if (error) throw error;
      return (data ?? []) as PushoverStatusRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data;
    return data.filter((r) => {
      const name = (r.full_name ?? "").toLowerCase();
      const email = (r.email ?? "").toLowerCase();
      const depts = (r.departments ?? []).join(" ").toLowerCase();
      return name.includes(term) || email.includes(term) || depts.includes(term);
    });
  }, [data, search]);

  const openEdit = (row: PushoverStatusRow) => {
    setEditing({
      user_id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      pushover_user_key: row.pushover_user_key,
      pushover_enabled: row.pushover_enabled,
    });
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push Notifications (Pushover)</CardTitle>
        <CardDescription>
          Manage Pushover user keys. Critical-priority tickets push to the assigned Owner via the Pushover service.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, or department"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Departments</TableHead>
                <TableHead>Pushover Key</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No users found.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((row) => {
                const isRevealed = !!revealed[row.user_id];
                return (
                  <TableRow key={row.user_id}>
                    <TableCell className="font-medium">{row.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.email ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(row.departments ?? []).map((d) => (
                          <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
                        ))}
                        {(!row.departments || row.departments.length === 0) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.has_key ? (
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono">
                            {isRevealed ? row.pushover_user_key : maskKey(row.pushover_user_key)}
                          </code>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              setRevealed((prev) => ({ ...prev, [row.user_id]: !prev[row.user_id] }))
                            }
                            aria-label={isRevealed ? "Hide key" : "Show key"}
                          >
                            {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.has_key ? (
                        row.pushover_enabled ? (
                          <Badge className="bg-green-600 hover:bg-green-600">Enabled</Badge>
                        ) : (
                          <Badge variant="secondary">Disabled</Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                        <Pencil className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <PushoverEditDialog
        row={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => refetch()}
      />
    </Card>
  );
}
