import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface HelpArticle {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  content: string | null;
  tags: string[];
  status: string;
  is_featured: boolean;
  is_policy: boolean;
  article_type: string;
  affected_module: string | null;
  view_count: number;
  helpful_yes_count: number;
  helpful_no_count: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const HELP_CATEGORIES = [
  { value: "getting-started", label: "Getting Started", icon: "🚀" },
  { value: "users-access", label: "Users & Access", icon: "👥" },
  { value: "leave-pto", label: "Leave & PTO", icon: "🏖️" },
  { value: "documents", label: "Documents", icon: "📄" },
  { value: "tickets-support", label: "Tickets & Support", icon: "🎫" },
  { value: "employee-portal", label: "Employee Portal", icon: "🏢" },
  { value: "company-policies", label: "Company Policies", icon: "📋" },
  { value: "whats-new", label: "What's New", icon: "✨" },
  { value: "faqs", label: "FAQs", icon: "❓" },
  { value: "troubleshooting", label: "Troubleshooting", icon: "🔧" },
] as const;

export const ARTICLE_TYPES = [
  { value: "guide", label: "Guide" },
  { value: "policy", label: "Policy" },
  { value: "release_note", label: "Release Note" },
  { value: "faq", label: "FAQ" },
  { value: "troubleshooting", label: "Troubleshooting" },
] as const;

export function categoryLabel(value: string) {
  return HELP_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function categoryIcon(value: string) {
  return HELP_CATEGORIES.find((c) => c.value === value)?.icon ?? "📖";
}

export function useHelpArticles(filters?: { category?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: ["help-articles", filters],
    queryFn: async () => {
      let q = supabase
        .from("help_articles")
        .select("*")
        .order("is_featured", { ascending: false })
        .order("updated_at", { ascending: false });

      if (filters?.category) q = q.eq("category", filters.category);
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.search) q = q.or(`title.ilike.%${filters.search}%,summary.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as HelpArticle[];
    },
  });
}

export function useHelpArticle(id: string | null) {
  return useQuery({
    queryKey: ["help-article", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as HelpArticle | null;
    },
  });
}

export function useSaveHelpArticle() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (article: Partial<HelpArticle> & { id?: string }) => {
      const payload = {
        ...article,
        updated_by: user?.id,
        ...(article.id ? {} : { created_by: user?.id }),
      };

      if (article.id) {
        const { error } = await supabase.from("help_articles").update(payload).eq("id", article.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("help_articles").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help-articles"] });
      qc.invalidateQueries({ queryKey: ["help-article"] });
      toast.success("Article saved");
    },
    onError: (e: any) => toast.error("Failed to save article", { description: e.message }),
  });
}

export function useDeleteHelpArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("help_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help-articles"] });
      toast.success("Article deleted");
    },
    onError: (e: any) => toast.error("Failed to delete article", { description: e.message }),
  });
}

export function useArticleFeedback(articleId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: feedback } = useQuery({
    queryKey: ["help-article-feedback", articleId, user?.id],
    enabled: !!articleId && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("help_article_feedback")
        .select("*")
        .eq("article_id", articleId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const submitFeedback = useMutation({
    mutationFn: async (isHelpful: boolean) => {
      const { error } = await supabase
        .from("help_article_feedback")
        .upsert(
          { article_id: articleId!, user_id: user!.id, is_helpful: isHelpful },
          { onConflict: "article_id,user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help-article-feedback", articleId] });
      toast.success("Thanks for your feedback!");
    },
  });

  return { feedback, submitFeedback };
}

export function useIncrementViewCount() {
  return useMutation({
    mutationFn: async (id: string) => {
      // Simple increment via RPC or raw update
      const { error } = await supabase.rpc("increment_help_article_views" as any, { article_id: id });
      // If RPC doesn't exist, silently fail - view count is nice-to-have
      if (error) console.warn("View count increment failed:", error.message);
    },
  });
}
