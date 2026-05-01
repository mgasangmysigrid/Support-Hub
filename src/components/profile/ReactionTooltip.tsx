import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";

const REACTION_EMOJI: Record<string, string> = {
  like: "👍",
  love: "❤️",
  celebrate: "🎉",
  awesome: "🔥",
};

interface ReactorInfo {
  user_id: string;
  reaction_type: string;
  full_name: string | null;
  profile_photo_url: string | null;
}

interface ReactionTooltipProps {
  photoId: string;
  children: React.ReactNode;
  totalCount: number;
}

function ReactorList({ reactors, remaining }: { reactors: ReactorInfo[]; remaining: number }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">
        Reactions ({reactors.length + remaining})
      </p>
      {reactors.map((r) => (
        <div key={r.user_id} className="flex items-center gap-2 px-1 py-0.5">
          <Avatar className="h-5 w-5 shrink-0">
            <AvatarImage src={r.profile_photo_url || undefined} />
            <AvatarFallback className="text-[8px]">
              {(r.full_name || "?")[0]}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-foreground truncate flex-1">
            {r.full_name || "Unknown"}
          </span>
          <span className="text-sm shrink-0">
            {REACTION_EMOJI[r.reaction_type] || "👍"}
          </span>
        </div>
      ))}
      {remaining > 0 && (
        <p className="text-[10px] text-muted-foreground px-1 pt-0.5">
          +{remaining} more
        </p>
      )}
    </div>
  );
}

export default function ReactionTooltip({ photoId, children, totalCount }: ReactionTooltipProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const { data: reactors = [] } = useQuery<ReactorInfo[]>({
    queryKey: ["reaction-tooltip", photoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photo_reactions")
        .select("user_id, reaction_type, profiles:user_id(full_name, profile_photo_url)")
        .eq("photo_id", photoId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data as any[]).map((r) => ({
        user_id: r.user_id,
        reaction_type: r.reaction_type,
        full_name: r.profiles?.full_name ?? null,
        profile_photo_url: r.profiles?.profile_photo_url ?? null,
      }));
    },
    enabled: totalCount > 0 && (isMobile ? open : true),
  });

  if (totalCount === 0) return <>{children}</>;

  const remaining = totalCount - reactors.length;

  // Mobile: use Popover (tap to open)
  if (isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            {children}
          </div>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-56 p-2">
          <ReactorList reactors={reactors} remaining={remaining} />
        </PopoverContent>
      </Popover>
    );
  }

  // Desktop: HoverCard
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-56 p-2">
        <ReactorList reactors={reactors} remaining={remaining} />
      </HoverCardContent>
    </HoverCard>
  );
}
