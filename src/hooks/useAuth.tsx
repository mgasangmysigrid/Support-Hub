import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAuthStateValid, clearAuthState } from "@/lib/session-auth";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  isSuperAdmin: boolean;
  isManager: boolean;
  isPcMember: boolean;
  canManageKB: boolean;
  loading: boolean;
  managedDepartments: string[];
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  roles: [],
  isSuperAdmin: false,
  isManager: false,
  isPcMember: false,
  canManageKB: false,
  loading: true,
  managedDepartments: [],
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [managedDepartments, setManagedDepartments] = useState<string[]>([]);
  const [isPcMember, setIsPcMember] = useState(false);
  const [canManageKB, setCanManageKB] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (userId: string) => {
    const [profileRes, rolesRes, deptRes, superAdminRes, managerRes, kbRes, pcRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("department_members").select("department_id").eq("user_id", userId).eq("is_manager", true),
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_any_dept_manager", { _user_id: userId }),
      supabase.rpc("can_manage_kb", { _user_id: userId }),
      supabase.rpc("is_pc_member", { _user_id: userId }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if (rolesRes.error) throw rolesRes.error;
    if (deptRes.error) throw deptRes.error;
    if (superAdminRes.error) throw superAdminRes.error;
    if (managerRes.error) throw managerRes.error;

    const fetchedRoles = (rolesRes.data ?? []).map((r) => r.role);
    if (superAdminRes.data && !fetchedRoles.includes("super_admin")) fetchedRoles.push("super_admin");
    if (managerRes.data && !fetchedRoles.includes("manager")) fetchedRoles.push("manager");

    setProfile(profileRes.data ?? null);
    setRoles(fetchedRoles);
    setManagedDepartments((deptRes.data ?? []).map((d) => d.department_id));
    setCanManageKB(!!kbRes.data);
    setIsPcMember(!!pcRes.data);
  }, []);

  useEffect(() => {
    let mounted = true;

    const resetUserData = () => {
      setProfile(null);
      setRoles([]);
      setManagedDepartments([]);
      setCanManageKB(false);
    };

    const syncFromSession = async (nextUser: User | null) => {
      if (!mounted) return;

      setUser(nextUser);

      if (!nextUser) {
        resetUserData();
        setLoading(false);
        return;
      }

      // Validate browser-session marker
      if (!isAuthStateValid()) {
        clearAuthState();
        await supabase.auth.signOut();
        resetUserData();
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        await fetchUserData(nextUser.id);
      } catch (error) {
        console.error("Error fetching user data:", error);

        try {
          await fetchUserData(nextUser.id);
        } catch (retryError) {
          console.error("Retry fetching user data failed:", retryError);
          resetUserData();
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session?.user ?? null);
    });

    const initializeAuth = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Error loading session:", error);
        if (mounted) setLoading(false);
        return;
      }

      // If session exists but browser-session marker is missing,
      // enforceSessionOnlyAuth() in main.tsx already cleared the token.
      // Belt-and-suspenders: sign out if it somehow still appears.
      if (data.session && !isAuthStateValid()) {
        await supabase.auth.signOut();
        if (mounted) setLoading(false);
        return;
      }

      await syncFromSession(data.session?.user ?? null);
    };

    void initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const signOut = async () => {
    clearAuthState();
    await supabase.auth.signOut();
  };

  const isSuperAdmin = roles.includes("super_admin");
  const isManager = roles.includes("manager") || managedDepartments.length > 0;

  return (
    <AuthContext.Provider value={{ user, profile, roles, isSuperAdmin, isManager, isPcMember, canManageKB, loading, managedDepartments, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

