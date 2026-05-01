import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  useHelpArticles,
  useHelpArticle,
  useSaveHelpArticle,
  useDeleteHelpArticle,
  useArticleFeedback,
  HELP_CATEGORIES,
  ARTICLE_TYPES,
  categoryLabel,
  categoryIcon,
  HelpArticle,
} from "@/hooks/useHelpArticles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Search, Sparkles, Loader2, X, ChevronLeft, Plus, Pencil, Trash2,
  BookOpen, ThumbsUp, ThumbsDown, Clock, Star, Shield, Tag, Eye,
  FileText, Rocket, Users, Briefcase, HelpCircle, Wrench, Megaphone,
  TicketIcon, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ─── Quick access cards config ─── */
const QUICK_ACCESS = [
  { label: "How to Set Up Users", category: "users-access", icon: Users },
  { label: "How to File Leave", category: "leave-pto", icon: Briefcase },
  { label: "Leave Policy", category: "company-policies", icon: Shield },
  { label: "How to Sign Documents", category: "documents", icon: FileText },
  { label: "How to Create a Ticket", category: "tickets-support", icon: TicketIcon },
  { label: "What's New", category: "whats-new", icon: Megaphone },
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "getting-started": Rocket,
  "users-access": Users,
  "leave-pto": Briefcase,
  "documents": FileText,
  "tickets-support": TicketIcon,
  "employee-portal": Building2,
  "company-policies": Shield,
  "whats-new": Megaphone,
  "faqs": HelpCircle,
  "troubleshooting": Wrench,
};

/* ─── Main Component ─── */
export default function HelpCenter() {
  const { user, isSuperAdmin, isManager, canManageKB } = useAuth();
  const isAdmin = isSuperAdmin || canManageKB;

  const [search, setSearch] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [editArticle, setEditArticle] = useState<Partial<HelpArticle> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "list" | "detail" | "editor">("home");

  const { data: articles = [], isLoading } = useHelpArticles({
    category: selectedCategory || undefined,
    search: search || undefined,
  });
  const { data: detailArticle } = useHelpArticle(selectedArticleId);
  const saveArticle = useSaveHelpArticle();
  const deleteArticle = useDeleteHelpArticle();
  const { feedback, submitFeedback } = useArticleFeedback(selectedArticleId);

  const publishedArticles = useMemo(
    () => articles.filter((a) => a.status === "published"),
    [articles]
  );
  const displayArticles = isAdmin ? articles : publishedArticles;

  const featuredArticles = useMemo(
    () => publishedArticles.filter((a) => a.is_featured).slice(0, 6),
    [publishedArticles]
  );
  const recentArticles = useMemo(
    () => [...publishedArticles].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
    [publishedArticles]
  );
  const popularArticles = useMemo(
    () => [...publishedArticles].sort((a, b) => b.view_count - a.view_count).slice(0, 5),
    [publishedArticles]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of publishedArticles) {
      counts[a.category] = (counts[a.category] || 0) + 1;
    }
    return counts;
  }, [publishedArticles]);

  /* ─── AI Ask ─── */
  const handleAiAsk = async () => {
    const q = aiQuestion.trim();
    if (!q) return;
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const { data, error } = await supabase.functions.invoke("help-center-ask", {
        body: { question: q },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setAiAnswer(data.answer);
    } catch (err: any) {
      toast.error("Failed to get answer", { description: err.message });
    } finally {
      setAiLoading(false);
    }
  };

  /* ─── Navigation helpers ─── */
  const openCategory = (cat: string) => {
    setSelectedCategory(cat);
    setSearch("");
    setView("list");
  };
  const openArticle = (id: string) => {
    setSelectedArticleId(id);
    setView("detail");
  };
  const goHome = () => {
    setView("home");
    setSelectedCategory(null);
    setSelectedArticleId(null);
    setSearch("");
  };
  const goList = () => {
    setView("list");
    setSelectedArticleId(null);
  };
  const openEditor = (article?: HelpArticle) => {
    setEditArticle(
      article
        ? { ...article }
        : {
            title: "",
            category: "getting-started",
            summary: "",
            content: "",
            tags: [],
            status: "draft",
            is_featured: false,
            is_policy: false,
            article_type: "guide",
            affected_module: "",
          }
    );
    setView("editor");
  };

  const handleSave = () => {
    if (!editArticle?.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    saveArticle.mutate(editArticle as any, {
      onSuccess: () => {
        setEditArticle(null);
        setView(selectedCategory ? "list" : "home");
      },
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteArticle.mutate(deleteId, {
      onSuccess: () => {
        setDeleteId(null);
        if (view === "detail") goList();
      },
    });
  };

  /* ─── VIEWS ─── */

  // HOME
  if (view === "home") {
    return (
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Help Center</h1>
          <p className="text-muted-foreground">Find guides, policies, and answers for Support Hub</p>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  setSelectedCategory(null);
                  setView("list");
                }
              }}
              placeholder="Search help articles, policies, and guides…"
              className="pl-9"
            />
          </div>

          {/* AI Q&A */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !aiLoading) handleAiAsk();
                }}
                placeholder="Ask the Help Center AI"
                className="pl-9"
                disabled={aiLoading}
              />
            </div>
            <Button onClick={handleAiAsk} disabled={aiLoading || !aiQuestion.trim()} size="sm" className="gap-1.5">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Ask AI
            </Button>
          </div>

          {aiAnswer && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="text-sm prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap flex-1">
                    {aiAnswer}
                  </div>
                  <button onClick={() => { setAiAnswer(null); setAiQuestion(""); }} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quick Access */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Quick Access</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {QUICK_ACCESS.map((qa) => {
              const Icon = qa.icon;
              return (
                <Card
                  key={qa.label}
                  className="cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all"
                  onClick={() => openCategory(qa.category)}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <Icon className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm font-medium">{qa.label}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Category Grid */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Browse by Category</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {HELP_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.value] || BookOpen;
              const count = categoryCounts[cat.value] || 0;
              return (
                <Card
                  key={cat.value}
                  className="cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all"
                  onClick={() => openCategory(cat.value)}
                >
                  <CardContent className="flex flex-col items-center text-center gap-2 p-4">
                    <Icon className="h-6 w-6 text-primary" />
                    <span className="text-sm font-medium">{cat.label}</span>
                    <span className="text-xs text-muted-foreground">{count} article{count !== 1 ? "s" : ""}</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Featured / Recent / Popular */}
        <div className="grid md:grid-cols-2 gap-6">
          {recentArticles.length > 0 && (
            <div>
              <h3 className="text-md font-semibold mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Recently Updated
              </h3>
              <div className="space-y-1">
                {recentArticles.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => openArticle(a.id)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/50 transition-colors text-sm flex items-center gap-2"
                  >
                    <span className="flex-1 truncate">{a.title}</span>
                    {a.is_policy && <Shield className="h-3 w-3 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {popularArticles.length > 0 && (
            <div>
              <h3 className="text-md font-semibold mb-2 flex items-center gap-2">
                <Star className="h-4 w-4 text-muted-foreground" /> Most Viewed
              </h3>
              <div className="space-y-1">
                {popularArticles.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => openArticle(a.id)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/50 transition-colors text-sm flex items-center gap-2"
                  >
                    <span className="flex-1 truncate">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{a.view_count} views</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Admin create button */}
        {isAdmin && (
          <div className="flex justify-end">
            <Button onClick={() => openEditor()} className="gap-2">
              <Plus className="h-4 w-4" /> New Article
            </Button>
          </div>
        )}
      </div>
    );
  }

  // LIST VIEW
  if (view === "list") {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={goHome}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Help Center
          </Button>
          {selectedCategory && (
            <span className="text-sm font-medium text-muted-foreground">
              / {categoryLabel(selectedCategory)}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <h2 className="text-xl font-semibold flex-1">
            {selectedCategory ? categoryLabel(selectedCategory) : "Search Results"}
          </h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter articles…"
                className="pl-9"
              />
            </div>
            {!selectedCategory && (
              <Select value={selectedCategory || "all"} onValueChange={(v) => setSelectedCategory(v === "all" ? null : v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {HELP_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isAdmin && (
              <Button size="sm" onClick={() => openEditor()} className="gap-1.5">
                <Plus className="h-4 w-4" /> New
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : displayArticles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No articles found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayArticles.map((a) => (
              <Card
                key={a.id}
                className="cursor-pointer hover:border-primary/20 hover:shadow-sm transition-all"
                onClick={() => openArticle(a.id)}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{a.title}</span>
                      {a.is_policy && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Shield className="h-3 w-3" /> Policy
                        </Badge>
                      )}
                      {a.is_featured && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Star className="h-3 w-3" /> Featured
                        </Badge>
                      )}
                      {a.status !== "published" && isAdmin && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                          {a.status}
                        </Badge>
                      )}
                    </div>
                    {a.summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{categoryLabel(a.category)}</span>
                      <span>Updated {format(new Date(a.updated_at), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditor(a);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // DETAIL VIEW
  if (view === "detail" && detailArticle) {
    const relatedArticles = publishedArticles
      .filter((a) => a.category === detailArticle.category && a.id !== detailArticle.id)
      .slice(0, 5);

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={selectedCategory ? goList : goHome}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>

        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{categoryLabel(detailArticle.category)}</Badge>
                {detailArticle.is_policy && (
                  <Badge className="text-xs gap-1 bg-primary/10 text-primary border-primary/20">
                    <Shield className="h-3 w-3" /> Official Policy
                  </Badge>
                )}
                {detailArticle.article_type === "release_note" && detailArticle.affected_module && (
                  <Badge variant="secondary" className="text-xs">
                    Module: {detailArticle.affected_module}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold">{detailArticle.title}</h1>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Updated {format(new Date(detailArticle.updated_at), "MMMM d, yyyy")}
                </span>
                {detailArticle.view_count > 0 && (
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" /> {detailArticle.view_count} views
                  </span>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-1 shrink-0">
                <Button variant="outline" size="sm" onClick={() => openEditor(detailArticle)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {isSuperAdmin && (
                  <Button variant="outline" size="sm" onClick={() => setDeleteId(detailArticle.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <Card>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert pt-6 whitespace-pre-wrap">
            {detailArticle.content || detailArticle.summary || "No content yet."}
          </CardContent>
        </Card>

        {/* Tags */}
        {detailArticle.tags && detailArticle.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {detailArticle.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
          </div>
        )}

        {/* Feedback */}
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <span className="text-sm font-medium">Was this helpful?</span>
            <div className="flex gap-2">
              <Button
                variant={feedback?.is_helpful === true ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => submitFeedback.mutate(true)}
              >
                <ThumbsUp className="h-4 w-4" /> Yes
              </Button>
              <Button
                variant={feedback?.is_helpful === false ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => submitFeedback.mutate(false)}
              >
                <ThumbsDown className="h-4 w-4" /> No
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Related articles */}
        {relatedArticles.length > 0 && (
          <div>
            <h3 className="text-md font-semibold mb-2">Related Articles</h3>
            <div className="space-y-1">
              {relatedArticles.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openArticle(a.id)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/50 transition-colors text-sm"
                >
                  {a.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <DeleteConfirmDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={handleDelete}
        />
      </div>
    );
  }

  // EDITOR VIEW
  if (view === "editor" && editArticle) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditArticle(null); setView(selectedArticleId ? "detail" : selectedCategory ? "list" : "home"); }}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <h2 className="text-xl font-semibold">{editArticle.id ? "Edit Article" : "New Article"}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={editArticle.title || ""} onChange={(e) => setEditArticle({ ...editArticle, title: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={editArticle.category || "getting-started"} onValueChange={(v) => setEditArticle({ ...editArticle, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HELP_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Article Type</Label>
              <Select value={editArticle.article_type || "guide"} onValueChange={(v) => setEditArticle({ ...editArticle, article_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ARTICLE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={editArticle.status || "draft"} onValueChange={(v) => setEditArticle({ ...editArticle, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Affected Module (for release notes)</Label>
              <Input
                value={editArticle.affected_module || ""}
                onChange={(e) => setEditArticle({ ...editArticle, affected_module: e.target.value })}
                placeholder="e.g. Leave, Tickets"
              />
            </div>
          </div>

          <div>
            <Label>Summary</Label>
            <Textarea
              value={editArticle.summary || ""}
              onChange={(e) => setEditArticle({ ...editArticle, summary: e.target.value })}
              placeholder="Short description for search results…"
              rows={2}
            />
          </div>

          <div>
            <Label>Content</Label>
            <Textarea
              value={editArticle.content || ""}
              onChange={(e) => setEditArticle({ ...editArticle, content: e.target.value })}
              placeholder="Full article content (supports plain text)…"
              rows={15}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label>Tags (comma-separated)</Label>
            <Input
              value={(editArticle.tags || []).join(", ")}
              onChange={(e) =>
                setEditArticle({
                  ...editArticle,
                  tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                })
              }
              placeholder="e.g. leave, policy, how-to"
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={editArticle.is_featured || false}
                onCheckedChange={(v) => setEditArticle({ ...editArticle, is_featured: v })}
              />
              <Label>Featured</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editArticle.is_policy || false}
                onCheckedChange={(v) => setEditArticle({ ...editArticle, is_policy: v })}
              />
              <Label>Official Policy</Label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setEditArticle(null); setView(selectedArticleId ? "detail" : selectedCategory ? "list" : "home"); }}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saveArticle.isPending}>
            {saveArticle.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {editArticle.id ? "Update" : "Create"} Article
          </Button>
        </div>
      </div>
    );
  }

  // Fallback loading
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
    </div>
  );
}

/* ─── Delete Confirmation ─── */
function DeleteConfirmDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete article?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
