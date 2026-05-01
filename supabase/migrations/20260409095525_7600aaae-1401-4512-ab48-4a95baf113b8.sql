
CREATE TABLE public.help_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'getting-started',
  summary TEXT,
  content TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_policy BOOLEAN NOT NULL DEFAULT false,
  article_type TEXT NOT NULL DEFAULT 'guide',
  affected_module TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  helpful_yes_count INTEGER NOT NULL DEFAULT 0,
  helpful_no_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_help_articles_status ON public.help_articles(status);
CREATE INDEX idx_help_articles_category ON public.help_articles(category);
CREATE INDEX idx_help_articles_type ON public.help_articles(article_type);

ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published help articles"
ON public.help_articles FOR SELECT TO authenticated
USING (status = 'published');

CREATE POLICY "Admins can view all help articles"
ON public.help_articles FOR SELECT TO authenticated
USING (public.can_manage_documents(auth.uid()));

CREATE POLICY "Admins can create help articles"
ON public.help_articles FOR INSERT TO authenticated
WITH CHECK (public.can_manage_documents(auth.uid()));

CREATE POLICY "Admins can update help articles"
ON public.help_articles FOR UPDATE TO authenticated
USING (public.can_manage_documents(auth.uid()));

CREATE POLICY "Super admins can delete help articles"
ON public.help_articles FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE TABLE public.help_article_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.help_articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  is_helpful BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(article_id, user_id)
);

ALTER TABLE public.help_article_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
ON public.help_article_feedback FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert feedback"
ON public.help_article_feedback FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own feedback"
ON public.help_article_feedback FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER update_help_articles_updated_at
BEFORE UPDATE ON public.help_articles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_help_article_feedback_updated_at
BEFORE UPDATE ON public.help_article_feedback
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
