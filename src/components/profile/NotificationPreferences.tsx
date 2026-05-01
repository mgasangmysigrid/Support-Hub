import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { toast } from "sonner";

interface Prefs {
  id: string;
  photo_new: boolean;
  photo_reaction: boolean;
  photo_mention: boolean;
}

export default function NotificationPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: prefs, isLoading } = useQuery<Prefs | null>({
    queryKey: ["notification-preferences", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notification_preferences")
        .select("id, photo_new, photo_reaction, photo_mention")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Prefs | null;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (updates: Partial<Prefs>) => {
      if (prefs?.id) {
        const { error } = await supabase
          .from("notification_preferences" as any)
          .update({ ...updates, updated_at: new Date().toISOString() } as any)
          .eq("id", prefs.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_preferences" as any)
          .insert({ user_id: user!.id, ...updates } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-preferences", user?.id] });
      toast.success("Preferences updated");
    },
    onError: (err: any) => toast.error("Failed to update", { description: err.message }),
  });

  const currentPrefs = {
    photo_new: prefs?.photo_new ?? true,
    photo_reaction: prefs?.photo_reaction ?? true,
    photo_mention: prefs?.photo_mention ?? true,
  };

  const togglePref = (key: keyof typeof currentPrefs) => {
    upsertMutation.mutate({ [key]: !currentPrefs[key] });
  };

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" /> Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="pref-photo-new" className="text-sm cursor-pointer">
            New Featured Photo posts
          </Label>
          <Switch
            id="pref-photo-new"
            checked={currentPrefs.photo_new}
            onCheckedChange={() => togglePref("photo_new")}
            disabled={upsertMutation.isPending}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="pref-photo-reaction" className="text-sm cursor-pointer">
            Reactions to my photos
          </Label>
          <Switch
            id="pref-photo-reaction"
            checked={currentPrefs.photo_reaction}
            onCheckedChange={() => togglePref("photo_reaction")}
            disabled={upsertMutation.isPending}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="pref-photo-mention" className="text-sm cursor-pointer">
            Mentions &amp; tags in photos
          </Label>
          <Switch
            id="pref-photo-mention"
            checked={currentPrefs.photo_mention}
            onCheckedChange={() => togglePref("photo_mention")}
            disabled={upsertMutation.isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
