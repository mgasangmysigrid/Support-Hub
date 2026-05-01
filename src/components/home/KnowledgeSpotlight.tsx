import { useMemo } from "react";
import { Lightbulb } from "lucide-react";

const TIPS = [
  "Tickets automatically save drafts when you click out of the page.",
  "You can attach files by pasting images directly into ticket comments.",
  "Use the search bar in the sidebar to quickly find tickets, users, or company updates.",
  "Half-day leave options (AM/PM) are available when filing leave requests.",
  "You can view the full SLA countdown timer on any open ticket.",
  "Department managers can reassign tickets to other team members.",
  "Birthday leave is automatically granted — check your leave balance!",
  "Company updates in the Knowledge Base show unread badges so you never miss important news.",
  "You can merge duplicate tickets to keep things organized.",
  "Leave requests require approval — you'll get a notification once your manager responds.",
  "Critical tickets trigger escalation alerts to ensure fast resolution.",
  "Your profile completion percentage helps HR ensure all records are up to date.",
  "You can filter tickets by status, priority, or department on the Ticket Summary page.",
  "Internal notes on tickets are only visible to assignees and managers — not the requester.",
  "PTO accruals are calculated automatically based on your schedule and start date.",
];

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

export default function KnowledgeSpotlight() {
  const tip = useMemo(() => TIPS[dayOfYear() % TIPS.length], []);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Knowledge Spotlight
        </h2>
      </div>
      <p className="text-xs font-semibold text-primary mb-1">Did you know?</p>
      <p className="text-sm text-foreground/80 leading-relaxed">{tip}</p>
    </div>
  );
}
