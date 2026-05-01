/**
 * World Holidays — centralized multi-region holiday dataset.
 *
 * Two types of holidays:
 * 1. FIXED: recur every year on the same month/day (e.g. Christmas Dec 25)
 * 2. MOVABLE: dates change each year (e.g. Easter, Eid). Pre-computed for supported years.
 *
 * Regions: PH, US, EU, ME (Middle East), GLOBAL
 */

export type HolidayRegion = "PH" | "US" | "EU" | "ME" | "GLOBAL";

export interface WorldHoliday {
  name: string;
  emoji: string;
  region: HolidayRegion;
  /** For fixed holidays: month (1-12) */
  month?: number;
  /** For fixed holidays: day (1-31) */
  day?: number;
  /** For movable holidays: pre-computed dates by year (YYYY -> "MM-DD") */
  movableDates?: Record<number, string>;
  isMajor: boolean;
  category?: string;
}

// ─── FIXED HOLIDAYS ─────────────────────────────────────────────────

const FIXED_HOLIDAYS: WorldHoliday[] = [
  // GLOBAL
  { name: "New Year's Day", emoji: "🎆", region: "GLOBAL", month: 1, day: 1, isMajor: true },
  { name: "Valentine's Day", emoji: "❤️", region: "GLOBAL", month: 2, day: 14, isMajor: false },
  { name: "International Women's Day", emoji: "👩", region: "GLOBAL", month: 3, day: 8, isMajor: true },
  { name: "Earth Day", emoji: "🌍", region: "GLOBAL", month: 4, day: 22, isMajor: false },
  { name: "International Workers' Day", emoji: "✊", region: "GLOBAL", month: 5, day: 1, isMajor: true, category: "Labor Day" },
  { name: "World Environment Day", emoji: "🌱", region: "GLOBAL", month: 6, day: 5, isMajor: false },
  { name: "International Day of Peace", emoji: "☮️", region: "GLOBAL", month: 9, day: 21, isMajor: false },
  { name: "United Nations Day", emoji: "🇺🇳", region: "GLOBAL", month: 10, day: 24, isMajor: false },
  { name: "Human Rights Day", emoji: "✊", region: "GLOBAL", month: 12, day: 10, isMajor: false },
  { name: "Christmas Eve", emoji: "🎄", region: "GLOBAL", month: 12, day: 24, isMajor: true },
  { name: "Christmas Day", emoji: "🎄", region: "GLOBAL", month: 12, day: 25, isMajor: true },
  { name: "New Year's Eve", emoji: "🎇", region: "GLOBAL", month: 12, day: 31, isMajor: true },

  // UNITED STATES
  { name: "Martin Luther King Jr. Day", emoji: "🇺🇸", region: "US", month: 1, day: 20, isMajor: true }, // 3rd Mon Jan (approx — movable in reality, but common date)
  { name: "Presidents' Day", emoji: "🇺🇸", region: "US", month: 2, day: 17, isMajor: false },
  { name: "Memorial Day", emoji: "🇺🇸", region: "US", month: 5, day: 26, isMajor: true }, // last Mon May (approx)
  { name: "Juneteenth", emoji: "🇺🇸", region: "US", month: 6, day: 19, isMajor: true },
  { name: "Independence Day", emoji: "🇺🇸", region: "US", month: 7, day: 4, isMajor: true },
  { name: "Veterans Day", emoji: "🇺🇸", region: "US", month: 11, day: 11, isMajor: true },

  // PHILIPPINES
  { name: "EDSA People Power Anniversary", emoji: "🇵🇭", region: "PH", month: 2, day: 25, isMajor: true },
  { name: "Araw ng Kagitingan", emoji: "🇵🇭", region: "PH", month: 4, day: 9, isMajor: true, category: "Day of Valor" },
  { name: "Philippine Independence Day", emoji: "🇵🇭", region: "PH", month: 6, day: 12, isMajor: true },
  { name: "National Heroes Day", emoji: "🇵🇭", region: "PH", month: 8, day: 25, isMajor: true }, // last Mon Aug
  { name: "Bonifacio Day", emoji: "🇵🇭", region: "PH", month: 11, day: 30, isMajor: true },
  { name: "Rizal Day", emoji: "🇵🇭", region: "PH", month: 12, day: 30, isMajor: true },
  { name: "Last Day of the Year", emoji: "🇵🇭", region: "PH", month: 12, day: 31, isMajor: false },

  // EUROPE (widely observed)
  { name: "Epiphany", emoji: "⭐", region: "EU", month: 1, day: 6, isMajor: false },
  { name: "Europe Day", emoji: "🇪🇺", region: "EU", month: 5, day: 9, isMajor: false },
  { name: "Bastille Day", emoji: "🇫🇷", region: "EU", month: 7, day: 14, isMajor: false, category: "France" },
  { name: "German Unity Day", emoji: "🇩🇪", region: "EU", month: 10, day: 3, isMajor: false, category: "Germany" },
  { name: "All Saints' Day", emoji: "🕊️", region: "EU", month: 11, day: 1, isMajor: true },
  { name: "St. Stephen's Day", emoji: "🎄", region: "EU", month: 12, day: 26, isMajor: false, category: "Boxing Day" },
];

// ─── MOVABLE HOLIDAYS ───────────────────────────────────────────────
// Pre-computed dates for 2025–2028. Add more years as needed.

const MOVABLE_HOLIDAYS: WorldHoliday[] = [
  // Easter & related (Western calendar)
  {
    name: "Good Friday",
    emoji: "✝️",
    region: "GLOBAL",
    isMajor: true,
    movableDates: { 2025: "04-18", 2026: "04-03", 2027: "03-26", 2028: "04-14" },
  },
  {
    name: "Easter Sunday",
    emoji: "🐣",
    region: "GLOBAL",
    isMajor: true,
    movableDates: { 2025: "04-20", 2026: "04-05", 2027: "03-28", 2028: "04-16" },
  },
  {
    name: "Easter Monday",
    emoji: "🐣",
    region: "EU",
    isMajor: true,
    movableDates: { 2025: "04-21", 2026: "04-06", 2027: "03-29", 2028: "04-17" },
  },
  {
    name: "Ascension Day",
    emoji: "✝️",
    region: "EU",
    isMajor: false,
    movableDates: { 2025: "05-29", 2026: "05-14", 2027: "05-06", 2028: "05-25" },
  },
  {
    name: "Whit Monday / Pentecost Monday",
    emoji: "✝️",
    region: "EU",
    isMajor: false,
    movableDates: { 2025: "06-09", 2026: "05-25", 2027: "05-17", 2028: "06-05" },
  },

  // Islamic holidays (approximate — dates may shift ±1 day based on moon sighting)
  {
    name: "Eid al-Fitr",
    emoji: "🌙",
    region: "ME",
    isMajor: true,
    category: "End of Ramadan",
    movableDates: { 2025: "03-30", 2026: "03-20", 2027: "03-10", 2028: "02-27" },
  },
  {
    name: "Eid al-Fitr (Day 2)",
    emoji: "🌙",
    region: "ME",
    isMajor: false,
    movableDates: { 2025: "03-31", 2026: "03-21", 2027: "03-11", 2028: "02-28" },
  },
  {
    name: "Eid al-Adha",
    emoji: "🐑",
    region: "ME",
    isMajor: true,
    category: "Festival of Sacrifice",
    movableDates: { 2025: "06-06", 2026: "05-27", 2027: "05-16", 2028: "05-05" },
  },
  {
    name: "Eid al-Adha (Day 2)",
    emoji: "🐑",
    region: "ME",
    isMajor: false,
    movableDates: { 2025: "06-07", 2026: "05-28", 2027: "05-17", 2028: "05-06" },
  },
  {
    name: "Islamic New Year",
    emoji: "🌙",
    region: "ME",
    isMajor: true,
    movableDates: { 2025: "06-26", 2026: "06-16", 2027: "06-06", 2028: "05-25" },
  },
  {
    name: "Mawlid al-Nabi (Prophet's Birthday)",
    emoji: "🌙",
    region: "ME",
    isMajor: true,
    movableDates: { 2025: "09-04", 2026: "08-25", 2027: "08-14", 2028: "08-03" },
  },
  {
    name: "Start of Ramadan",
    emoji: "🌙",
    region: "ME",
    isMajor: true,
    category: "Holy Month",
    movableDates: { 2025: "02-28", 2026: "02-18", 2027: "02-07", 2028: "01-28" },
  },

  // US movable holidays
  {
    name: "Labor Day",
    emoji: "🇺🇸",
    region: "US",
    isMajor: true,
    movableDates: { 2025: "09-01", 2026: "09-07", 2027: "09-06", 2028: "09-04" },
  },
  {
    name: "Columbus Day / Indigenous Peoples' Day",
    emoji: "🇺🇸",
    region: "US",
    isMajor: false,
    movableDates: { 2025: "10-13", 2026: "10-12", 2027: "10-11", 2028: "10-09" },
  },
  {
    name: "Thanksgiving",
    emoji: "🦃",
    region: "US",
    isMajor: true,
    movableDates: { 2025: "11-27", 2026: "11-26", 2027: "11-25", 2028: "11-23" },
  },
  {
    name: "Halloween",
    emoji: "🎃",
    region: "US",
    isMajor: false,
    month: 10,
    day: 31,
  },

  // PH movable
  {
    name: "Black Saturday",
    emoji: "✝️",
    region: "PH",
    isMajor: true,
    movableDates: { 2025: "04-19", 2026: "04-04", 2027: "03-27", 2028: "04-15" },
  },

  // Jewish holidays (major)
  {
    name: "Rosh Hashanah",
    emoji: "🕎",
    region: "ME",
    isMajor: true,
    category: "Jewish New Year",
    movableDates: { 2025: "09-22", 2026: "09-11", 2027: "10-02", 2028: "09-20" },
  },
  {
    name: "Yom Kippur",
    emoji: "🕎",
    region: "ME",
    isMajor: true,
    category: "Day of Atonement",
    movableDates: { 2025: "10-01", 2026: "09-20", 2027: "10-11", 2028: "09-29" },
  },
  {
    name: "Hanukkah (begins)",
    emoji: "🕎",
    region: "ME",
    isMajor: true,
    movableDates: { 2025: "12-14", 2026: "12-04", 2027: "12-24", 2028: "12-12" },
  },

  // Diwali
  {
    name: "Diwali",
    emoji: "🪔",
    region: "GLOBAL",
    isMajor: true,
    category: "Festival of Lights",
    movableDates: { 2025: "10-20", 2026: "11-08", 2027: "10-29", 2028: "10-17" },
  },

  // Chinese New Year
  {
    name: "Chinese New Year",
    emoji: "🧧",
    region: "GLOBAL",
    isMajor: true,
    movableDates: { 2025: "01-29", 2026: "02-17", 2027: "02-06", 2028: "01-26" },
  },
];

// ─── ALL HOLIDAYS ───────────────────────────────────────────────────

const ALL_WORLD_HOLIDAYS: WorldHoliday[] = [...FIXED_HOLIDAYS, ...MOVABLE_HOLIDAYS];

// ─── REGION LABELS ──────────────────────────────────────────────────

export const REGION_LABELS: Record<HolidayRegion, string> = {
  PH: "Philippines",
  US: "United States",
  EU: "Europe",
  ME: "Middle East",
  GLOBAL: "Global",
};

export const REGION_SHORT: Record<HolidayRegion, string> = {
  PH: "PH",
  US: "US",
  EU: "EU",
  ME: "ME",
  GLOBAL: "🌐",
};

// ─── QUERY FUNCTION ─────────────────────────────────────────────────

export interface ResolvedHoliday {
  name: string;
  emoji: string;
  region: HolidayRegion;
  date: Date;
  isMajor: boolean;
  category?: string;
  source: "world" | "admin";
}

/**
 * Get all world holidays that fall within a date range.
 * Does NOT include admin DB holidays — those are merged separately.
 */
export function getWorldHolidaysForRange(startDate: Date, endDate: Date): ResolvedHoliday[] {
  const results: ResolvedHoliday[] = [];
  const year = startDate.getFullYear();

  for (const h of ALL_WORLD_HOLIDAYS) {
    let holidayDate: Date | null = null;

    if (h.movableDates) {
      const mmdd = h.movableDates[year];
      if (mmdd) {
        const [m, d] = mmdd.split("-").map(Number);
        holidayDate = new Date(year, m - 1, d);
      }
    } else if (h.month && h.day) {
      holidayDate = new Date(year, h.month - 1, h.day);
    }

    if (!holidayDate) continue;

    // Check if within range
    const hTime = holidayDate.getTime();
    if (hTime >= startDate.getTime() && hTime <= endDate.getTime()) {
      results.push({
        name: h.name,
        emoji: h.emoji,
        region: h.region,
        date: holidayDate,
        isMajor: h.isMajor,
        category: h.category,
        source: "world",
      });
    }
  }

  // Sort by date, then major first
  results.sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime();
    if (dateDiff !== 0) return dateDiff;
    if (a.isMajor && !b.isMajor) return -1;
    if (!a.isMajor && b.isMajor) return 1;
    return 0;
  });

  return results;
}

/**
 * Merge world holidays with admin-managed DB holidays, deduplicating by name+date.
 * Admin holidays take priority (they override world entries).
 */
export function mergeHolidays(
  worldHolidays: ResolvedHoliday[],
  adminHolidays: ResolvedHoliday[],
): ResolvedHoliday[] {
  const seen = new Set<string>();
  const merged: ResolvedHoliday[] = [];

  // Admin holidays first (priority)
  for (const h of adminHolidays) {
    const key = `${h.name.toLowerCase().trim()}-${h.date.getMonth() + 1}-${h.date.getDate()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(h);
    }
  }

  // Then world holidays
  for (const h of worldHolidays) {
    const key = `${h.name.toLowerCase().trim()}-${h.date.getMonth() + 1}-${h.date.getDate()}`;
    // Also check by date only to avoid showing "Christmas Day" from both admin and world
    const dateKey = `${h.date.getMonth() + 1}-${h.date.getDate()}`;
    // Check if admin already has an entry for this exact date with similar name
    const isDupe = seen.has(key) || [...seen].some(k => {
      const existingName = k.split("-").slice(0, -2).join("-");
      return k.endsWith(`-${h.date.getMonth() + 1}-${h.date.getDate()}`) &&
        (existingName.includes(h.name.toLowerCase().split(" ")[0]) ||
         h.name.toLowerCase().includes(existingName.split("-")[0]));
    });
    if (!isDupe) {
      seen.add(key);
      merged.push(h);
    }
  }

  // Sort
  merged.sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime();
    if (dateDiff !== 0) return dateDiff;
    if (a.isMajor && !b.isMajor) return -1;
    if (!a.isMajor && b.isMajor) return 1;
    return 0;
  });

  return merged;
}
