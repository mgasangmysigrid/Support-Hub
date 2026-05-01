import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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

    const { data: docs, error: dbError } = await supabase
      .from("knowledge_base")
      .select("id, title, category, content, file_name, file_path")
      .order("updated_at", { ascending: false });

    if (dbError) throw dbError;

    const textParts: string[] = [];
    const userContent: Array<any> = [{ type: "text", text: question }];

    for (const doc of docs ?? []) {
      const header = `Document: "${doc.title}" (Category: ${doc.category})`;

      if (doc.content) {
        textParts.push(`${header}\n${doc.content}`);
      }

      if (doc.file_path && doc.file_name?.toLowerCase().endsWith(".pdf")) {
        try {
          const { data: fileData, error: dlError } = await supabase.storage
            .from("knowledge-base")
            .download(doc.file_path);

          if (!dlError && fileData) {
            const bytes = new Uint8Array(await fileData.arrayBuffer());
            const base64 = toBase64(bytes);

            userContent.push({
              type: "text",
              text: `Use this PDF as source: ${doc.title}`,
            });

            userContent.push({
              type: "input_file",
              input_file: {
                filename: doc.file_name,
                file_data: `data:application/pdf;base64,${base64}`,
              },
            });
          }
        } catch (err) {
          console.error(`Failed to load PDF for doc ${doc.id}:`, err);
        }
      }
    }

    const textContext = textParts.join("\n\n---\n\n");

    const systemPrompt = `You are a helpful assistant for MySigrid's internal Support Hub. Your role is to answer questions based ONLY on the Company Updates / Knowledge Base documents provided below and attached PDF files.

Rules:
- Answer concisely and accurately based on the documents.
- If the answer is found, mention which document title it came from.
- If the information is not in any document, say "I couldn't find information about that in the Company Updates. You may want to check with your manager or create a support ticket."
- Do not make up information. Only use what's in the documents.
- Format your answers with markdown for readability.

--- TEXT DOCUMENTS ---
${textContext || "(No text documents available)"}
--- END TEXT DOCUMENTS ---`;

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
          { role: "user", content: userContent },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI is busy right now. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please contact your administrator." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const answer = result.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate an answer.";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kb-ask error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
