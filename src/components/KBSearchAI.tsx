import { useState } from "react";
import { Search, Sparkles, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function KBSearchAI() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;

    setLoading(true);
    setAnswer(null);

    try {
      const { data, error } = await supabase.functions.invoke("kb-ask", {
        body: { question: q },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setAnswer(data.answer);
    } catch (err: any) {
      toast.error("Failed to get answer", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) handleAsk();
  };

  const handleClear = () => {
    setQuestion("");
    setAnswer(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about company updates..."
            className="pl-9 pr-8"
            disabled={loading}
          />
          {(question || answer) && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button onClick={handleAsk} disabled={loading || !question.trim()} size="sm" className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Ask AI
        </Button>
      </div>

      {answer && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                {answer}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
