import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get today in Manila timezone
    const manilaFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = manilaFormatter.format(new Date());
    const todayDate = new Date(todayStr);
    const todayYear = todayDate.getFullYear();

    console.log(`[backfill-birthday-leave] Running for year ${todayYear}, today=${todayStr}`);

    // Get all active users with DOB and start_date
    const { data: users, error: usersErr } = await adminClient
      .from("profiles")
      .select("id, full_name, start_date, date_of_birth, schedule_id")
      .eq("is_active", true)
      .not("date_of_birth", "is", null)
      .not("start_date", "is", null);

    if (usersErr) throw usersErr;
    if (!users) {
      return new Response(JSON.stringify({ message: "No users found", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{
      user_id: string;
      full_name: string;
      birthday: string;
      credit_date: string;
      valid_until: string;
      tenure_years: number;
      status: string;
      detail: string;
    }> = [];

    for (const user of users) {
      const dob = new Date(user.date_of_birth);
      const startDate = new Date(user.start_date);

      // This year's birthday
      const birthdayThisYear = new Date(todayYear, dob.getMonth(), dob.getDate());
      const bdayStr = birthdayThisYear.toISOString().split("T")[0];

      // Credit date = 30 days before birthday
      const creditDate = new Date(birthdayThisYear);
      creditDate.setDate(creditDate.getDate() - 30);
      const creditDateStr = creditDate.toISOString().split("T")[0];

      // Expiry = 30 days after birthday
      const expiryDate = new Date(birthdayThisYear);
      expiryDate.setDate(expiryDate.getDate() + 30);
      const expiryStr = expiryDate.toISOString().split("T")[0];

      // Tenure check on birthday
      const tenureOnBday = (birthdayThisYear.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

      if (tenureOnBday < 1) {
        results.push({
          user_id: user.id,
          full_name: user.full_name || "Unknown",
          birthday: bdayStr,
          credit_date: creditDateStr,
          valid_until: expiryStr,
          tenure_years: Math.round(tenureOnBday * 100) / 100,
          status: "ineligible",
          detail: `Tenure on birthday: ${tenureOnBday.toFixed(2)}yr (< 1yr)`,
        });
        continue;
      }

      // Has credit date passed?
      if (todayDate < creditDate) {
        results.push({
          user_id: user.id,
          full_name: user.full_name || "Unknown",
          birthday: bdayStr,
          credit_date: creditDateStr,
          valid_until: expiryStr,
          tenure_years: Math.round(tenureOnBday * 100) / 100,
          status: "future",
          detail: `Credit date ${creditDateStr} is in the future`,
        });
        continue;
      }

      // Check if already credited this year
      const yearStart = `${todayYear}-01-01`;
      const yearEnd = `${todayYear}-12-31`;
      const { data: existing } = await adminClient
        .from("pto_ledger")
        .select("id")
        .eq("user_id", user.id)
        .eq("entry_type", "adjustment")
        .gte("earned_at", yearStart)
        .lte("earned_at", yearEnd)
        .ilike("notes", "%Birthday Leave%")
        .limit(1);

      if (existing && existing.length > 0) {
        results.push({
          user_id: user.id,
          full_name: user.full_name || "Unknown",
          birthday: bdayStr,
          credit_date: creditDateStr,
          valid_until: expiryStr,
          tenure_years: Math.round(tenureOnBday * 100) / 100,
          status: "already_credited",
          detail: "Already has birthday leave credit for this year",
        });
        continue;
      }

      // Check if already expired
      const isExpired = todayDate > expiryDate;

      // Get hours per day from schedule
      let hoursPerDay = 8;
      if (user.schedule_id) {
        const { data: sched } = await adminClient
          .from("schedules")
          .select("hours_per_day")
          .eq("id", user.schedule_id)
          .single();
        if (sched) hoursPerDay = Number(sched.hours_per_day);
      }

      // Credit the birthday leave
      await adminClient.from("pto_ledger").insert({
        user_id: user.id,
        entry_type: "adjustment",
        hours: hoursPerDay,
        remaining_hours: isExpired ? 0 : hoursPerDay,
        earned_at: creditDateStr,
        expires_at: expiryStr,
        notes: `Birthday Leave (${todayYear}) [backfill] | DOB: ${user.date_of_birth} | Birthday: ${bdayStr} | Valid: ${creditDateStr} to ${expiryStr} | Tenure: ${tenureOnBday.toFixed(1)}yr`,
      });

      results.push({
        user_id: user.id,
        full_name: user.full_name || "Unknown",
        birthday: bdayStr,
        credit_date: creditDateStr,
        valid_until: expiryStr,
        tenure_years: Math.round(tenureOnBday * 100) / 100,
        status: isExpired ? "credited_but_expired" : "credited",
        detail: isExpired
          ? `Backfilled but already expired (${expiryStr}). remaining_hours set to 0.`
          : `Successfully credited ${hoursPerDay}h`,
      });
    }

    const credited = results.filter(r => r.status === "credited" || r.status === "credited_but_expired");
    console.log(`[backfill-birthday-leave] Credited ${credited.length} users. Total analyzed: ${results.length}`);

    return new Response(JSON.stringify({ results, summary: {
      total: results.length,
      credited: credited.length,
      already_credited: results.filter(r => r.status === "already_credited").length,
      ineligible: results.filter(r => r.status === "ineligible").length,
      future: results.filter(r => r.status === "future").length,
    }}), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[backfill-birthday-leave] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
