import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const stepLog: string[] = [];
  const log = (step: string, detail?: string) => {
    const msg = detail ? `[${step}] ${detail}` : `[${step}]`;
    stepLog.push(msg);
    console.log(`[complete-signer] ${msg}`);
  };

  try {
    // Step 1: Validate auth
    log("auth", "checking authorization header");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log("auth", "missing or invalid Authorization header");
      return respond(401, { error: "Unauthorized" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user?.id) {
      log("auth", `getUser failed: ${userErr?.message || "no user"}`);
      return respond(401, { error: "Unauthorized" });
    }
    const userId = userData.user.id;
    log("auth", `authenticated user=${userId}`);

    // Step 2: Parse input
    const { documentId, signatureData, signatureType, saveForFuture } = await req.json();
    if (!documentId || !signatureData) {
      log("input", "missing documentId or signatureData");
      return respond(400, { error: "Missing documentId or signatureData" });
    }
    log("input", `documentId=${documentId}`);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 3: Verify signer is authorized
    log("signer_lookup", "querying document_signers");
    const { data: signer, error: signerErr } = await admin
      .from("document_signers")
      .select("id, status, signer_user_id")
      .eq("document_id", documentId)
      .eq("signer_user_id", userId)
      .single();

    if (signerErr || !signer) {
      log("signer_lookup", `not found: ${signerErr?.message || "no row"}`);
      return respond(403, { error: "You are not a signer for this document" });
    }
    log("signer_lookup", `found signer=${signer.id} status=${signer.status}`);

    // Step 4: Handle already-signed case
    if (signer.status === "signed") {
      log("already_signed", "returning current state");
      const { data: allSigners } = await admin.from("document_signers").select("status").eq("document_id", documentId);
      const sc = allSigners?.filter((s) => s.status === "signed").length ?? 0;
      const tc = allSigners?.length ?? 0;
      const { data: docState } = await admin.from("documents").select("status, processing_state, signed_file_path").eq("id", documentId).single();
      return respond(200, {
        success: true,
        alreadySigned: true,
        signedCount: sc,
        totalCount: tc,
        allSigned: sc === tc && tc > 0,
        documentStatus: docState?.status,
        processingState: docState?.processing_state,
        hasSignedArtifact: !!docState?.signed_file_path,
      });
    }

    const now = new Date().toISOString();

    // Step 5: Save signature payload
    log("save_signature", "upserting document_signatures");
    const { error: sigInsertErr } = await admin.from("document_signatures").upsert({
      document_id: documentId,
      signer_user_id: userId,
      signature_type: signatureType || "draw",
      signature_data: signatureData,
    }, { onConflict: "document_id,signer_user_id" });
    if (sigInsertErr) {
      log("save_signature", `FAILED: ${sigInsertErr.message}`);
      throw sigInsertErr;
    }
    log("save_signature", "success");

    // Step 6: Mark signer as signed
    log("update_signer", "setting status=signed");
    const { error: signerUpdateErr } = await admin
      .from("document_signers")
      .update({ status: "signed", signed_at: now })
      .eq("document_id", documentId)
      .eq("signer_user_id", userId);
    if (signerUpdateErr) {
      log("update_signer", `FAILED: ${signerUpdateErr.message}`);
      throw signerUpdateErr;
    }
    log("update_signer", "success");

    // Step 7: Mark signature fields completed
    log("update_fields", "marking fields completed");
    await admin
      .from("document_signature_fields")
      .update({ completed: true })
      .eq("document_id", documentId)
      .eq("signer_user_id", userId);

    // Step 8: Save for future if requested
    if (saveForFuture) {
      log("save_future", "saving user signature for reuse");
      await admin.from("user_saved_signatures").upsert(
        { user_id: userId, signature_type: signatureType || "draw", signature_data: signatureData, updated_at: now },
        { onConflict: "user_id" }
      );
    }

    // Step 9: Audit log
    log("audit", "logging signer_completed");
    await admin.from("document_pipeline_logs").insert({
      document_id: documentId,
      event_type: "signer_completed",
      actor_id: userId,
      details: { signer_id: signer.id },
    });

    // Step 10: Check all signers
    log("check_all", "counting signers");
    const { data: allSigners } = await admin
      .from("document_signers")
      .select("status")
      .eq("document_id", documentId);

    const signedCount = allSigners?.filter((s) => s.status === "signed").length ?? 0;
    const totalCount = allSigners?.length ?? 0;
    const allSigned = signedCount === totalCount && totalCount > 0;
    log("check_all", `signed=${signedCount}/${totalCount} allSigned=${allSigned}`);

    let newStatus: string;
    let processingState: string;

    if (allSigned) {
      newStatus = "partially_signed";
      processingState = "queued";

      log("finalize", "enqueueing finalize job");
      const { data: job, error: jobErr } = await admin.from("document_jobs").insert({
        document_id: documentId,
        job_type: "finalize_document",
        status: "queued",
      }).select("id").maybeSingle();

      if (jobErr && jobErr.code === "23505") {
        log("finalize", "job already exists (duplicate key)");
      } else if (jobErr) {
        log("finalize", `job insert FAILED: ${jobErr.message} — continuing gracefully`);
        // Don't throw — signature is already saved
        processingState = "failed";
      }

      await admin.from("document_pipeline_logs").insert({
        document_id: documentId,
        event_type: "job_queued",
        actor_id: userId,
        details: { job_id: job?.id, signed_count: signedCount, total_count: totalCount },
      });
    } else if (signedCount > 0) {
      newStatus = "partially_signed";
      processingState = "idle";
    } else {
      newStatus = "awaiting_signature";
      processingState = "idle";
    }

    // Step 11: Update document
    log("update_doc", `status=${newStatus} processing=${processingState}`);
    await admin.from("documents").update({
      status: newStatus,
      processing_state: processingState,
      updated_at: now,
    }).eq("id", documentId);

    // Step 12: Notification to issuer
    log("notify", "sending notification to issuer");
    const { data: doc } = await admin.from("documents").select("title, issued_by_user_id").eq("id", documentId).single();
    const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", userId).single();
    const signerName = profile?.full_name || profile?.email || "Signer";

    if (doc && doc.issued_by_user_id !== userId) {
      await admin.from("notifications").insert({
        user_id: doc.issued_by_user_id,
        type: "document_signed",
        title: "Document Signed",
        body: `${signerName} signed "${doc.title}"`,
        link: "/admin?tab=documents",
      });
    }

    log("done", "returning success");
    return respond(200, { success: true, signedCount, totalCount, allSigned, processingState });

  } catch (err: any) {
    console.error("[complete-signer] Error:", err);
    console.error("[complete-signer] Steps completed:", stepLog);
    return respond(200, {
      success: false,
      error: err.message || "An unexpected error occurred during signing",
      errorStep: stepLog[stepLog.length - 1] || "unknown",
    });
  }
});
