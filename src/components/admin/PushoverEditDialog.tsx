import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface PushoverRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  pushover_user_key: string | null;
  pushover_enabled: boolean;
}

interface Props {
  row: PushoverRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function PushoverEditDialog({ row, open, onOpenChange, onSaved }: Props) {
  const [keyValue, setKeyValue] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (open && row) {
      setKeyValue(row.pushover_user_key ?? "");
      setEnabled(row.pushover_enabled);
      setReveal(false);
    }
  }, [open, row]);

  if (!row) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_set_pushover_key", {
        _target_user_id: row.user_id,
        _user_key: keyValue.trim() || null,
        _enabled: enabled,
      });
      if (error) throw error;
      toast.success("Pushover settings saved");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      const { error } = await supabase.rpc("admin_set_pushover_key", {
        _target_user_id: row.user_id,
        _user_key: null,
        _enabled: enabled,
      });
      if (error) throw error;
      toast.success("Pushover key cleared");
      setKeyValue("");
      onSaved();
      setConfirmClear(false);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to clear";
      toast.error(msg);
    } finally {
      setClearing(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-pushover-notification", {
        body: {
          user_id: row.user_id,
          title: "Test from Support Hub",
          body: "Pushover is working!",
          priority: "normal",
        },
      });
      if (error) throw error;
      const result = data as { success?: boolean; skipped?: boolean; reason?: string; error?: string };
      if (result?.skipped) {
        toast.warning(`Skipped: ${result.reason ?? "unknown reason"}`);
      } else if (result?.success) {
        toast.success("Test notification sent");
      } else {
        toast.error(result?.error ?? "Test failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test failed";
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pushover Settings</DialogTitle>
            <DialogDescription>
              {row.full_name ?? row.email ?? row.user_id}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pushover-key">Pushover User Key</Label>
              <div className="flex gap-2">
                <Input
                  id="pushover-key"
                  type={reveal ? "text" : "password"}
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  placeholder="e.g. uQiRzpo4DXghDmr9QzzfQu27cmVRsG"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? "Hide key" : "Show key"}
                >
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Found in the user's Pushover account dashboard.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="pushover-enabled" className="text-sm font-medium">Enabled</Label>
                <p className="text-xs text-muted-foreground">
                  Disable to stop pushes without removing the key.
                </p>
              </div>
              <Switch id="pushover-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleTest}
              disabled={testing}
              className="w-full"
            >
              <Send className="mr-2 h-4 w-4" />
              {testing ? "Sending..." : "Send test notification"}
            </Button>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmClear(true)}
              disabled={!row.pushover_user_key}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear key
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Pushover key?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the user's Pushover user key. They will stop receiving push notifications until a new key is set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear} disabled={clearing}>
              {clearing ? "Clearing..." : "Clear key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
