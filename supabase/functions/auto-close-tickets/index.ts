import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find tickets in "for_review" status where updated_at is older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: staleTickets, error: fetchErr } = await supabase
      .from("tickets")
      .select("id, ticket_no, requester_id, status, updated_at")
      .eq("status", "for_review")
      .eq("closure_confirmation_status", "pending")
      .lt("updated_at", cutoff);

    if (fetchErr) throw fetchErr;

    if (!staleTickets || staleTickets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No stale tickets to close", closed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let closedCount = 0;

    for (const ticket of staleTickets) {
      // Close the ticket
      const { error: updateErr } = await supabase
        .from("tickets")
        .update({
          status: "closed",
          closure_confirmation_status: "resolved_yes",
          closure_confirmed_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
          closed_by: ticket.requester_id, // attribute to requester (auto-confirmed)
        })
        .eq("id", ticket.id);

      if (updateErr) {
        console.error(`Failed to close ticket ${ticket.ticket_no}:`, updateErr);
        continue;
      }

      // Log activity — use requester as actor since it's auto-confirmed on their behalf
      const { error: actErr1 } = await supabase.from("ticket_activity").insert({
        ticket_id: ticket.id,
        actor_id: ticket.requester_id,
        action: "closed",
        to_value: {
          reason: "Auto-closed after 24 hours without requester response",
        },
      });
      if (actErr1) console.error(`Activity insert (closed) failed for ${ticket.ticket_no}:`, actErr1);

      const { error: actErr2 } = await supabase.from("ticket_activity").insert({
        ticket_id: ticket.id,
        actor_id: ticket.requester_id,
        action: "status_changed",
        from_value: { status: "for_review" },
        to_value: { status: "closed" },
      });
      if (actErr2) console.error(`Activity insert (status_changed) failed for ${ticket.ticket_no}:`, actErr2);

      // Add a system comment
      const { error: commentErr } = await supabase.from("ticket_comments").insert({
        ticket_id: ticket.id,
        author_id: ticket.requester_id,
        body: "[Auto-Closed] This ticket was automatically closed after 24 hours without requester confirmation. The resolution has been accepted.",
      });
      if (commentErr) console.error(`Comment insert failed for ${ticket.ticket_no}:`, commentErr);

      // Notify the requester
      await supabase.from("notifications").insert({
        user_id: ticket.requester_id,
        type: "ticket_activity",
        title: "Ticket Auto-Closed",
        body: `${ticket.ticket_no} was automatically closed after 24 hours. If the issue persists, you can reopen it.`,
        link: `/tickets/${ticket.id}`,
      });

      closedCount++;
      console.log(`Auto-closed ticket ${ticket.ticket_no}`);
    }

    return new Response(
      JSON.stringify({
        message: `Auto-closed ${closedCount} ticket(s)`,
        closed: closedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Auto-close error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
