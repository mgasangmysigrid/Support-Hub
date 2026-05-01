import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Plus, ListTodo, Building2,
  Settings, LogOut, ChevronLeft, Menu,
  CalendarDays, Briefcase, ClipboardCheck, FileText, User, Home,
  Files, Users, BarChart3, Eye, FilePlus2, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import WorkspaceSwitcher from "@/components/sidebar/WorkspaceSwitcher";
import { useNotificationPush } from "@/hooks/useNotificationPush";
import { useActivityTracker } from "@/hooks/use-activity-tracker";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { useKBUnreadCount } from "@/hooks/useKBUnreadCount";
import { usePendingAckCount } from "@/hooks/useDocAcknowledgments";
import { useTicketUnreadCounts } from "@/hooks/useTicketUnreadCounts";
import SidebarSearch from "@/components/sidebar/SidebarSearch";
import { useSidebarBadges } from "@/hooks/useSidebarBadges";
import { useEndorsementBadge } from "@/hooks/useEndorsements";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export default function AppLayout() {
  const { user, profile, isSuperAdmin, isManager, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useNotificationPush();
  useActivityTracker();
  const kbUnreadCount = useKBUnreadCount();
  const pendingAckCount = usePendingAckCount();
  const kbBadgeCount = Math.max(kbUnreadCount, pendingAckCount);
  const { combinedTotal: ticketUnreadTotal } = useTicketUnreadCounts();
  const { deptQueueCount, approvalsCount, leaveUnreadCount, profileIncomplete, documentsActionCount, homeBadgeCount, showLeaveOverview } = useSidebarBadges();
  const { data: endorsementBadge = 0 } = useEndorsementBadge();

  const showAdmin = isSuperAdmin || isManager;

  const displayName =
    profile?.full_name?.trim() ||
    (typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") ||
    user?.email?.split("@")[0] ||
    "User";

  const displayEmail = profile?.email || user?.email || "";

  const NavItem = ({
    to,
    icon: Icon,
    label,
    badge,
    onClick,
  }: {
    to?: string;
    icon: React.ElementType;
    label: string;
    badge?: number;
    onClick?: () => void;
  }) => {
    const isActive = to ? location.pathname === to : false;

    const content = (
      <div
        className={cn(
          "group relative flex items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] transition-all duration-150 ease-in-out cursor-pointer",
          isActive
            ? "bg-sidebar-primary/10 text-sidebar-primary-foreground font-semibold"
            : "text-sidebar-accent-foreground/70 font-medium hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground"
        )}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3.5 rounded-r-full bg-sidebar-primary" />
        )}
        <Icon className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-150",
          isActive
            ? "text-sidebar-primary"
            : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground"
        )} strokeWidth={1.75} />
        {!collapsed && <span className="truncate">{label}</span>}
        {badge != null && badge > 0 && (
          <span className="ml-auto flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive/90 px-1 text-[9px] font-bold text-white leading-none">
            {badge}
          </span>
        )}
      </div>
    );

    const wrapped = collapsed ? (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {label}
          {badge != null && badge > 0 && ` (${badge})`}
        </TooltipContent>
      </Tooltip>
    ) : (
      content
    );

    if (onClick) {
      return (
        <div onClick={() => { onClick(); setMobileOpen(false); }}>
          {wrapped}
        </div>
      );
    }

    return (
      <Link to={to!} onClick={() => setMobileOpen(false)}>
        {wrapped}
      </Link>
    );
  };

  const SectionHeader = ({ label }: { label: string }) => {
    if (collapsed) return <div className="border-t border-sidebar-border/30 my-2 mx-3" />;
    return (
      <div className="mt-3.5 mb-0.5 px-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-sidebar-foreground/50">
          {label}
        </span>
      </div>
    );
  };

  const SectionGroup = ({ children }: { children: React.ReactNode }) => (
    <div className="space-y-px mx-1 rounded-md bg-sidebar-accent/15 px-1 py-0.5">
      {children}
    </div>
  );

  const SidebarInner = () => (
    <div className="flex h-full flex-col">
      {/* Workspace Switcher */}
      <WorkspaceSwitcher collapsed={collapsed} />

      {/* Search */}
      <SidebarSearch collapsed={collapsed} />

      {/* Navigation */}
      <nav className="flex-1 px-2 pb-3 overflow-y-auto">
        {/* HOME */}
        <SectionHeader label="Home" />
        <SectionGroup>
          <NavItem to="/" icon={Home} label="Home" badge={homeBadgeCount} />
        </SectionGroup>

        {/* EMPLOYEE PORTAL */}
        <SectionHeader label="Employee Portal" />
        <SectionGroup>
          <NavItem to="/profile" icon={User} label="My Profile" badge={profileIncomplete} />
          <NavItem to="/directory" icon={Users} label="Employee Directory" />
          <NavItem to="/documents" icon={FileText} label="My Documents" badge={documentsActionCount} />
          <NavItem to="/knowledge-base" icon={Files} label="Company Documents" badge={kbBadgeCount} />
          {/* Help Center hidden for now */}
        </SectionGroup>

        {/* SUPPORT */}
        <SectionHeader label="Support" />
        <SectionGroup>
          <NavItem to="/tickets/create" icon={Plus} label="Create Ticket" />
          <NavItem to="/tickets" icon={ListTodo} label="My Tickets" badge={ticketUnreadTotal} />
          {(isManager || isSuperAdmin) && (
            <NavItem to="/department" icon={Building2} label="Department Queue" badge={deptQueueCount} />
          )}
          <NavItem to="/tickets/analytics" icon={BarChart3} label="Analytics" />
        </SectionGroup>

        {/* LEAVE & PTO */}
        <SectionHeader label="Leave & PTO" />
        <SectionGroup>
          <NavItem to="/leave/my-leave" icon={FilePlus2} label="File a Leave" badge={leaveUnreadCount} />
          <NavItem to="/leave/endorsements" icon={Briefcase} label="Endorsements" badge={endorsementBadge} />
          {(isManager || isSuperAdmin) && (
            <NavItem to="/leave/approvals" icon={ClipboardCheck} label="Approvals" badge={approvalsCount} />
          )}
          <NavItem to="/leave/calendar" icon={CalendarDays} label="Leave Calendar" />
          {showLeaveOverview && (
            <NavItem to="/leave/overview" icon={Eye} label="Leave Overview" />
          )}
        </SectionGroup>
      </nav>

      {/* Footer */}
      <div className="mt-auto border-t border-sidebar-border/30 px-3 py-2 space-y-px">
        <div className={cn("flex items-center gap-2 px-2.5 py-1", collapsed && "justify-center")}>
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-primary/80 text-white text-[10px] font-bold shrink-0">
            {displayName.charAt(0).toUpperCase() || "U"}
          </div>
          {!collapsed && (
            <div className="flex-1 truncate">
              <p className="text-[12px] font-medium text-sidebar-accent-foreground/80 truncate">{displayName}</p>
              <p className="text-[10px] text-sidebar-foreground/40 truncate">{displayEmail}</p>
            </div>
          )}
        </div>

        {showAdmin && <NavItem to="/admin" icon={Settings} label="Admin" />}
        <ChangePasswordDialog collapsed={collapsed} />

        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="flex w-full items-center justify-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] text-sidebar-accent-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground transition-all duration-150"
              >
                <LogOut className="h-[15px] w-[15px] shrink-0 text-sidebar-foreground/70" strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Sign Out</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[13px] font-medium text-sidebar-accent-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground transition-all duration-150"
          >
            <LogOut className="h-[15px] w-[15px] shrink-0 text-sidebar-foreground/70" strokeWidth={1.75} />
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      {/* Mobile sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transition-transform lg:hidden",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarInner />
      </aside>
      {/* Desktop sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col bg-sidebar transition-all duration-200 relative",
        collapsed ? "w-16" : "w-60"
      )}>
        <SidebarInner />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-foreground shadow-sm"
        >
          <ChevronLeft className={cn("h-3 w-3 transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>
      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card/80 backdrop-blur-sm px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-sm">MySigrid Support Hub</span>
        </div>
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
