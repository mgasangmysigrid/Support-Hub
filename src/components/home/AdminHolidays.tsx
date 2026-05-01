import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";

interface Holiday {
  id: string;
  name: string;
  month: number;
  day: number;
  emoji: string;
  is_active: boolean;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function AdminHolidays() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState({ name: "", month: "1", day: "1", emoji: "🌍" });
  const [saving, setSaving] = useState(false);

  const { data: holidays = [] } = useQuery<Holiday[]>({
    queryKey: ["admin-holidays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .order("month")
        .order("day");
      if (error) throw error;
      return data as Holiday[];
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", month: "1", day: "1", emoji: "🌍" });
    setShowDialog(true);
  };

  const openEdit = (h: Holiday) => {
    setEditing(h);
    setForm({ name: h.name, month: String(h.month), day: String(h.day), emoji: h.emoji });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        month: parseInt(form.month),
        day: parseInt(form.day),
        emoji: form.emoji || "🌍",
      };

      if (editing) {
        const { error } = await supabase.from("holidays").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Holiday updated");
      } else {
        const { error } = await supabase.from("holidays").insert(payload);
        if (error) throw error;
        toast.success("Holiday added");
      }
      setShowDialog(false);
      queryClient.invalidateQueries({ queryKey: ["admin-holidays"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from("holidays").update({ is_active: !current }).eq("id", id);
    if (error) toast.error(error.message);
    else queryClient.invalidateQueries({ queryKey: ["admin-holidays"] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Holiday deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-holidays"] });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">World Holidays</CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Holiday
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Emoji</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-20">Active</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No holidays configured
                  </TableCell>
                </TableRow>
              ) : (
                holidays.map((h) => (
                  <TableRow key={h.id} className={!h.is_active ? "opacity-50" : ""}>
                    <TableCell className="text-lg">{h.emoji}</TableCell>
                    <TableCell className="text-sm font-medium">{h.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {MONTHS[h.month - 1]} {h.day}
                    </TableCell>
                    <TableCell>
                      <Switch checked={h.is_active} onCheckedChange={() => handleToggleActive(h.id, h.is_active)} />
                    </TableCell>
                    <TableCell className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(h)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(h.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Holiday Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. International Women's Day" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Month</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={form.month}
                    onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={i} value={String(i + 1)}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Day</Label>
                  <Input type="number" min={1} max={31} value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Emoji</Label>
                  <Input value={form.emoji} onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))} placeholder="🌍" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "Saving..." : editing ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
