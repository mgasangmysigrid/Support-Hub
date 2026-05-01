
-- Products table
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  url text NOT NULL,
  icon text NOT NULL DEFAULT '🏠',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_future boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read products"
  ON public.products FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admin can manage products"
  ON public.products FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- User product access table
CREATE TABLE public.user_product_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

ALTER TABLE public.user_product_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own product access"
  ON public.user_product_access FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Super admin can manage product access"
  ON public.user_product_access FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Seed the three products
INSERT INTO public.products (code, name, url, icon, display_order, is_active, is_future) VALUES
  ('support_hub', 'Support Hub', 'https://my-sigrid-support-hub.lovable.app', '🎧', 1, true, false),
  ('performance_hub', 'Performance Hub', 'https://my-sigrid-performance-hub.lovable.app', '📊', 2, true, false),
  ('academy_hub', 'Academy Hub', 'https://my-sigrid-academy-hub.lovable.app', '🎓', 3, false, true);
