import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackActivity, ANALYTICS_EVENTS } from "@/hooks/use-activity-tracker";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const REACTION_OPTIONS = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "celebrate", emoji: "🎉", label: "Celebrate" },
  { type: "applaud", emoji: "👏", label: "Applaud" },
  { type: "acknowledged", emoji: "✅", label: "Acknowledged" },
] as const;

interface Props {
  postId: string;
  compact?: boolean;
}

export default function BulletinReactions({ postId, compact = false }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: reactions = [] } = useQuery({
    queryKey: ["bulletin-reactions", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_reactions")
        .select("id, user_id, reaction_type, profiles!bulletin_reactions_user_id_fkey(full_name)")
        .eq("bulletin_post_id", postId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const myReaction = useMemo(
    () => reactions.find((r) => r.user_id === user?.id),
    [reactions, user?.id]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; names: string[] }>();
    for (const r of reactions) {
      const existing = map.get(r.reaction_type) ?? { count: 0, names: [] };
      existing.count++;
      const name = (r.profiles as any)?.full_name ?? "Someone";
      if (existing.names.length < 5) existing.names.push(name);
      map.set(r.reaction_type, existing);
    }
    return map;
  }, [reactions]);

  const toggleReaction = useMutation({
    mutationFn: async (type: string) => {
      if (!user) return;
      if (myReaction) {
        if (myReaction.reaction_type === type) {
          // Remove
          await supabase.from("bulletin_reactions").delete().eq("id", myReaction.id);
        } else {
          // Change
          await supabase
            .from("bulletin_reactions")
            .update({ reaction_type: type })
            .eq("id", myReaction.id);
        }
      } else {
        // Add
        await supabase.from("bulletin_reactions").insert({
          bulletin_post_id: postId,
          user_id: user.id,
          reaction_type: type,
        });
        if (user) trackActivity(user.id, ANALYTICS_EVENTS.REACTED_UPDATE.module, ANALYTICS_EVENTS.REACTED_UPDATE.event, "bulletin_reaction");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bulletin-reactions", postId] });
    },
  });

  if (compact) {
    // Show only existing reactions with counts
    const activeReactions = REACTION_OPTIONS.filter((o) => grouped.has(o.type));
    if (activeReactions.length === 0 && !compact) return null;

    return (
      <div className="flex items-center gap-1 flex-wrap">
        {activeReactions.map((opt) => {
          const info = grouped.get(opt.type)!;
          const ismine = myReaction?.reaction_type === opt.type;
          return (
            <Tooltip key={opt.type}>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleReaction.mutate(opt.type); }}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs transition-colors",
                    ismine
                      ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                      : "bg-muted hover:bg-accent"
                  )}
                >
                  <span className="text-xs">{opt.emoji}</span>
                  <span className="text-[10px] font-medium">{info.count}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {info.names.join(", ")}{info.count > 5 ? ` +${info.count - 5} more` : ""}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {REACTION_OPTIONS.map((opt) => {
        const info = grouped.get(opt.type);
        const ismine = myReaction?.reaction_type === opt.type;
        const count = info?.count ?? 0;

        return (
          <Tooltip key={opt.type}>
            <TooltipTrigger asChild>
              <button
                onClick={() => toggleReaction.mutate(opt.type)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-all",
                  ismine
                    ? "bg-primary/15 text-primary ring-1 ring-primary/30 scale-105"
                    : "bg-muted/60 hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{opt.emoji}</span>
                {count > 0 && <span className="text-[11px] font-medium">{count}</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {opt.label}
              {info && info.names.length > 0 && (
                <span className="block text-muted-foreground">
                  {info.names.join(", ")}{info.count > 5 ? ` +${info.count - 5}` : ""}
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
