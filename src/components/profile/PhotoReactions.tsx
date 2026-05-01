import { useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import ReactionTooltip from "./ReactionTooltip";

const REACTION_TYPES = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "celebrate", emoji: "🎉", label: "Celebrate" },
  { type: "awesome", emoji: "🔥", label: "Awesome" },
] as const;

type Reaction = {
  id: string;
  photo_id: string;
  user_id: string;
  reaction_type: string;
};

export default function PhotoReactions({ photoId }: { photoId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const lastToggleRef = useRef<number>(0);

  const { data: reactions = [] } = useQuery({
    queryKey: ["photo-reactions", photoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photo_reactions")
        .select("*")
        .eq("photo_id", photoId);
      if (error) throw error;
      return data as Reaction[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (reactionType: string) => {
      const existing = reactions.find((r) => r.user_id === user!.id);

      if (existing && existing.reaction_type === reactionType) {
        const { error } = await supabase
          .from("photo_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      } else if (existing) {
        const { error } = await supabase
          .from("photo_reactions")
          .update({ reaction_type: reactionType } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("photo_reactions")
          .insert({
            photo_id: photoId,
            user_id: user!.id,
            reaction_type: reactionType,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-reactions", photoId] });
      qc.invalidateQueries({ queryKey: ["reaction-tooltip", photoId] });
    },
  });

  // Debounce rapid toggling (1s cooldown)
  const handleToggle = useCallback((reactionType: string) => {
    const now = Date.now();
    if (now - lastToggleRef.current < 1000) return;
    lastToggleRef.current = now;
    toggleMutation.mutate(reactionType);
  }, [toggleMutation]);

  const userReaction = reactions.find((r) => r.user_id === user?.id);

  const counts = REACTION_TYPES.reduce<Record<string, number>>((acc, rt) => {
    acc[rt.type] = reactions.filter((r) => r.reaction_type === rt.type).length;
    return acc;
  }, {});

  const totalReactions = reactions.length;

  return (
    <ReactionTooltip photoId={photoId} totalCount={totalReactions}>
      <div className="flex items-center gap-1 flex-wrap">
        {REACTION_TYPES.map((rt) => {
          const isActive = userReaction?.reaction_type === rt.type;
          const count = counts[rt.type];
          return (
            <button
              key={rt.type}
              onClick={() => handleToggle(rt.type)}
              disabled={toggleMutation.isPending}
              title={rt.label}
              className={cn(
                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all",
                "hover:bg-accent border",
                isActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:border-border"
              )}
            >
              <span className="text-sm">{rt.emoji}</span>
              {count > 0 && <span className="font-medium">{count}</span>}
            </button>
          );
        })}
      </div>
    </ReactionTooltip>
  );
}
