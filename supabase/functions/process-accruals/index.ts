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

    // Get today's date in Manila timezone
    const manilaFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = manilaFormatter.format(new Date()); // YYYY-MM-DD
    const todayDate = new Date(todayStr);
    const todayDay = todayDate.getDate();
    const todayMonth = todayDate.getMonth();
    const todayYear = todayDate.getFullYear();

    console.log(`[process-accruals] Running for ${todayStr}, day=${todayDay}`);

    // 1. Expire old accrual entries
    const { data: expiring } = await adminClient
      .from("pto_ledger")
      .select("id, user_id, remaining_hours, expires_at")
      .eq("entry_type", "accrual")
      .gt("remaining_hours", 0)
      .lte("expires_at", todayStr);

    if (expiring && expiring.length > 0) {
      for (const entry of expiring) {
        await adminClient.from("pto_ledger").update({ remaining_hours: 0 }).eq("id", entry.id);
        await adminClient.from("pto_ledger").insert({
          user_id: entry.user_id,
          entry_type: "expired",
          hours: -Number(entry.remaining_hours),
          earned_at: entry.expires_at,
          notes: `Expired accrual from ${entry.expires_at}`,
        });
      }
      console.log(`[process-accruals] Expired ${expiring.length} entries`);
    }

    // 2. Process PTO accruals for active users whose accrual day matches today
    const { data: users } = await adminClient
      .from("profiles")
      .select("id, start_date, accrual_start_date, schedule_id, is_active, date_of_birth")
      .eq("is_active", true);

    if (!users) {
      return new Response(JSON.stringify({ processed: 0, expired: expiring?.length || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    function getAnnualPTODays(yearsOfService: number): number {
      if (yearsOfService < 2) return 20;
      if (yearsOfService < 3) return 21;
      if (yearsOfService < 4) return 22;
      if (yearsOfService < 5) return 23;
      if (yearsOfService < 6) return 24;
      return 25;
    }

    let accrued = 0;
    for (const user of users) {
      const baseDate = user.accrual_start_date || user.start_date;
      if (!baseDate) continue;

      const accrualDay = new Date(baseDate).getDate();
      if (accrualDay !== todayDay) continue;

      const monthStart = `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}-01`;
      const { data: existing } = await adminClient
        .from("pto_ledger")
        .select("id")
        .eq("user_id", user.id)
        .eq("entry_type", "accrual")
        .gte("created_at", monthStart)
        .limit(1);

      if (existing && existing.length > 0) continue;

      const startDate = new Date(user.start_date || baseDate);
      const yearsOfService = (todayDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      const annualDays = getAnnualPTODays(yearsOfService);

      let hoursPerDay = 8;
      if (user.schedule_id) {
        const { data: sched } = await adminClient
          .from("schedules")
          .select("hours_per_day")
          .eq("id", user.schedule_id)
          .single();
        if (sched) hoursPerDay = Number(sched.hours_per_day);
      }

      const annualHours = annualDays * hoursPerDay;
      const monthlyHours = annualHours / 12;
      const expiresAt = `${todayYear + 1}-${String(todayMonth + 1).padStart(2, "0")}-${String(accrualDay).padStart(2, "0")}`;

      await adminClient.from("pto_ledger").insert({
        user_id: user.id,
        entry_type: "accrual",
        hours: monthlyHours,
        remaining_hours: monthlyHours,
        earned_at: todayStr,
        expires_at: expiresAt,
        notes: `Monthly accrual (Year ${Math.floor(yearsOfService) + 1}, ${annualDays}d/yr)`,
      });

      accrued++;
    }

    // 3. Process Birthday Leave credits
    // Policy:
    //   - Employee must have >= 1 year tenure ON their birthday
    //   - Credit exactly 30 days before their birthday
    //   - Valid from credit date until 30 days after birthday
    //   - One credit per employee per birthday year
    let birthdayCredited = 0;

    for (const user of users) {
      if (!user.date_of_birth || !user.start_date) continue;

      const dob = new Date(user.date_of_birth);
      const startDate = new Date(user.start_date);

      // Calculate this year's birthday
      const birthdayThisYear = new Date(todayYear, dob.getMonth(), dob.getDate());

      // Credit date = exactly 30 days before birthday
      const creditDate = new Date(birthdayThisYear);
      creditDate.setDate(creditDate.getDate() - 30);
      const creditDateStr = creditDate.toISOString().split("T")[0];

      // Only credit on the exact credit date (or if we missed it and it's still before expiry)
      // But the daily job should only trigger on the exact credit date
      if (todayStr !== creditDateStr) continue;

      // Tenure check: must have >= 1 full year on their birthday
      const tenureOnBirthday = (birthdayThisYear.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (tenureOnBirthday < 1) {
        console.log(`[process-accruals] ${user.id} ineligible for birthday leave (tenure on bday: ${tenureOnBirthday.toFixed(2)}yr)`);
        continue;
      }

      // Expiry = 30 days after birthday
      const expiryDate = new Date(birthdayThisYear);
      expiryDate.setDate(expiryDate.getDate() + 30);
      const expiryStr = expiryDate.toISOString().split("T")[0];

      // Duplicate check: any birthday leave credit for this user in this year
      const yearStart = `${todayYear}-01-01`;
      const yearEnd = `${todayYear}-12-31`;
      const { data: existingBday } = await adminClient
        .from("pto_ledger")
        .select("id")
        .eq("user_id", user.id)
        .eq("entry_type", "adjustment")
        .gte("earned_at", yearStart)
        .lte("earned_at", yearEnd)
        .ilike("notes", "%Birthday Leave%")
        .limit(1);

      if (existingBday && existingBday.length > 0) continue;

      // Get schedule hours_per_day
      let hoursPerDay = 8;
      if (user.schedule_id) {
        const { data: sched } = await adminClient
          .from("schedules")
          .select("hours_per_day")
          .eq("id", user.schedule_id)
          .single();
        if (sched) hoursPerDay = Number(sched.hours_per_day);
      }

      const bdayStr = birthdayThisYear.toISOString().split("T")[0];

      await adminClient.from("pto_ledger").insert({
        user_id: user.id,
        entry_type: "adjustment",
        hours: hoursPerDay,
        remaining_hours: hoursPerDay,
        earned_at: creditDateStr,
        expires_at: expiryStr,
        notes: `Birthday Leave (${todayYear}) | DOB: ${user.date_of_birth} | Birthday: ${bdayStr} | Valid: ${creditDateStr} to ${expiryStr} | Tenure: ${tenureOnBirthday.toFixed(1)}yr`,
      });

      birthdayCredited++;
      console.log(`[process-accruals] Credited birthday leave for user ${user.id} (tenure: ${tenureOnBirthday.toFixed(2)}yr, bday: ${bdayStr})`);
    }

    if (birthdayCredited > 0) {
      console.log(`[process-accruals] Credited birthday leave for ${birthdayCredited} users`);
    }

    console.log(`[process-accruals] Accrued for ${accrued} users, expired ${expiring?.length || 0} entries, birthday ${birthdayCredited}`);

    return new Response(JSON.stringify({ processed: accrued, expired: expiring?.length || 0, birthday_credited: birthdayCredited }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-accruals] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
