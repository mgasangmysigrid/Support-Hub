import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Hash, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

interface TagCount {
  tag: string;
  count: number;
}

export default function TrendingHashtags() {
  const { data: tags = [], isLoading } = useQuery<TagCount[]>({
    queryKey: ["trending-hashtags"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("photo_hashtags")
        .select("tag");
      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.tag] = (counts[row.tag] || 0) + 1;
      }

      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count }));
    },
  });

  if (isLoading || tags.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Trending Hashtags
        </h2>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {tags.map(({ tag, count }) => (
          <Link
            key={tag}
            to={`/?hashtag=${tag}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border bg-muted/40 hover:bg-accent hover:border-primary/30 transition-colors group"
          >
            <Hash className="h-3 w-3 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-foreground">{tag}</span>
            <span className="text-[10px] text-muted-foreground ml-0.5">{count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
