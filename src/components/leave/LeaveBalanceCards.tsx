import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock, TrendingDown, CalendarCheck, Cake } from "lucide-react";
import { usePTOBalance, useUpcomingLeaves, useUserProfile } from "@/hooks/useLeaveData";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatHoursToDays, getYearsOfService, getMonthlyAccrualHours } from "@/lib/leave-utils";
import { format, addMonths } from "date-fns";

export default function LeaveBalanceCards() {
  const { user } = useAuth();
  const { data: balance, isLoading } = usePTOBalance(user?.id);
  const { data: nextLeave } = useUpcomingLeaves(user?.id);
  const { data: profile } = useUserProfile(user?.id);

  const nextAccrualDate = (() => {
    if (!profile?.accrual_start_date && !profile?.start_date) return null;
    const baseDate = new Date(profile.accrual_start_date || profile.start_date);
    const now = new Date();
    const day = baseDate.getDate();
    let next = new Date(now.getFullYear(), now.getMonth(), day);
    if (next <= now) next = addMonths(next, 1);
    return next;
  })();

  const monthlyAccrual = profile?.start_date
    ? getMonthlyAccrualHours(getYearsOfService(profile.start_date))
    : 0;

  
  const { data: birthdayBalance } = useQuery({
    queryKey: ["birthday-leave-balance-card", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("pto_ledger")
        .select("remaining_hours, expires_at")
        .eq("user_id", user.id)
        .eq("entry_type", "adjustment")
        .gt("remaining_hours", 0)
        .ilike("notes", "%Birthday Leave%");
      if (!data || data.length === 0) return null;
      const total = data.reduce((sum: number, e) => {
        const val = Number(e.remaining_hours ?? 0);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      if (total <= 0) return null;
      const expiry = data[0]?.expires_at;
      return { hours: total, expires_at: expiry };
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      icon: CalendarDays,
      label: "Available PTO",
      value: formatHoursToDays(balance?.available || 0),
      sub: `${(balance?.available || 0).toFixed(1)}h`,
      color: "bg-teal-100 text-teal-700",
    },
    {
      icon: Cake,
      label: "Birthday Leave",
      value: birthdayBalance ? formatHoursToDays(birthdayBalance.hours) : "—",
      sub: birthdayBalance?.expires_at ? `Expires ${format(new Date(birthdayBalance.expires_at), "MMM d")}` : "Not yet credited",
      color: "bg-pink-100 text-pink-700",
    },
    {
      icon: Clock,
      label: "Next Accrual",
      value: nextAccrualDate ? format(nextAccrualDate, "MMM d") : "—",
      sub: monthlyAccrual > 0 ? `+${formatHoursToDays(monthlyAccrual)}` : "",
      color: "bg-blue-100 text-blue-700",
    },
    {
      icon: TrendingDown,
      label: "Used YTD",
      value: formatHoursToDays(balance?.usedYTD || 0),
      sub: `${(balance?.usedYTD || 0).toFixed(1)}h`,
      color: "bg-amber-100 text-amber-700",
    },
    {
      icon: CalendarCheck,
      label: "Next Approved Leave",
      value: nextLeave ? format(new Date(nextLeave.date_from), "MMM d") : "None",
      sub: nextLeave ? `${nextLeave.working_days_count}d` : "",
      color: "bg-emerald-100 text-emerald-700",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              {card.sub && <p className="text-[10px] text-muted-foreground">{card.sub}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
