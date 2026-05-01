import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import {
  Bell, CheckCheck, Camera, Heart, AtSign,
  MessageSquare, FileText, Ticket, CalendarDays, Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { markNotificationsRead, resolveNotificationTarget } from "@/lib/notification-utils";

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  featured_photo_created: { icon: Camera, color: "text-primary" },
  featured_photo_reacted: { icon: Heart, color: "text-primary" },
  featured_photo_tagged: { icon: AtSign, color: "text-primary" },
  photo_mention: { icon: MessageSquare, color: "text-primary" },
  bulletin_mention: { icon: Megaphone, color: "text-primary" },
  bulletin_comment_mention: { icon: MessageSquare, color: "text-primary" },
  ticket_created: { icon: Ticket, color: "text-primary" },
  ticket_comment: { icon: MessageSquare, color: "text-primary" },
  ticket_activity: { icon: Ticket, color: "text-primary" },
  leave_submitted: { icon: CalendarDays, color: "text-primary" },
  leave_approved: { icon: CalendarDays, color: "text-primary" },
  leave_declined: { icon: CalendarDays, color: "text-primary" },
  document_issued: { icon: FileText, color: "text-primary" },
  document_signature_request: { icon: FileText, color: "text-primary" },
  knowledge_base: { icon: FileText, color: "text-primary" },
};

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  link: string | null;
  created_at: string | null;
  actor_id: string | null;
}

interface ActorProfile {
  id: string;
  full_name: string | null;
  profile_photo_url: string | null;
}

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["sidebar-badge-home"] });
    queryClient.invalidateQueries({ queryKey: ["sidebar-badge-my-leave"] });
    queryClient.invalidateQueries({ queryKey: ["home-unreads-mentions"] });
    queryClient.invalidateQueries({ queryKey: ["photo-mention-badges"] });
    queryClient.invalidateQueries({ queryKey: ["ticket-unread-notifs"] });
  };

  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data as NotificationRow[];
    },
  });

  const actorIds = [...new Set((notifications ?? []).map((n) => n.actor_id).filter(Boolean))] as string[];
  const { data: actorProfiles = {} } = useQuery({
    queryKey: ["notification-actors", actorIds.join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, profile_photo_url")
        .in("id", actorIds);
      if (error) throw error;
      const map: Record<string, ActorProfile> = {};
      for (const p of data ?? []) map[p.id] = p;
      return map;
    },
  });

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    invalidateAll();
  };

  const handleClick = async (n: NotificationRow) => {
    if (!n.is_read) {
      await markNotificationsRead([n.id]);
      invalidateAll();
    }

    const target = await resolveNotificationTarget({ id: n.id, type: n.type, link: n.link });
    if (target.isFallback && target.message) {
      toast.info(target.message);
    }
    navigate(target.href);
  };

  const markRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await markNotificationsRead([id]);
    invalidateAll();
  };

  const unreadCount = notifications?.filter((n) => !n.is_read).length || 0;

  const getIcon = (type: string) => {
    const config = TYPE_CONFIG[type] || { icon: Bell, color: "text-muted-foreground" };
    return config;
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5">
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        {!notifications?.length ? (
          <div className="text-center py-20 text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : notifications.map((n) => {
          const { icon: Icon, color } = getIcon(n.type);
          const actor = n.actor_id ? actorProfiles[n.actor_id] : null;

          return (
            <Card
              key={n.id}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-sm",
                !n.is_read
                  ? "border-primary/20 bg-primary/[0.03]"
                  : "border-transparent bg-card/60 opacity-75 hover:opacity-100"
              )}
              onClick={() => handleClick(n)}
            >
              <CardContent className="flex items-start gap-3 py-3 px-4">
                {actor?.profile_photo_url ? (
                  <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                    <AvatarImage src={actor.profile_photo_url} />
                    <AvatarFallback className="text-[10px] bg-muted">
                      {(actor.full_name || "?")[0]}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className={cn("mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-muted", color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={cn("text-sm leading-snug", !n.is_read ? "font-semibold" : "font-medium")}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2" style={{ overflowWrap: "anywhere" }}>
                        {n.body}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ""}
                      </span>
                      {!n.is_read && (
                        <div className="h-2 w-2 rounded-full bg-primary shrink-0" title="Unread" />
                      )}
                    </div>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={(e) => markRead(e, n.id)}
                      className="text-[10px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
