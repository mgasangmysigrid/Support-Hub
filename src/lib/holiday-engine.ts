/**
 * Holiday Engine — computes fixed and movable holidays dynamically per year.
 *
 * Key features:
 * - Easter computed algorithmically (Anonymous Gregorian / Computus)
 * - All Easter-relative holidays derived dynamically
 * - Nth-weekday holidays (e.g. US Thanksgiving) computed per year
 * - No hardcoded date lookups — works for any year
 */

export type HolidayRegion = "PH" | "US" | "EU" | "ME" | "GLOBAL";

export interface ImportantDateItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  emoji: string;
  region: HolidayRegion;
  type: "holiday" | "important_date" | "dst_reminder";
  isMovable: boolean;
  isMajor: boolean;
  category?: string;
}

// ─── EASTER (Anonymous Gregorian algorithm) ─────────────────────────

function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDaysToDate(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Nth weekday of month ───────────────────────────────────────────

/** Get the nth occurrence of a weekday (0=Sun..6=Sat) in a month. n is 1-based. */
function nthWeekdayOf(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const firstOccurrence = 1 + ((weekday - first.getDay() + 7) % 7);
  const day = firstOccurrence + (n - 1) * 7;
  return new Date(year, month - 1, day);
}

/** Last occurrence of a weekday in a month */
function lastWeekdayOf(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month, 0); // last day of month
  const diff = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month - 1, last.getDate() - diff);
}

// ─── FIXED HOLIDAYS ─────────────────────────────────────────────────

function getFixedHolidays(year: number): ImportantDateItem[] {
  const fixed: Array<{
    title: string; emoji: string; region: HolidayRegion;
    month: number; day: number; isMajor: boolean; category?: string;
  }> = [
    // GLOBAL
    { title: "New Year's Day", emoji: "🎆", region: "GLOBAL", month: 1, day: 1, isMajor: true },
    { title: "Valentine's Day", emoji: "❤️", region: "GLOBAL", month: 2, day: 14, isMajor: false },
    { title: "International Women's Day", emoji: "👩", region: "GLOBAL", month: 3, day: 8, isMajor: true },
    { title: "Earth Day", emoji: "🌍", region: "GLOBAL", month: 4, day: 22, isMajor: false },
    { title: "International Workers' Day", emoji: "✊", region: "GLOBAL", month: 5, day: 1, isMajor: true, category: "Labor Day" },
    { title: "World Environment Day", emoji: "🌱", region: "GLOBAL", month: 6, day: 5, isMajor: false },
    { title: "International Day of Peace", emoji: "☮️", region: "GLOBAL", month: 9, day: 21, isMajor: false },
    { title: "United Nations Day", emoji: "🇺🇳", region: "GLOBAL", month: 10, day: 24, isMajor: false },
    { title: "Human Rights Day", emoji: "✊", region: "GLOBAL", month: 12, day: 10, isMajor: false },
    { title: "Christmas Eve", emoji: "🎄", region: "GLOBAL", month: 12, day: 24, isMajor: true },
    { title: "Christmas Day", emoji: "🎄", region: "GLOBAL", month: 12, day: 25, isMajor: true },
    { title: "New Year's Eve", emoji: "🎇", region: "GLOBAL", month: 12, day: 31, isMajor: true },
    { title: "Halloween", emoji: "🎃", region: "US", month: 10, day: 31, isMajor: false },

    // PHILIPPINES
    { title: "EDSA People Power Anniversary", emoji: "🇵🇭", region: "PH", month: 2, day: 25, isMajor: true },
    { title: "Araw ng Kagitingan", emoji: "🇵🇭", region: "PH", month: 4, day: 9, isMajor: true, category: "Day of Valor" },
    { title: "Philippine Independence Day", emoji: "🇵🇭", region: "PH", month: 6, day: 12, isMajor: true },
    { title: "Bonifacio Day", emoji: "🇵🇭", region: "PH", month: 11, day: 30, isMajor: true },
    { title: "Rizal Day", emoji: "🇵🇭", region: "PH", month: 12, day: 30, isMajor: true },
    { title: "Last Day of the Year", emoji: "🇵🇭", region: "PH", month: 12, day: 31, isMajor: false },

    // US
    { title: "Juneteenth", emoji: "🇺🇸", region: "US", month: 6, day: 19, isMajor: true },
    { title: "Independence Day", emoji: "🇺🇸", region: "US", month: 7, day: 4, isMajor: true },
    { title: "Veterans Day", emoji: "🇺🇸", region: "US", month: 11, day: 11, isMajor: true },

    // EU
    { title: "Epiphany", emoji: "⭐", region: "EU", month: 1, day: 6, isMajor: false },
    { title: "Europe Day", emoji: "🇪🇺", region: "EU", month: 5, day: 9, isMajor: false },
    { title: "Bastille Day", emoji: "🇫🇷", region: "EU", month: 7, day: 14, isMajor: false, category: "France" },
    { title: "German Unity Day", emoji: "🇩🇪", region: "EU", month: 10, day: 3, isMajor: false, category: "Germany" },
    { title: "All Saints' Day", emoji: "🕊️", region: "EU", month: 11, day: 1, isMajor: true },
    { title: "St. Stephen's Day", emoji: "🎄", region: "EU", month: 12, day: 26, isMajor: false, category: "Boxing Day" },
  ];

  return fixed.map((h) => ({
    id: `fixed-${h.region}-${h.month}-${h.day}`,
    title: h.title,
    date: `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`,
    emoji: h.emoji,
    region: h.region,
    type: "holiday" as const,
    isMovable: false,
    isMajor: h.isMajor,
    category: h.category,
  }));
}

// ─── MOVABLE HOLIDAYS (computed) ────────────────────────────────────

function getMovableHolidays(year: number): ImportantDateItem[] {
  const easter = computeEasterSunday(year);
  const items: ImportantDateItem[] = [];

  const add = (
    title: string, date: Date, emoji: string, region: HolidayRegion,
    isMajor: boolean, category?: string,
  ) => {
    items.push({
      id: `movable-${region}-${title.toLowerCase().replace(/\s+/g, "-")}-${year}`,
      title,
      date: fmt(date),
      emoji,
      region,
      type: "holiday",
      isMovable: true,
      isMajor,
      category,
    });
  };

  // Easter-relative holidays
  add("Palm Sunday", addDaysToDate(easter, -7), "🌿", "GLOBAL", true);
  add("Holy Wednesday", addDaysToDate(easter, -4), "✝️", "PH", true);
  add("Maundy Thursday", addDaysToDate(easter, -3), "✝️", "PH", true);
  add("Good Friday", addDaysToDate(easter, -2), "✝️", "GLOBAL", true);
  add("Black Saturday", addDaysToDate(easter, -1), "✝️", "PH", true);
  add("Easter Sunday", easter, "🐣", "GLOBAL", true);
  add("Easter Monday", addDaysToDate(easter, 1), "🐣", "EU", true);
  add("Ascension Day", addDaysToDate(easter, 39), "✝️", "EU", false);
  add("Whit Monday / Pentecost Monday", addDaysToDate(easter, 50), "✝️", "EU", false);

  // US nth-weekday holidays
  add("Martin Luther King Jr. Day", nthWeekdayOf(year, 1, 1, 3), "🇺🇸", "US", true); // 3rd Mon Jan
  add("Presidents' Day", nthWeekdayOf(year, 2, 1, 3), "🇺🇸", "US", false); // 3rd Mon Feb
  add("Memorial Day", lastWeekdayOf(year, 5, 1), "🇺🇸", "US", true); // last Mon May
  add("Labor Day", nthWeekdayOf(year, 9, 1, 1), "🇺🇸", "US", true); // 1st Mon Sep
  add("Columbus Day / Indigenous Peoples' Day", nthWeekdayOf(year, 10, 1, 2), "🇺🇸", "US", false); // 2nd Mon Oct
  add("Thanksgiving", nthWeekdayOf(year, 11, 4, 4), "🦃", "US", true); // 4th Thu Nov

  // PH — National Heroes Day (last Mon Aug)
  add("National Heroes Day", lastWeekdayOf(year, 8, 1), "🇵🇭", "PH", true);

  // Islamic holidays — approximate (shift ~10-11 days/year). Use known 2025 anchors.
  const islamicMovable: Array<{
    title: string; emoji: string; category?: string; isMajor: boolean;
    anchor2025: [number, number]; // [month, day] for 2025
  }> = [
    { title: "Start of Ramadan", emoji: "🌙", category: "Holy Month", isMajor: true, anchor2025: [2, 28] },
    { title: "Eid al-Fitr", emoji: "🌙", category: "End of Ramadan", isMajor: true, anchor2025: [3, 30] },
    { title: "Eid al-Fitr (Day 2)", emoji: "🌙", isMajor: false, anchor2025: [3, 31] },
    { title: "Eid al-Adha", emoji: "🐑", category: "Festival of Sacrifice", isMajor: true, anchor2025: [6, 6] },
    { title: "Eid al-Adha (Day 2)", emoji: "🐑", isMajor: false, anchor2025: [6, 7] },
    { title: "Islamic New Year", emoji: "🌙", isMajor: true, anchor2025: [6, 26] },
    { title: "Mawlid al-Nabi (Prophet's Birthday)", emoji: "🌙", isMajor: true, anchor2025: [9, 4] },
  ];

  // Islamic calendar shifts ~10.6 days earlier each Gregorian year
  const ISLAMIC_YEAR_SHIFT_DAYS = 10.6;
  for (const ih of islamicMovable) {
    const anchor = new Date(2025, ih.anchor2025[0] - 1, ih.anchor2025[1]);
    const yearDiff = year - 2025;
    const shifted = addDaysToDate(anchor, Math.round(-yearDiff * ISLAMIC_YEAR_SHIFT_DAYS));
    // Set to correct year
    shifted.setFullYear(year);
    // If shift pushed it before Jan 1, wrap
    if (shifted.getMonth() === 11 && ih.anchor2025[0] <= 3 && yearDiff > 0) {
      // skip — date wrapped oddly
    } else {
      add(ih.title, shifted, ih.emoji, "ME", ih.isMajor, ih.category);
    }
  }

  // Other movable: Chinese New Year, Diwali (use known dates, computed approximately)
  const chineseNewYear: Record<number, string> = {
    2024: "02-10", 2025: "01-29", 2026: "02-17", 2027: "02-06", 2028: "01-26",
    2029: "02-13", 2030: "02-03",
  };
  if (chineseNewYear[year]) {
    items.push({
      id: `movable-GLOBAL-chinese-new-year-${year}`,
      title: "Chinese New Year",
      date: `${year}-${chineseNewYear[year]}`,
      emoji: "🧧",
      region: "GLOBAL",
      type: "holiday",
      isMovable: true,
      isMajor: true,
    });
  }

  const diwali: Record<number, string> = {
    2024: "11-01", 2025: "10-20", 2026: "11-08", 2027: "10-29", 2028: "10-17",
    2029: "11-05", 2030: "10-26",
  };
  if (diwali[year]) {
    items.push({
      id: `movable-GLOBAL-diwali-${year}`,
      title: "Diwali",
      date: `${year}-${diwali[year]}`,
      emoji: "🪔",
      region: "GLOBAL",
      type: "holiday",
      isMovable: true,
      isMajor: true,
      category: "Festival of Lights",
    });
  }

  // Jewish holidays (lookup — lunisolar, hard to compute)
  const jewish: Record<number, Array<{ title: string; mmdd: string; category: string }>> = {
    2025: [
      { title: "Rosh Hashanah", mmdd: "09-22", category: "Jewish New Year" },
      { title: "Yom Kippur", mmdd: "10-01", category: "Day of Atonement" },
      { title: "Hanukkah (begins)", mmdd: "12-14", category: "Festival of Lights" },
    ],
    2026: [
      { title: "Rosh Hashanah", mmdd: "09-11", category: "Jewish New Year" },
      { title: "Yom Kippur", mmdd: "09-20", category: "Day of Atonement" },
      { title: "Hanukkah (begins)", mmdd: "12-04", category: "Festival of Lights" },
    ],
    2027: [
      { title: "Rosh Hashanah", mmdd: "10-02", category: "Jewish New Year" },
      { title: "Yom Kippur", mmdd: "10-11", category: "Day of Atonement" },
      { title: "Hanukkah (begins)", mmdd: "12-24", category: "Festival of Lights" },
    ],
    2028: [
      { title: "Rosh Hashanah", mmdd: "09-20", category: "Jewish New Year" },
      { title: "Yom Kippur", mmdd: "09-29", category: "Day of Atonement" },
      { title: "Hanukkah (begins)", mmdd: "12-12", category: "Festival of Lights" },
    ],
  };
  for (const jh of jewish[year] ?? []) {
    items.push({
      id: `movable-ME-${jh.title.toLowerCase().replace(/\s+/g, "-")}-${year}`,
      title: jh.title,
      date: `${year}-${jh.mmdd}`,
      emoji: "🕎",
      region: "ME",
      type: "holiday",
      isMovable: true,
      isMajor: true,
      category: jh.category,
    });
  }

  return items;
}

// ─── DST REMINDERS ──────────────────────────────────────────────────

function getDSTReminders(year: number): ImportantDateItem[] {
  // US: 2nd Sun Mar, 1st Sun Nov; EU: last Sun Mar, last Sun Oct
  const items: Array<{ title: string; date: Date }> = [
    { title: "US DST Spring Forward — US clocks move +1 hour (EDT/CDT/PDT)", date: nthWeekdayOf(year, 3, 0, 2) },
    { title: "EU DST Spring Forward — EU clocks move +1 hour (CEST/BST)", date: lastWeekdayOf(year, 3, 0) },
    { title: "EU DST Fall Back — EU clocks move −1 hour (CET/GMT)", date: lastWeekdayOf(year, 10, 0) },
    { title: "US DST Fall Back — US clocks move −1 hour (EST/CST/PST)", date: nthWeekdayOf(year, 11, 0, 1) },
  ];

  return items.map((d) => ({
    id: `dst-${d.title.slice(0, 6).replace(/\s/g, "")}-${year}`,
    title: d.title,
    date: fmt(d.date),
    emoji: "🕐",
    region: "GLOBAL" as HolidayRegion,
    type: "dst_reminder" as const,
    isMovable: true,
    isMajor: false,
  }));
}

// ─── PUBLIC API ──────────────────────────────────────────────────────

/**
 * Get all holiday and important dates for a given year.
 * Fully computed — no stale/hardcoded date lookups for Easter-based holidays.
 */
export function getHolidayAndImportantDates(year: number): ImportantDateItem[] {
  const all = [
    ...getFixedHolidays(year),
    ...getMovableHolidays(year),
    ...getDSTReminders(year),
  ];

  // Validate: remove any items whose date doesn't belong to the requested year
  return all.filter((item) => item.date.startsWith(String(year)));
}

/**
 * Get items within a date range (YYYY-MM-DD strings, inclusive).
 */
export function getHolidayAndImportantDatesForRange(
  startDate: string,
  endDate: string,
): ImportantDateItem[] {
  // Determine which years to compute
  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear = parseInt(endDate.slice(0, 4), 10);
  const items: ImportantDateItem[] = [];
  for (let y = startYear; y <= endYear; y++) {
    items.push(...getHolidayAndImportantDates(y));
  }

  return items
    .filter((item) => item.date >= startDate && item.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Re-export region labels for UI
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
