import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ChevronDown, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import mysigridLogo from "@/assets/mysigrid-logo-white.jpeg";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

interface Product {
  id: string;
  code: string;
  name: string;
  url: string;
  icon: string;
  is_active: boolean;
  is_future: boolean;
  display_order: number;
}

const CURRENT_PRODUCT_CODE = "support_hub";

const EXTERNAL_URLS: Record<string, string> = {
  performance_hub: "https://performance.mysigrid.com",
};

export default function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [accessibleIds, setAccessibleIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const [productsRes, accessRes] = await Promise.all([
        supabase.from("products").select("*").order("display_order"),
        supabase.from("user_product_access").select("product_id").eq("user_id", user.id),
      ]);

      if (productsRes.data) setProducts(productsRes.data as Product[]);
      if (accessRes.data) {
        setAccessibleIds(new Set(accessRes.data.map((a) => a.product_id)));
      }
    };

    fetchData();
  }, [user]);

  const currentProduct = products.find((p) => p.code === CURRENT_PRODUCT_CODE);
  const currentName = currentProduct?.name || "Support Hub";

  if (collapsed) {
    return (
      <div className="flex items-center justify-center p-4 mb-5">
        <img src={mysigridLogo} alt="MySigrid" className="h-8 w-8 rounded-md object-contain" />
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-3 p-4 mb-3 w-full text-left hover:bg-sidebar-accent/50 rounded-lg transition-colors duration-150 focus:outline-none">
          <img src={mysigridLogo} alt="MySigrid" className="h-8 w-8 rounded-md object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground leading-none">
              MySigrid
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-sm font-semibold text-sidebar-accent-foreground truncate">
                {currentName}
              </span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-sidebar-foreground shrink-0 transition-transform", open && "rotate-180")} />
            </div>
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-[272px] p-0 rounded-xl border shadow-xl overflow-hidden"
        style={{
          backgroundColor: "white",
          borderColor: "hsl(220 13% 91%)",
          color: "hsl(222 47% 11%)",
        }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-2.5">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.08em] leading-none"
            style={{ color: "hsl(215 16% 47%)" }}
          >
            Switch Workspace
          </p>
        </div>

        <div className="h-px mx-3" style={{ backgroundColor: "hsl(220 13% 91%)" }} />

        {/* Workspace list */}
        <div className="p-2">
          {products.map((product) => {
            const isCurrent = product.code === CURRENT_PRODUCT_CODE;
            const hasAccess = accessibleIds.size === 0 || accessibleIds.has(product.id);
            const isDisabled = product.is_future || (!hasAccess && !isCurrent);
            const externalUrl = EXTERNAL_URLS[product.code] || product.url;
            const isExternal = !isCurrent && !product.is_future && externalUrl;

            // External link — render as <a> with target="_blank"
            if (isExternal && !isDisabled) {
              return (
                <a
                  key={product.id}
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left no-underline transition-colors duration-100"
                  style={{ color: "hsl(222 47% 11%)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "hsl(220 14% 96%)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-base shrink-0 leading-none">{product.icon}</span>
                  <span className="flex-1 text-[13px] font-medium truncate">{product.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" style={{ color: "hsl(215 16% 57%)" }} />
                </a>
              );
            }

            // Disabled (future) item
            if (isDisabled) {
              return (
                <div
                  key={product.id}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 cursor-not-allowed"
                  style={{ opacity: 0.5, color: "hsl(222 47% 11%)" }}
                >
                  <span className="text-base shrink-0 leading-none">{product.icon}</span>
                  <span className="flex-1 text-[13px] font-medium truncate">{product.name}</span>
                  {product.is_future && (
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "hsl(220 14% 93%)",
                        color: "hsl(215 16% 47%)",
                      }}
                    >
                      Soon
                    </span>
                  )}
                </div>
              );
            }

            // Current workspace
            return (
              <button
                key={product.id}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-100 cursor-default"
                style={{
                  backgroundColor: "hsl(220 14% 96%)",
                  color: "hsl(222 47% 11%)",
                }}
              >
                <span className="text-base shrink-0 leading-none">{product.icon}</span>
                <span className="flex-1 text-[13px] font-semibold truncate">{product.name}</span>
                <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(217 91% 60%)" }} />
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
