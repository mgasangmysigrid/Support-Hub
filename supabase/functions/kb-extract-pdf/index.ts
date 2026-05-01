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
    const { doc_id } = await req.json();
    if (!doc_id) {
      return new Response(JSON.stringify({ error: "doc_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the document
    const { data: doc, error: dbError } = await supabase
      .from("knowledge_base")
      .select("id, title, file_path, file_name, content")
      .eq("id", doc_id)
      .single();

    if (dbError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!doc.file_path || !doc.file_name?.toLowerCase().endsWith(".pdf")) {
      return new Response(JSON.stringify({ error: "No PDF file attached" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download PDF from storage
    const { data: fileData, error: dlError } = await supabase.storage
      .from("knowledge-base")
      .download(doc.file_path);

    if (dlError || !fileData) {
      throw new Error(`Failed to download PDF: ${dlError?.message}`);
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const base64 = toBase64(bytes);

    // Send PDF to AI for text extraction
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a document text extractor. Extract ALL text content from the provided PDF document.
Rules:
- Extract the complete text content, preserving structure with headings, bullet points, and paragraphs.
- Use markdown formatting for headings (#, ##, ###), lists (- or 1.), and emphasis.
- Do NOT summarize or omit any content. Extract everything.
- Do NOT add commentary, just output the extracted text.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract all text from this PDF document titled "${doc.title}".` },
              {
                type: "input_file",
                input_file: {
                  filename: doc.file_name,
                  file_data: `data:application/pdf;base64,${base64}`,
                },
              },
            ],
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Failed to extract text from PDF");
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content;

    if (!extractedText) {
      throw new Error("No text extracted from PDF");
    }

    // Update the document content with extracted text
    const { error: updateError } = await supabase
      .from("knowledge_base")
      .update({ content: extractedText })
      .eq("id", doc_id);

    if (updateError) throw updateError;

    console.log(`Successfully extracted text for doc ${doc_id} (${extractedText.length} chars)`);

    return new Response(JSON.stringify({ success: true, chars: extractedText.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kb-extract-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
