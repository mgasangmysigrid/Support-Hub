import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PUBLIC_BASE_URL = "https://my-sigrid-support-hub.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PUSHOVER_APP_TOKEN = Deno.env.get("PUSHOVER_APP_TOKEN");
    if (!PUSHOVER_APP_TOKEN) {
      throw new Error("PUSHOVER_APP_TOKEN is not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (payload ?? {}) as Record<string, unknown>;
    const user_id = typeof body.user_id === "string" ? body.user_id : "";
    const title = typeof body.title === "string" ? body.title : "";
    const messageBody = typeof body.body === "string" ? body.body : "";
    const link = typeof body.link === "string" ? body.link : null;
    const priorityRaw = typeof body.priority === "string" ? body.priority : "normal";

    if (!user_id || !title || !messageBody) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: user_id, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, pushover_user_key, pushover_enabled")
      .eq("id", user_id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup failed:", profileError);
      return new Response(
        JSON.stringify({ error: "Profile lookup failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userKey = (profile.pushover_user_key ?? "").trim();
    if (!userKey) {
      console.log(`Skip push for ${user_id}: no pushover_user_key configured`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_key" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (profile.pushover_enabled === false) {
      console.log(`Skip push for ${user_id}: pushover disabled`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pushoverPriority = priorityRaw === "critical" ? 1 : 0;
    const targetUrl = link ? `${PUBLIC_BASE_URL}${link}` : PUBLIC_BASE_URL;

    const params = new URLSearchParams();
    params.append("token", PUSHOVER_APP_TOKEN);
    params.append("user", userKey);
    params.append("title", title.slice(0, 250));
    params.append("message", messageBody.slice(0, 1024));
    params.append("priority", String(pushoverPriority));
    params.append("url", targetUrl);
    params.append("url_title", "Open in Support Hub");

    const pushRes = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const pushData = await pushRes.json().catch(() => ({}));

    if (!pushRes.ok || pushData.status !== 1) {
      console.error("Pushover API error:", pushRes.status, JSON.stringify(pushData));
      return new Response(
        JSON.stringify({ error: "Pushover send failed", details: pushData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Pushover delivered to ${profile.full_name ?? user_id} (priority=${pushoverPriority})`);
    return new Response(
      JSON.stringify({ success: true, request: pushData.request }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-pushover-notification:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
