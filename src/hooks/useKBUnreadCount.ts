import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the count of knowledge base documents the current user hasn't read yet.
 */
export function useKBUnreadCount() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetch = async () => {
      // Get total doc count
      const { count: totalCount } = await supabase
        .from("knowledge_base")
        .select("*", { count: "exact", head: true });

      // Get read count for this user
      const { count: readCount } = await supabase
        .from("knowledge_base_reads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setUnreadCount(Math.max(0, (totalCount || 0) - (readCount || 0)));
    };

    fetch();

    // Re-fetch when kb docs or reads change
    const channel = supabase
      .channel("kb-unread-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "knowledge_base" }, () => fetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "knowledge_base_reads" }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return unreadCount;
}
