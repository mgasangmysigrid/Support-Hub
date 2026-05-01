import { useState, useEffect, useRef } from "react";
import { Search, X, FileText, Users, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SearchResult {
  type: "ticket" | "employee" | "update";
  id: string;
  title: string;
  subtitle?: string;
  link: string;
}

export default function SidebarSearch({ collapsed }: { collapsed: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setLoading(true);
      const q = query.trim();
      const items: SearchResult[] = [];

      // Search tickets by ticket_no or title
      const { data: tickets } = await supabase
        .from("tickets")
        .select("id, ticket_no, title, status")
        .or(`ticket_no.ilike.%${q}%,title.ilike.%${q}%`)
        .limit(5);

      if (tickets) {
        for (const t of tickets) {
          items.push({
            type: "ticket",
            id: t.id,
            title: `${t.ticket_no} – ${t.title}`,
            subtitle: t.status,
            link: `/tickets/${t.id}`,
          });
        }
      }

      // Search employees
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .eq("is_active", true)
        .limit(5);

      if (profiles) {
        for (const p of profiles) {
          items.push({
            type: "employee",
            id: p.id,
            title: p.full_name || p.email || "Unknown",
            subtitle: p.email || undefined,
            link: `/profile/${p.id}`,
          });
        }
      }

      // Search knowledge base
      const { data: kbDocs } = await supabase
        .from("knowledge_base")
        .select("id, title, category")
        .ilike("title", `%${q}%`)
        .limit(5);

      if (kbDocs) {
        for (const d of kbDocs) {
          items.push({
            type: "update",
            id: d.id,
            title: d.title,
            subtitle: d.category,
            link: "/knowledge-base",
          });
        }
      }

      setResults(items);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    if (result.link !== "#") {
      navigate(result.link);
    }
    setQuery("");
    setOpen(false);
    setResults([]);
  };

  if (collapsed) return null;

  const tickets = results.filter((r) => r.type === "ticket");
  const employees = results.filter((r) => r.type === "employee");
  const updates = results.filter((r) => r.type === "update");

  return (
    <div className="relative px-3 pt-3" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sidebar-foreground/50" />
        <Input
          placeholder="Search tickets, users, updates..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          className="h-8 pl-8 pr-8 text-xs bg-sidebar-accent border-transparent rounded-lg text-sidebar-accent-foreground placeholder:text-sidebar-foreground focus-visible:ring-sidebar-primary/50"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/50 hover:text-sidebar-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-md border border-sidebar-border bg-sidebar shadow-lg max-h-72 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-xs text-sidebar-foreground/60 text-center">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-xs text-sidebar-foreground/60 text-center">No results found</div>
          ) : (
            <div className="py-1">
              {tickets.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                    Tickets
                  </div>
                  {tickets.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleSelect(r)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
                      <span className="truncate">{r.title}</span>
                    </button>
                  ))}
                </>
              )}
              {employees.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                    Employees
                  </div>
                  {employees.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleSelect(r)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                    >
                      <Users className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
                      <span className="truncate">{r.title}</span>
                    </button>
                  ))}
                </>
              )}
              {updates.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                    Company Documents
                  </div>
                  {updates.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleSelect(r)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                    >
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
                      <span className="truncate">{r.title}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
