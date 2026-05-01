import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return new Response(JSON.stringify({ error: "Question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch published help articles
    const { data: articles, error: dbError } = await supabase
      .from("help_articles")
      .select("id, title, category, summary, content, article_type, tags, is_policy, affected_module")
      .eq("status", "published")
      .order("updated_at", { ascending: false });

    if (dbError) throw dbError;

    const textParts: string[] = [];
    for (const a of articles ?? []) {
      const typeLabel = a.is_policy ? "OFFICIAL POLICY" : a.article_type;
      const tags = a.tags?.length ? `Tags: ${a.tags.join(", ")}` : "";
      const module = a.affected_module ? `Module: ${a.affected_module}` : "";
      const header = `[${typeLabel}] "${a.title}" (Category: ${a.category}) ${tags} ${module}`.trim();
      const body = a.content || a.summary || "(no content)";
      textParts.push(`${header}\n${body}`);
    }

    const textContext = textParts.join("\n\n---\n\n");

    const systemPrompt = `You are the Help Center AI for MySigrid's Support Hub. Answer questions based ONLY on the Help Center articles provided below.

Rules:
- Answer concisely and accurately using only the provided articles.
- If the answer is found, mention the article title as reference.
- If an article is marked as OFFICIAL POLICY, emphasize that it is official guidance.
- Suggest related article titles when relevant.
- If no reliable answer exists, say: "I couldn't find that in the Help Center. You may want to create a support ticket for assistance."
- Do not make up information.
- Format answers with markdown for readability.

--- HELP CENTER ARTICLES ---
${textContext || "(No articles available yet)"}
--- END ARTICLES ---`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question.trim() },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI is busy right now. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please contact your administrator." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const answer = result.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate an answer.";

    // Extract suggested article IDs from the context
    const suggestedArticles = (articles ?? [])
      .filter(a => answer.toLowerCase().includes(a.title.toLowerCase()))
      .slice(0, 3)
      .map(a => ({ id: a.id, title: a.title, category: a.category }));

    return new Response(JSON.stringify({ answer, suggestedArticles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("help-center-ask error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
