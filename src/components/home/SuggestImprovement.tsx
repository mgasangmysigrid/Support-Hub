import { useNavigate } from "react-router-dom";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SuggestImprovement() {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <div className="flex items-center justify-center gap-2 mb-3">
        <MessageSquarePlus className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Suggest an Improvement
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Have an idea to improve MySigrid, our tools, or our processes?
      </p>
      <Button
        onClick={() =>
          navigate("/tickets/create", {
            state: { prefill: { department: "Management", category: "Improvement Suggestion" } },
          })
        }
      >
        Share Your Idea
      </Button>
    </div>
  );
}
