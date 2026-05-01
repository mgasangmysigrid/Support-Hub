import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay } from "date-fns";
import { useMemo } from "react";

export interface AdoptionFilters {
  dateFrom: Date;
  dateTo: Date;
  app: string;
  deptId: string;
}

function rpcParams(filters: AdoptionFilters) {
  return {
    _app: filters.app,
    _dept_id: filters.deptId === "all" ? null : filters.deptId,
  };
}

export function useAdoptionKPIs(filters: AdoptionFilters) {
  return useQuery({
    queryKey: ["adoption-kpis", filters.app, filters.deptId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_adoption_kpis", rpcParams(filters)) as any;
      if (error) throw error;
      return data as {
        activeToday: number;
        active7d: number;
        active30d: number;
        neverLoggedIn: number;
        dormant: number;
        totalUsers: number;
      };
    },
    staleTime: 30_000,
  });
}

// useLoginTrend removed — Daily Active Users chart replaced with Currently Active panel

export function useModuleUsage(filters: AdoptionFilters) {
  const from = useMemo(() => startOfDay(filters.dateFrom).toISOString(), [filters.dateFrom]);
  const to = useMemo(() => new Date(filters.dateTo.getTime() + 86400000 - 1).toISOString(), [filters.dateTo]);

  return useQuery({
    queryKey: ["adoption-module-usage", from, to, filters.app, filters.deptId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_module_usage", {
        _from: from,
        _to: to,
        ...rpcParams(filters),
      }) as any;
      if (error) throw error;
      return (data || []) as Array<{ module: string; uniqueUsers: number }>;
    },
    staleTime: 60_000,
  });
}

export interface UserAdoptionRow {
  userId: string;
  name: string;
  department: string;
  lastLogin: string | null;
  lastActive: string | null;
  totalSessions: number;
  totalActions: number;
  modulesUsed: number;
  totalActiveSeconds: number;
  engagementScore: number;
  status: string;
}

export function useUserAdoptionTable(filters: AdoptionFilters) {
  return useQuery({
    queryKey: ["adoption-user-table", filters.app, filters.deptId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_adoption_table", rpcParams(filters)) as any;
      if (error) throw error;
      return (data || []) as UserAdoptionRow[];
    },
    staleTime: 30_000,
  });
}

export function useAdoptionAlerts() {
  return useQuery({
    queryKey: ["adoption-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_adoption_alerts") as any;
      if (error) throw error;
      return (data || []) as Array<{ type: string; severity: string; message: string; count?: number }>;
    },
    staleTime: 60_000,
  });
}
