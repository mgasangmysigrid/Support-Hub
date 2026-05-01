import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PartyPopper, Loader2, ChevronLeft, ChevronRight, Cake, Globe } from "lucide-react";
import { format, addDays, isToday, isTomorrow, startOfDay } from "date-fns";
import confetti from "canvas-confetti";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getHolidayAndImportantDatesForRange, REGION_SHORT, type HolidayRegion, type ImportantDateItem } from "@/lib/holiday-engine";
import useEmblaCarousel from "embla-carousel-react";

// --- helpers ---

// DST helpers removed — now computed by holiday-engine

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getRollingDateLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

// --- types ---

type CelebrationType = "birthday" | "work_anniversary" | "new_joiner" | "holiday" | "dst_reminder";

interface CelebrationItem {
  emoji: string;
  text: string;
  date: Date;
  dayLabel: string;
  type: CelebrationType;
  profilePhotoUrl?: string | null;
  fullName?: string | null;
  userId?: string;
  years?: number;
  region?: HolidayRegion;
  category?: string;
  isMajor?: boolean;
}

interface HolidayDetail {
  description: string;
  history: string;
  significance: string;
  faq: { question: string; answer: string }[];
}

const EMPLOYEE_COLORS: Record<string, string> = {
  birthday: "from-pink-500/10 to-rose-500/10 border-pink-200 dark:border-pink-800",
  work_anniversary: "from-amber-500/10 to-yellow-500/10 border-amber-200 dark:border-amber-800",
  new_joiner: "from-emerald-500/10 to-green-500/10 border-emerald-200 dark:border-emerald-800",
};

const HOLIDAY_COLORS = "from-blue-500/10 to-indigo-500/10 border-blue-200 dark:border-blue-800";
const DST_COLORS = "from-slate-500/10 to-gray-500/10 border-slate-200 dark:border-slate-800";

function getCategoryLabel(item: CelebrationItem): string {
  if (item.type === "dst_reminder") return "Time Change Reminder";
  if (item.category) return item.category;
  const name = item.text.toLowerCase();
  if (name.includes("international day") || name.includes("world day")) return "International Day";
  if (name.includes("observance") || name.includes("awareness")) return "Observance";
  return "Holiday";
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

// --- component ---

export default function TodayCelebrations() {
  const today = startOfDay(new Date());
  const rangeEnd = addDays(today, 6);
  const [detailItem, setDetailItem] = useState<CelebrationItem | null>(null);

  const rollingDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i);
    return {
      mmdd: format(d, "MM-dd"),
      month: d.getMonth() + 1,
      day: d.getDate(),
      date: d,
      label: getRollingDateLabel(d),
    };
  });

  const { data: celebrations = [] } = useQuery<CelebrationItem[]>({
    queryKey: ["home-celebrations-rolling", format(today, "yyyy-MM-dd")],
    queryFn: async () => {
      const [profilesRes, holidaysRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, date_of_birth, start_date, job_title, profile_photo_url")
          .eq("is_active", true),
        supabase
          .from("holidays")
          .select("name, month, day, emoji")
          .eq("is_active", true),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (holidaysRes.error) throw holidaysRes.error;

      const items: CelebrationItem[] = [];

      for (const p of profilesRes.data ?? []) {
        if (!p.full_name) continue;

        if (p.date_of_birth) {
          const dobMMDD = p.date_of_birth.slice(5);
          const match = rollingDays.find((d) => d.mmdd === dobMMDD);
          if (match) {
            items.push({
              emoji: "🎂",
              text: `${p.full_name} — Birthday`,
              date: match.date,
              dayLabel: match.label,
              type: "birthday",
              profilePhotoUrl: p.profile_photo_url,
              fullName: p.full_name,
              userId: p.id,
            });
          }
        }

        if (p.start_date) {
          const sdMMDD = p.start_date.slice(5);
          const match = rollingDays.find((d) => d.mmdd === sdMMDD);
          if (match) {
            // Compute years based on calendar year difference, not differenceInYears
            const startYear = parseInt(p.start_date.slice(0, 4), 10);
            const anniversaryYear = match.date.getFullYear();
            const years = anniversaryYear - startYear;

            if (years >= 1) {
              items.push({
                emoji: years >= 2 ? "🏆" : "🎉",
                text: `${p.full_name} — ${ordinal(years)} Work Anniversary`,
                date: match.date,
                dayLabel: match.label,
                type: "work_anniversary",
                profilePhotoUrl: p.profile_photo_url,
                fullName: p.full_name,
                userId: p.id,
                years,
              });
            } else if (years === 0) {
              items.push({
                emoji: "🌱",
                text: `Welcome ${p.full_name.split(" ")[0]} to the ${p.job_title || "team"}!`,
                date: match.date,
                dayLabel: match.label,
                type: "new_joiner",
                profilePhotoUrl: p.profile_photo_url,
                fullName: p.full_name,
                userId: p.id,
              });
            }
          }
        }
      }

      // --- Computed holidays always win over stale admin DB records ---
      const COMPUTED_HOLIDAY_NAMES = new Set([
        "palm sunday", "holy wednesday", "maundy thursday", "good friday",
        "black saturday", "easter sunday", "easter monday", "ascension day",
        "whit monday / pentecost monday", "martin luther king jr. day",
        "presidents' day", "memorial day", "labor day",
        "columbus day / indigenous peoples' day", "thanksgiving",
        "national heroes day",
      ]);
      const normalizeHolidayName = (name: string) =>
        name.toLowerCase().trim().replace(/\s+/g, " ");

      // Engine-computed holidays + DST reminders (source of truth)
      const startStr = format(today, "yyyy-MM-dd");
      const endStr = format(rangeEnd, "yyyy-MM-dd");
      const engineDates = getHolidayAndImportantDatesForRange(startStr, endStr);
      const engineNames = new Set<string>();

      for (const ed of engineDates) {
        engineNames.add(normalizeHolidayName(ed.title));
        const [, mm, dd] = ed.date.split("-").map(Number);
        const dayInfo = rollingDays.find((d) => d.month === mm && d.day === dd);
        if (!dayInfo) continue;
        items.push({
          emoji: ed.emoji,
          text: ed.title,
          date: dayInfo.date,
          dayLabel: dayInfo.label,
          type: ed.type === "dst_reminder" ? "dst_reminder" : "holiday",
          region: ed.region,
          category: ed.category,
          isMajor: ed.isMajor,
        });
      }

      // Admin DB holidays — only add if NOT engine-managed
      for (const h of holidaysRes.data ?? []) {
        const norm = normalizeHolidayName(h.name);
        if (COMPUTED_HOLIDAY_NAMES.has(norm) || engineNames.has(norm)) continue;
        const match = rollingDays.find((d) => d.month === h.month && d.day === h.day);
        if (match) {
          items.push({
            emoji: h.emoji,
            text: h.name,
            date: match.date,
            dayLabel: match.label,
            type: "holiday",
            region: "GLOBAL" as HolidayRegion,
            isMajor: true,
          });
        }
      }

      items.sort((a, b) => a.date.getTime() - b.date.getTime());
      return items;
    },
  });

  // Split into employee vs holiday
  const employeeCelebrations = celebrations.filter(
    (c) => c.type === "birthday" || c.type === "work_anniversary" || c.type === "new_joiner"
  );
  const holidayCelebrations = celebrations.filter(
    (c) => c.type === "holiday" || c.type === "dst_reminder"
  );

  // --- confetti ---
  const confettiFired = useRef(false);
  useEffect(() => {
    if (celebrations.length === 0 || confettiFired.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    confettiFired.current = true;
    const end = Date.now() + 2500;
    const colors = ["hsl(45,93%,47%)", "hsl(330,80%,60%)", "hsl(200,80%,60%)", "hsl(120,60%,50%)"];
    const frame = () => {
      confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors, ticks: 200, gravity: 0.8, scalar: 0.9, drift: 0.1 });
      confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors, ticks: 200, gravity: 0.8, scalar: 0.9, drift: -0.1 });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    const timer = setTimeout(() => requestAnimationFrame(frame), 400);
    return () => clearTimeout(timer);
  }, [celebrations]);

  if (celebrations.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2 mb-3">
          <PartyPopper className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
            Upcoming Celebrations
          </h2>
        </div>
        <p className="text-sm text-muted-foreground py-2">No celebrations coming up 🎉</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5 space-y-4">
      <div className="flex items-center gap-2">
        <PartyPopper className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
          Upcoming Celebrations
        </h2>
        <span className="text-[11px] text-muted-foreground/70 font-medium">
          ({celebrations.length})
        </span>
      </div>

      {employeeCelebrations.length > 0 && (
        <CelebrationRow
          label="Employee Celebrations"
          icon={<Cake className="h-3.5 w-3.5" />}
          items={employeeCelebrations}
          count={employeeCelebrations.length}
          onClickDetail={setDetailItem}
        />
      )}

      {holidayCelebrations.length > 0 && (
        <CelebrationRow
          label="Holiday and Important Dates"
          icon={<Globe className="h-3.5 w-3.5" />}
          items={holidayCelebrations}
          count={holidayCelebrations.length}
          onClickDetail={setDetailItem}
        />
      )}

      <HolidayDetailDialog item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}

// --- Carousel Row ---

function CelebrationRow({
  label,
  icon,
  items,
  count,
  onClickDetail,
}: {
  label: string;
  icon: React.ReactNode;
  items: CelebrationItem[];
  count: number;
  onClickDetail: (item: CelebrationItem) => void;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    slidesToScroll: 2,
    containScroll: "trimSnaps",
    dragFree: true,
  });

  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium">{label}</span>
          <span className="text-[10px] text-muted-foreground/60">({count})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => emblaApi?.scrollPrev()}
            disabled={!canScrollPrev}
            className="p-1 rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Previous"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => emblaApi?.scrollNext()}
            disabled={!canScrollNext}
            className="p-1 rounded-md hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-2.5">
          {items.map((c, i) => (
            <CelebrationCard
              key={i}
              item={c}
              onClickDetail={() => onClickDetail(c)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Holiday Detail Dialog ---

function HolidayDetailDialog({ item, onClose }: { item: CelebrationItem | null; onClose: () => void }) {
  const [detail, setDetail] = useState<HolidayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastFetched = useRef<string | null>(null);

  useEffect(() => {
    if (!item || (item.type !== "holiday" && item.type !== "dst_reminder")) {
      setDetail(null);
      setError(false);
      lastFetched.current = null;
      return;
    }

    const key = `${item.text}-${format(item.date, "yyyy-MM-dd")}`;
    if (lastFetched.current === key) return;
    lastFetched.current = key;

    let cancelled = false;
    setLoading(true);
    setError(false);
    setDetail(null);

    const fetchDetail = async () => {
      try {
        const category = getCategoryLabel(item);
        const dateStr = format(item.date, "MMMM d, yyyy");

        const res = await supabase.functions.invoke("holiday-detail", {
          body: { name: item.text, date: dateStr, category },
        });

        if (cancelled) return;

        if (res.error) {
          setError(true);
          setLoading(false);
          return;
        }

        const data = res.data as HolidayDetail | null;
        if (data && data.description) {
          setDetail(data);
        } else {
          setDetail({
            description: "Details are not available at this time.",
            history: "",
            significance: "",
            faq: [],
          });
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDetail();
    return () => { cancelled = true; };
  }, [item]);

  if (!item) return null;

  const isHolidayType = item.type === "holiday" || item.type === "dst_reminder";
  const category = getCategoryLabel(item);
  const dateStr = format(item.date, "EEEE, MMMM d, yyyy");

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0 mt-0.5">{item.emoji}</span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold text-foreground leading-snug">
                  {item.text}
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                  {dateStr}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2.5 py-1 rounded-full">
              {category}
            </span>
            {item.region && (
              <span className="inline-flex items-center text-[11px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {REGION_SHORT[item.region]}
              </span>
            )}
          </div>
        </div>

        <ScrollArea className="max-h-[calc(85vh-140px)]">
          <div className="px-6 py-5 space-y-5">
            {!isHolidayType ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {item.fullName ? `Celebrate ${item.fullName}'s special day! 🎉` : "No additional details available."}
              </p>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading details…</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Unable to load additional details at this time.</p>
                <p className="text-xs text-muted-foreground mt-1">Please try again later.</p>
              </div>
            ) : detail ? (
              <>
                {detail.description && <DetailSection title="About" content={detail.description} />}
                {detail.history && <DetailSection title="Historical Background" content={detail.history} />}
                {detail.significance && <DetailSection title="Why It Is Observed" content={detail.significance} />}
                {detail.faq && detail.faq.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Frequently Asked Questions
                    </h3>
                    <div className="space-y-3">
                      {detail.faq.map((faqItem, idx) => (
                        <div key={idx} className="rounded-lg border border-border bg-muted/30 p-3.5">
                          <p className="text-sm font-medium text-foreground">{faqItem.question}</p>
                          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{faqItem.answer}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!detail.description && !detail.history && !detail.significance && (!detail.faq || detail.faq.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No additional details are available for this item.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function DetailSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h3>
      <p className="text-sm text-foreground leading-relaxed">{content}</p>
      <Separator className="mt-4" />
    </div>
  );
}

// --- Card sub-component ---

const CARD_CLASS = "relative rounded-lg border bg-gradient-to-br transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 text-left shrink-0 w-[clamp(220px,24vw,260px)] min-h-[68px]";

function CelebrationCard({
  item: c,
  onClickDetail,
}: {
  item: CelebrationItem;
  onClickDetail: () => void;
}) {
  const navigate = useNavigate();
  const isHolidayClickable = c.type === "holiday" || c.type === "dst_reminder";
  const isEmployee = c.type === "birthday" || c.type === "work_anniversary" || c.type === "new_joiner";
  const clickable = isHolidayClickable || (isEmployee && !!c.userId);
  const today = isToday(c.date);
  const dateLabel = getRollingDateLabel(c.date);

  const colorClass = isEmployee
    ? EMPLOYEE_COLORS[c.type] || EMPLOYEE_COLORS.birthday
    : c.type === "dst_reminder"
      ? DST_COLORS
      : HOLIDAY_COLORS;

  const subtitle = (() => {
    if (c.type === "birthday") return "🎂 Birthday";
    if (c.type === "work_anniversary") {
      const y = c.years ?? 1;
      return y >= 2 ? `🏆 ${ordinal(y)} Work Anniversary` : `🎉 ${ordinal(y)} Work Anniversary`;
    }
    if (c.type === "new_joiner") return "🌱 New Joiner";
    return null;
  })();

  const handleClick = () => {
    if (isHolidayClickable) {
      onClickDetail();
    } else if (isEmployee && c.userId) {
      navigate(`/profile/${c.userId}`);
    }
  };

  return (
    <button
      type="button"
      onClick={clickable ? handleClick : undefined}
      className={`${CARD_CLASS} ${colorClass} ${clickable ? "cursor-pointer" : "cursor-default"}`}
      tabIndex={clickable ? 0 : -1}
    >
      <span className={`absolute top-1.5 right-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded z-10 ${today ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {dateLabel}
      </span>

      <div className="flex items-start gap-2.5 px-3 py-2.5 pr-[70px] h-full">
        {isEmployee && c.fullName ? (
          <Avatar className="h-8 w-8 ring-2 ring-background shadow-sm shrink-0 mt-0.5">
            <AvatarImage src={c.profilePhotoUrl || undefined} alt={c.fullName} />
            <AvatarFallback className="text-[10px] font-semibold bg-muted text-muted-foreground">
              {getInitials(c.fullName)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="h-8 w-8 rounded-full bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-base leading-none">{c.emoji}</span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {isEmployee && c.fullName ? (
            <>
              <p className="text-[12px] font-semibold text-foreground leading-snug line-clamp-2 text-left" style={{ overflowWrap: "anywhere" }}>
                {c.fullName}
              </p>
              {subtitle && (
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-1 text-left">{subtitle}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-[12px] font-semibold text-foreground leading-snug line-clamp-2 text-left" style={{ overflowWrap: "anywhere" }}>
                {c.text}
              </p>
              {c.region && (
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap line-clamp-1">
                  <span className="bg-muted/80 px-1 py-0.5 rounded text-[9px] font-medium">
                    {REGION_SHORT[c.region]}
                  </span>
                  {c.category && <span className="line-clamp-1">· {c.category}</span>}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  );
}
