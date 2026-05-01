import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SurveyPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Verify user is the ticket requester & check self-handled
  const { data: ticket, isLoading } = useQuery({
    queryKey: ["survey-ticket-check", id],
    enabled: !!id && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, requester_id, assignee_id, primary_assignee_id")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isRequester = ticket?.requester_id === user?.id;
  const resolverId = (ticket as any)?.primary_assignee_id || ticket?.assignee_id;
  const isSelfHandled = ticket ? (ticket.requester_id === resolverId || (ticket.requester_id === user?.id && !resolverId)) : false;

  // Self-handled tickets don't need feedback — redirect immediately
  useEffect(() => {
    if (!isLoading && ticket && isSelfHandled) {
      navigate("/tickets", { replace: true });
    }
  }, [isLoading, ticket, isSelfHandled, navigate]);

  // Non-requesters: silently redirect to ticket detail (no Access Denied UI)
  useEffect(() => {
    if (isLoading || !user) return;
    if (!ticket) return;
    if (isSelfHandled) return;
    if (!isRequester) {
      // eslint-disable-next-line no-console
      console.debug("[SurveyPage] redirecting non-requester", {
        currentUserId: user.id,
        requesterId: ticket.requester_id,
        ticketId: id,
        isRequester,
        path: `/tickets/${id}/survey`,
      });
      if (id) {
        navigate(`/tickets/${id}`, { replace: true });
      } else {
        navigate(-1);
      }
    }
  }, [isLoading, ticket, isRequester, isSelfHandled, user, id, navigate]);

  const handleSubmit = async () => {
    if (!user || !id || rating === 0) return;
    setSubmitting(true);
    const { error } = await supabase.from("ticket_survey").insert({
      ticket_id: id,
      requester_id: user.id,
      rating,
      comment: comment || null,
    });
    if (error) {
      if (error.code === "23505") toast.error("Survey already submitted for this ticket.");
      else toast.error(error.message);
    } else {
      toast.success("Thank you for your feedback!");
      navigate(`/tickets/${id}`);
    }
    setSubmitting(false);
  };

  const handleSkip = () => {
    toast.success("Feedback skipped. Thank you!");
    navigate(`/tickets/${id}`);
  };

  if (isLoading) {
    return <p className="text-center py-12 text-muted-foreground">Loading...</p>;
  }

  if (!ticket || !isRequester) {
    // Non-requesters are redirected via the effect above; render loader meanwhile
    return <p className="text-center py-12 text-muted-foreground">Redirecting...</p>;
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>How was your experience?</CardTitle>
          <p className="text-sm text-muted-foreground">Rate the support you received</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                onMouseEnter={() => setHoverRating(i)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(i)}
                className="transition-transform hover:scale-110"
              >
                <Star className={cn(
                  "h-8 w-8 transition-colors",
                  (hoverRating || rating) >= i ? "fill-warning text-warning" : "text-muted-foreground/30"
                )} />
              </button>
            ))}
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Any additional comments? (optional)" rows={3} />
          <Button onClick={handleSubmit} disabled={submitting || rating === 0} className="w-full">
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
          <Button variant="ghost" onClick={handleSkip} className="w-full text-muted-foreground">
            Skip rating
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
