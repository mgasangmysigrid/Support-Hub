import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TicketSearchResult {
  ticket_id: string;
  match_context: string;
  match_rank: number;
  match_snippet: string | null;
}

const CONTEXT_LABELS: Record<string, string> = {
  description: "in description",
  comment: "in comment",
  attachment: "in attachment",
  requester: "requester match",
  owner: "owner match",
  collaborator: "collaborator match",
  assignee: "assignee match",
  department: "dept match",
};

/** Strip HTML tags and normalize whitespace for safe display */
function sanitizeSnippet(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")          // strip HTML
    .replace(/\[.*?\]/g, "")          // strip markdown-style brackets like [Reopened]
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim()
    .slice(0, 100);                   // hard cap
}

export function useTicketSearch(userId: string | undefined) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["ticket-search", userId, debouncedTerm],
    enabled: !!userId && debouncedTerm.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_my_tickets", {
        _user_id: userId!,
        _search_term: debouncedTerm,
      });
      if (error) throw error;
      return (data || []) as TicketSearchResult[];
    },
    staleTime: 30_000,
  });

  const matchingIds = useMemo(() => {
    if (!searchResults || debouncedTerm.length < 2) return null;
    return new Set(searchResults.map((r) => r.ticket_id));
  }, [searchResults, debouncedTerm]);

  const resultMap = useMemo(() => {
    if (!searchResults) return new Map<string, TicketSearchResult>();
    return new Map(searchResults.map((r) => [r.ticket_id, r]));
  }, [searchResults]);

  const rankMap = useMemo(() => {
    if (!searchResults) return new Map<string, number>();
    return new Map(searchResults.map((r) => [r.ticket_id, r.match_rank]));
  }, [searchResults]);

  const isActive = debouncedTerm.length >= 2;

  const filterTickets = <T extends { id: string }>(tickets: T[] | undefined): T[] => {
    if (!tickets) return [];
    if (!isActive || !matchingIds) return tickets;
    const filtered = tickets.filter((t) => matchingIds.has(t.id));
    return filtered.sort((a, b) => (rankMap.get(a.id) ?? 99) - (rankMap.get(b.id) ?? 99));
  };

  const getMatchContext = (ticketId: string): string | null => {
    const result = resultMap.get(ticketId);
    if (!result) return null;
    if (result.match_context === "title" || result.match_context === "ticket_no") return null;
    return CONTEXT_LABELS[result.match_context] || null;
  };

  const getMatchSnippet = (ticketId: string): string | null => {
    const result = resultMap.get(ticketId);
    if (!result?.match_snippet) return null;
    if (["description", "comment", "attachment"].includes(result.match_context)) {
      const sanitized = sanitizeSnippet(result.match_snippet);
      return sanitized.length > 0 ? sanitized : null;
    }
    return null;
  };

  const getRank = (ticketId: string): number => rankMap.get(ticketId) ?? 99;

  return {
    searchTerm,
    setSearchTerm,
    isSearching: isActive && isSearching,
    isActive,
    filterTickets,
    getMatchContext,
    getMatchSnippet,
    getRank,
    resultCount: matchingIds?.size ?? null,
  };
}
