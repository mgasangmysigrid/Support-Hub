import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const { documentId, repairMode } = body;

    if (documentId && repairMode) {
      const actorId = await getActorId(req);

      await admin.from("document_pipeline_logs").insert({
        document_id: documentId,
        event_type: "repair_requested",
        actor_id: actorId,
      });

      // If there's a stale processing job, reset it to queued
      await recoverStaleJobForDocument(admin, documentId);

      // Enqueue (unique index prevents duplicates)
      const { error: jobErr } = await admin.from("document_jobs").insert({
        document_id: documentId,
        job_type: "finalize_document",
        status: "queued",
      });
      if (jobErr && jobErr.code !== "23505") throw jobErr;

      const result = await processQueuedJobs(admin);
      const docResult = result.find((r: any) => r.documentId === documentId);
      return new Response(JSON.stringify(docResult || { success: true, message: "Job queued" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (documentId && !repairMode) {
      // Direct invocation for a specific document (legacy compat)
      const result = await processDocument(admin, documentId, null);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Worker mode: recover stale jobs first, then process queue
    await recoverStaleJobs(admin);
    const results = await processQueuedJobs(admin);
    return new Response(JSON.stringify({ processed: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[finalize-document] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getActorId(req: Request): Promise<string | null> {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabase.auth.getClaims(token);
    return (data?.claims?.sub as string) || null;
  } catch {
    return null;
  }
}
const STALE_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

async function recoverStaleJobs(admin: ReturnType<typeof createClient>) {
  const threshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS).toISOString();
  const { data: staleJobs } = await admin
    .from("document_jobs")
    .select("id, document_id, attempt_count")
    .eq("status", "processing")
    .lt("updated_at", threshold);

  if (!staleJobs?.length) return;

  for (const job of staleJobs) {
    await admin.from("document_jobs").update({
      status: "queued",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("status", "processing");

    await admin.from("document_pipeline_logs").insert({
      document_id: job.document_id,
      event_type: "job_requeued_stale",
      job_id: job.id,
      details: { stale_threshold_ms: STALE_JOB_THRESHOLD_MS, attempt_count: job.attempt_count },
    });

    console.log(`[finalize-document] Recovered stale job ${job.id} for doc ${job.document_id}`);
  }
}

async function recoverStaleJobForDocument(admin: ReturnType<typeof createClient>, documentId: string) {
  const { data: staleJobs } = await admin
    .from("document_jobs")
    .select("id")
    .eq("document_id", documentId)
    .eq("status", "processing");

  if (!staleJobs?.length) return;

  for (const job of staleJobs) {
    await admin.from("document_jobs").update({
      status: "queued",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    await admin.from("document_pipeline_logs").insert({
      document_id: documentId,
      event_type: "job_requeued_stale",
      job_id: job.id,
      details: { reason: "repair_requested" },
    });
  }
}


async function processQueuedJobs(admin: ReturnType<typeof createClient>) {
  const { data: jobs } = await admin
    .from("document_jobs")
    .select("*")
    .eq("status", "queued")
    .eq("job_type", "finalize_document")
    .order("created_at", { ascending: true })
    .limit(5);

  if (!jobs?.length) return [];

  const results = [];
  for (const job of jobs) {
    // Claim job atomically
    const { data: claimed, error: claimErr } = await admin
      .from("document_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "queued")
      .select()
      .single();

    if (claimErr || !claimed) {
      results.push({ jobId: job.id, skipped: true, reason: "Could not claim" });
      continue;
    }

    // Audit: job processing
    await admin.from("document_pipeline_logs").insert({
      document_id: job.document_id,
      event_type: "job_processing",
      job_id: job.id,
      details: { attempt: job.attempt_count + 1 },
    });

    const result = await processDocument(admin, job.document_id, job.id);
    const newAttemptCount = job.attempt_count + 1;
    const jobFailed = !result.success && newAttemptCount >= MAX_ATTEMPTS;
    const jobStatus = result.success ? "completed" : (jobFailed ? "failed" : "queued");

    await admin.from("document_jobs").update({
      status: jobStatus,
      attempt_count: newAttemptCount,
      last_error: result.error || null,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    // Audit: job completed or failed
    await admin.from("document_pipeline_logs").insert({
      document_id: job.document_id,
      event_type: result.success ? "job_completed" : "job_failed",
      job_id: job.id,
      details: {
        attempt: newAttemptCount,
        final: jobFailed,
        error: result.error || null,
        status: result.status,
      },
    });

    // If job permanently failed, update document processing_state
    if (jobFailed) {
      await admin.from("documents").update({
        processing_state: "failed",
        finalization_error: result.error,
        finalization_attempted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.document_id);
    }

    results.push({ jobId: job.id, documentId: job.document_id, ...result });
  }
  return results;
}

async function processDocument(
  admin: ReturnType<typeof createClient>,
  documentId: string,
  jobId: string | null
): Promise<{ success: boolean; status?: string; error?: string }> {
  const tag = `[Finalize] doc=${documentId}`;
  const now = new Date().toISOString();

  try {
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) return { success: false, error: "Document not found" };

    // Set processing state
    await admin.from("documents").update({
      processing_state: "finalizing",
      processing_started_at: now,
      updated_at: now,
    }).eq("id", documentId);

    // Fetch signers
    const { data: signers } = await admin
      .from("document_signers")
      .select("*, signer:profiles!document_signers_signer_user_id_fkey(full_name)")
      .eq("document_id", documentId);

    if (!signers?.length) {
      await admin.from("documents").update({ processing_state: "idle", updated_at: now }).eq("id", documentId);
      return { success: true, status: doc.status };
    }

    const allSigned = signers.every((s: any) => s.status === "signed");
    if (!allSigned) {
      const signedCount = signers.filter((s: any) => s.status === "signed").length;
      const newStatus = signedCount > 0 ? "partially_signed" : "awaiting_signature";
      await admin.from("documents").update({
        status: newStatus, processing_state: "idle", updated_at: now,
      }).eq("id", documentId);
      return { success: true, status: newStatus };
    }

    // All signed — generate PDF
    const isPdf = doc.file_name?.toLowerCase().endsWith(".pdf") || doc.mime_type === "application/pdf";
    if (!isPdf) {
      await admin.from("documents").update({
        status: "completed", processing_state: "idle",
        finalized_at: now, finalization_error: null, updated_at: now,
      }).eq("id", documentId);
      return { success: true, status: "completed" };
    }

    // Fetch signature data and fields
    const { data: signatures } = await admin
      .from("document_signatures")
      .select("*, signer:profiles!document_signatures_signer_user_id_fkey(full_name)")
      .eq("document_id", documentId);

    const { data: fields } = await admin
      .from("document_signature_fields")
      .select("*")
      .eq("document_id", documentId);

    if (!signatures?.length) {
      console.error(`${tag} No signature data found`);
      return { success: false, error: "No signature data found" };
    }

    console.log(`${tag} Generating PDF: ${signatures.length} sigs, ${fields?.length ?? 0} fields`);
    const pdfBytes = await generateSignedPdf(doc.file_url, fields ?? [], signatures, signers);

    const fileName = `signed-${documentId}-${Date.now()}.pdf`;
    const filePath = `signed/${fileName}`;
    const { error: uploadErr } = await admin.storage
      .from("documents")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw uploadErr;

    await admin.from("documents").update({
      status: "completed",
      processing_state: "idle",
      signed_file_path: filePath,
      signed_file_url: null,
      finalized_at: now,
      finalization_error: null,
      updated_at: now,
    }).eq("id", documentId);

    console.log(`${tag} Finalized successfully: ${filePath}`);
    return { success: true, status: "completed" };
  } catch (err: any) {
    console.error(`${tag} Failed:`, err.message);
    // Don't update processing_state here — let the job handler decide based on retry count
    return { success: false, error: err.message };
  }
}

async function generateSignedPdf(
  pdfUrl: string,
  fields: any[],
  signatures: any[],
  signers: any[]
): Promise<Uint8Array> {
  const pdfResponse = await fetch(pdfUrl);
  if (!pdfResponse.ok) throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
  const pdfArrayBuffer = await pdfResponse.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfArrayBuffer);

  const sigMap = new Map<string, { sigData: string; name: string; signedAt: string | null }>();
  for (const sig of signatures) {
    const signerInfo = signers.find((s: any) => s.signer_user_id === sig.signer_user_id);
    sigMap.set(sig.signer_user_id, {
      sigData: sig.signature_data,
      name: sig.signer?.full_name || signerInfo?.signer?.full_name || "Signer",
      signedAt: signerInfo?.signed_at || sig.signed_at || null,
    });
  }

  const pages = pdfDoc.getPages();

  for (const field of fields) {
    if (!field.completed) continue;
    const sigInfo = sigMap.get(field.signer_user_id);
    if (!sigInfo) continue;

    const pageIndex = (field.page_number || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    const pageHeight = page.getHeight();

    const x = Number(field.x_position) || 0;
    const fieldHeight = Number(field.height) || 60;
    const fieldWidth = Number(field.width) || 200;
    const y = pageHeight - (Number(field.y_position) || 0) - fieldHeight;

    if (field.field_type === "signature" && sigInfo.sigData) {
      try {
        let sigImage;
        if (sigInfo.sigData.startsWith("data:image/png")) {
          const base64 = sigInfo.sigData.split(",")[1];
          const sigBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          sigImage = await pdfDoc.embedPng(sigBytes);
        } else if (sigInfo.sigData.startsWith("data:image/jpeg") || sigInfo.sigData.startsWith("data:image/jpg")) {
          const base64 = sigInfo.sigData.split(",")[1];
          const sigBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          sigImage = await pdfDoc.embedJpg(sigBytes);
        } else {
          const base64 = sigInfo.sigData.split(",")[1] || sigInfo.sigData;
          const sigBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          sigImage = await pdfDoc.embedPng(sigBytes);
        }

        const sigAreaHeight = fieldHeight * 0.7;
        const sigAreaWidth = fieldWidth;
        const scale = Math.min(sigAreaWidth / sigImage.width, sigAreaHeight / sigImage.height);
        const renderWidth = sigImage.width * scale;
        const renderHeight = sigImage.height * scale;
        const sigX = x + (sigAreaWidth - renderWidth) / 2;
        const sigY = y + fieldHeight - renderHeight - (sigAreaHeight - renderHeight) / 2;

        page.drawImage(sigImage, { x: sigX, y: sigY, width: renderWidth, height: renderHeight });

        const fontSize = Math.min(8, fieldHeight * 0.12);
        page.drawText(sigInfo.name, {
          x: x + 2, y: y + fieldHeight * 0.2, size: fontSize, color: rgb(0.15, 0.15, 0.15),
        });

        const dateText = sigInfo.signedAt
          ? `Signed on ${formatDate(sigInfo.signedAt)}`
          : `Signed on ${formatDate(new Date().toISOString())}`;
        page.drawText(dateText, {
          x: x + 2, y: y + fieldHeight * 0.06, size: fontSize * 0.85, color: rgb(0.4, 0.4, 0.4),
        });
      } catch (err) {
        console.error("Failed to embed signature for field:", field.id, err);
      }
    }
  }

  return pdfDoc.save();
}
