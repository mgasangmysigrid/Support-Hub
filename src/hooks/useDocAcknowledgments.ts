import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useCallback } from "react";

/**
 * Hook providing acknowledgment status for knowledge_base docs
 * and the ability to acknowledge them.
 */
export function useDocAcknowledgments() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Fetch user's acknowledgments
  const { data: myAcks = [] } = useQuery({
    queryKey: ["my-doc-acks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_document_acknowledgments")
        .select("document_id, document_version, acknowledged_at")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isAcknowledged = useCallback(
    (docId: string, version: number) =>
      myAcks.some((a) => a.document_id === docId && a.document_version === version),
    [myAcks]
  );

  const getAckDate = useCallback(
    (docId: string, version: number) => {
      const ack = myAcks.find((a) => a.document_id === docId && a.document_version === version);
      return ack?.acknowledged_at ?? null;
    },
    [myAcks]
  );

  const acknowledge = useCallback(
    async (docId: string, version: number) => {
      if (!user) return;
      const { error } = await supabase
        .from("company_document_acknowledgments")
        .insert({
          document_id: docId,
          user_id: user.id,
          document_version: version,
          user_agent: navigator.userAgent,
        });
      if (error) {
        if (error.code === "23505") {
          toast.info("Already acknowledged");
        } else {
          toast.error("Failed to acknowledge", { description: error.message });
          return;
        }
      } else {
        toast.success("Document acknowledged");
      }
      qc.invalidateQueries({ queryKey: ["my-doc-acks"] });
      qc.invalidateQueries({ queryKey: ["kb-pending-ack-count"] });
    },
    [user, qc]
  );

  return { myAcks, isAcknowledged, getAckDate, acknowledge };
}

/**
 * Returns the count of knowledge_base docs requiring acknowledgment
 * that the current user has NOT yet acknowledged for the current version.
 * Only counts docs the user is eligible to see (based on visibility_type).
 */
export function usePendingAckCount() {
  const { user } = useAuth();

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["kb-pending-ack-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Get all docs requiring acknowledgment (not archived)
      const { data: docs, error: docsErr } = await supabase
        .from("knowledge_base")
        .select("id, document_version, visibility_type")
        .eq("requires_acknowledgment", true)
        .eq("is_archived", false);
      if (docsErr) throw docsErr;
      if (!docs?.length) return 0;

      // Get user's department memberships
      const { data: myDepts } = await supabase
        .from("department_members")
        .select("department_id")
        .eq("user_id", user!.id);
      const myDeptIds = new Set((myDepts ?? []).map((d) => d.department_id));

      // Get KB department links for dept-specific docs
      const deptSpecificIds = docs
        .filter((d: any) => d.visibility_type === "department_specific")
        .map((d) => d.id);

      let kbDeptLinks: { knowledge_base_id: string; department_id: string }[] = [];
      if (deptSpecificIds.length > 0) {
        const { data: links } = await supabase
          .from("knowledge_base_departments")
          .select("knowledge_base_id, department_id")
          .in("knowledge_base_id", deptSpecificIds);
        kbDeptLinks = links ?? [];
      }

      // Filter to docs the user can see
      const visibleDocs = docs.filter((d: any) => {
        if (d.visibility_type !== "department_specific") return true;
        const linkedDeptIds = kbDeptLinks
          .filter((l) => l.knowledge_base_id === d.id)
          .map((l) => l.department_id);
        return linkedDeptIds.some((did) => myDeptIds.has(did));
      });

      if (!visibleDocs.length) return 0;

      // Get user's acks
      const { data: acks, error: acksErr } = await supabase
        .from("company_document_acknowledgments")
        .select("document_id, document_version")
        .eq("user_id", user!.id);
      if (acksErr) throw acksErr;

      const ackSet = new Set((acks ?? []).map((a) => `${a.document_id}:${a.document_version}`));
      return visibleDocs.filter((d) => !ackSet.has(`${d.id}:${d.document_version}`)).length;
    },
    refetchInterval: 60000,
  });

  return pendingCount;
}
