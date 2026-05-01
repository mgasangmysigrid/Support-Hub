import { supabase } from "@/integrations/supabase/client";

/**
 * Generate a fresh signed URL for a document's signed file path.
 */
export async function getSignedFileUrl(signedFilePath: string | null): Promise<string | null> {
  if (!signedFilePath) return null;
  const cleanPath = signedFilePath.split("?")[0];
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(cleanPath, 60 * 60);
  if (error) {
    console.warn("[getSignedFileUrl] Failed:", error.message);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * Trigger backend finalization for a document (repair mode).
 */
export async function repairDocument(documentId: string): Promise<{
  success: boolean;
  status?: string;
  error?: string;
}> {
  console.log(`[RepairDoc] Triggering backend finalization for ${documentId}`);
  const { data, error } = await supabase.functions.invoke("finalize-document", {
    body: { documentId, repairMode: true },
  });
  if (error) {
    console.error("[RepairDoc] Error:", error);
    return { success: false, error: error.message };
  }
  if (data?.error) {
    return { success: false, error: data.error };
  }
  return { success: data?.success ?? true, status: data?.status };
}

/**
 * Trigger backend worker to process all queued finalization jobs.
 */
export async function processFinalizationQueue(): Promise<{
  processed: number;
  results: any[];
}> {
  const { data, error } = await supabase.functions.invoke("finalize-document", {
    body: {},
  });
  if (error) throw error;
  return data;
}
