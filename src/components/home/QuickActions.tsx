import { Link } from "react-router-dom";
import { Plus, CalendarDays, ListTodo, User } from "lucide-react";

const actions = [
  { to: "/tickets/create", icon: Plus, label: "Create Ticket", color: "text-primary" },
  { to: "/leave/my-leave", icon: CalendarDays, label: "File Leave", color: "text-success" },
  { to: "/tickets", icon: ListTodo, label: "My Tickets", color: "text-warning" },
  { to: "/profile", icon: User, label: "My Profile", color: "text-muted-foreground" },
] as const;

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {actions.map((a) => (
        <Link
          key={a.to}
          to={a.to}
          className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 transition-colors hover:bg-accent hover:border-accent-foreground/10"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-background">
            <a.icon className={`h-6 w-6 ${a.color}`} />
          </div>
          <span className="text-sm font-medium text-foreground">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}
