import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Upload, CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  Loader2, ClipboardPaste, RotateCcw, Download,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Types ───────────────────────────────────────────────────
type MatchConfidence =
  | "exact_match"
  | "partial_match"
  | "last_name_unique_match"
  | "ambiguous"
  | "no_match"
  | "invalid_schedule";

interface ParsedSchedule {
  schedule_type: "fixed" | "flexible";
  work_start_time: string | null;
  work_end_time: string | null;
  work_timezone: string;
}

interface ImportRow {
  sourceName: string;
  sourceSchedule: string;
  confidence: MatchConfidence;
  matchedProfileId: string | null;
  matchedProfileName: string | null;
  parsedSchedule: ParsedSchedule | null;
  reason: string;
  oldSchedule?: {
    schedule_type: string | null;
    work_start_time: string | null;
    work_end_time: string | null;
    work_timezone: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────
function normalize(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,\-_'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseScheduleValue(raw: string): ParsedSchedule | null {
  const trimmed = raw.trim().toUpperCase();
  if (["FLEXI", "FLEX", "FLEXIBLE"].includes(trimmed)) {
    return { schedule_type: "flexible", work_start_time: null, work_end_time: null, work_timezone: "Asia/Manila" };
  }

  // Try to match time range like "4:00 PM - 1:00 AM" or "9:00 AM – 6:00 PM"
  const timeRangeRe = /^(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*[-–—]\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])$/;
  const match = raw.trim().match(timeRangeRe);
  if (!match) return null;

  const toTime24 = (t: string): string | null => {
    const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2];
    const ampm = m[3].toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:${min}:00`;
  };

  const start = toTime24(match[1]);
  const end = toTime24(match[2]);
  if (!start || !end) return null;

  return { schedule_type: "fixed", work_start_time: start, work_end_time: end, work_timezone: "Asia/Manila" };
}

function parseInputText(text: string): { name: string; schedule: string }[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const results: { name: string; schedule: string }[] = [];

  for (const line of lines) {
    // Try tab-separated first
    let parts = line.split("\t").map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const schedule = parts[parts.length - 1];
      const name = parts.slice(0, parts.length - 1).join(" ");
      results.push({ name, schedule });
      continue;
    }

    // Try to find schedule pattern at end of line
    const flexMatch = line.match(/^(.+?)\s+(FLEXI|FLEX|FLEXIBLE)\s*$/i);
    if (flexMatch) {
      results.push({ name: flexMatch[1].trim(), schedule: flexMatch[2] });
      continue;
    }

    const timeMatch = line.match(/^(.+?)\s+(\d{1,2}:\d{2}\s*[AaPp][Mm]\s*[-–—]\s*\d{1,2}:\d{2}\s*[AaPp][Mm])\s*$/);
    if (timeMatch) {
      results.push({ name: timeMatch[1].trim(), schedule: timeMatch[2] });
      continue;
    }

    // Skip header-like lines
    if (/^(EMPLOYEE|SCHEDULE|NAME)/i.test(line)) continue;
    // Skip section headers (all caps, no digits)
    if (/^[A-Z\s&]+$/.test(line) && line.length < 40) continue;
  }

  return results;
}

// ─── Match engine ────────────────────────────────────────────
function matchEmployee(
  sourceName: string,
  profiles: { id: string; full_name: string | null; is_active: boolean }[]
): { confidence: MatchConfidence; profileId: string | null; profileName: string | null; reason: string } {
  const norm = normalize(sourceName);
  const activeProfiles = profiles.filter(p => p.is_active && p.full_name);

  // 1. Exact match
  const exact = activeProfiles.find(p => normalize(p.full_name!) === norm);
  if (exact) return { confidence: "exact_match", profileId: exact.id, profileName: exact.full_name, reason: "Exact name match" };

  // 2. First + last name match
  const sourceParts = norm.split(" ").filter(Boolean);
  if (sourceParts.length >= 2) {
    const sourceFirst = sourceParts[0];
    const sourceLast = sourceParts[sourceParts.length - 1];

    const partials = activeProfiles.filter(p => {
      const pp = normalize(p.full_name!).split(" ").filter(Boolean);
      if (pp.length < 2) return false;
      return pp[0] === sourceFirst && pp[pp.length - 1] === sourceLast;
    });

    if (partials.length === 1) {
      return { confidence: "partial_match", profileId: partials[0].id, profileName: partials[0].full_name, reason: "First + last name match" };
    }
    if (partials.length > 1) {
      return { confidence: "ambiguous", profileId: null, profileName: null, reason: `Multiple matches: ${partials.map(p => p.full_name).join(", ")}` };
    }
  }

  // 3. Last name only
  if (sourceParts.length >= 1) {
    const sourceLast = sourceParts[sourceParts.length - 1];
    const lastMatches = activeProfiles.filter(p => {
      const pp = normalize(p.full_name!).split(" ").filter(Boolean);
      return pp[pp.length - 1] === sourceLast;
    });

    if (lastMatches.length === 1) {
      return { confidence: "last_name_unique_match", profileId: lastMatches[0].id, profileName: lastMatches[0].full_name, reason: "Unique last name match" };
    }
    if (lastMatches.length > 1) {
      return { confidence: "ambiguous", profileId: null, profileName: null, reason: `Ambiguous last name "${sourceLast}" shared by: ${lastMatches.map(p => p.full_name).join(", ")}` };
    }
  }

  return { confidence: "no_match", profileId: null, profileName: null, reason: "No matching employee found" };
}

// ─── Confidence badges ──────────────────────────────────────
function ConfidenceBadge({ c }: { c: MatchConfidence }) {
  switch (c) {
    case "exact_match":
      return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Exact</Badge>;
    case "partial_match":
      return <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30 gap-1 text-xs"><CheckCircle2 className="h-3 w-3" />Partial</Badge>;
    case "last_name_unique_match":
      return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1 text-xs"><HelpCircle className="h-3 w-3" />Last Name</Badge>;
    case "ambiguous":
      return <Badge className="bg-orange-500/15 text-orange-700 border-orange-500/30 gap-1 text-xs"><AlertTriangle className="h-3 w-3" />Ambiguous</Badge>;
    case "no_match":
      return <Badge className="bg-red-500/15 text-red-700 border-red-500/30 gap-1 text-xs"><XCircle className="h-3 w-3" />No Match</Badge>;
    case "invalid_schedule":
      return <Badge className="bg-red-500/15 text-red-700 border-red-500/30 gap-1 text-xs"><XCircle className="h-3 w-3" />Invalid</Badge>;
  }
}

function formatTime12(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatScheduleShort(s: ParsedSchedule | null): string {
  if (!s) return "—";
  if (s.schedule_type === "flexible") return "Flexible";
  return `${formatTime12(s.work_start_time)} – ${formatTime12(s.work_end_time)}`;
}

// ─── Component ──────────────────────────────────────────────
export default function ScheduleImporter() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rawInput, setRawInput] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [step, setStep] = useState<"input" | "preview" | "done">("input");
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<{ updated: number; skipped: number; errors: string[] }>({ updated: 0, skipped: 0, errors: [] });

  const { data: profiles } = useQuery({
    queryKey: ["schedule-import-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, is_active, schedule_type, work_start_time, work_end_time, work_timezone")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const handleParse = useCallback(() => {
    if (!profiles) return;
    const parsed = parseInputText(rawInput);
    if (parsed.length === 0) {
      toast.error("No schedule rows found. Paste employee names and schedules.");
      return;
    }

    const importRows: ImportRow[] = parsed.map(({ name, schedule }) => {
      const parsedSched = parseScheduleValue(schedule);
      if (!parsedSched) {
        return {
          sourceName: name,
          sourceSchedule: schedule,
          confidence: "invalid_schedule" as MatchConfidence,
          matchedProfileId: null,
          matchedProfileName: null,
          parsedSchedule: null,
          reason: `Cannot parse schedule: "${schedule}"`,
        };
      }

      const match = matchEmployee(name, profiles);
      const profile = match.profileId ? profiles.find(p => p.id === match.profileId) : null;

      return {
        sourceName: name,
        sourceSchedule: schedule,
        confidence: match.confidence,
        matchedProfileId: match.profileId,
        matchedProfileName: match.profileName,
        parsedSchedule: parsedSched,
        reason: match.reason,
        oldSchedule: profile ? {
          schedule_type: profile.schedule_type,
          work_start_time: profile.work_start_time,
          work_end_time: profile.work_end_time,
          work_timezone: profile.work_timezone,
        } : undefined,
      };
    });

    setRows(importRows);
    setStep("preview");
  }, [rawInput, profiles]);

  const autoUpdateRows = useMemo(() =>
    rows.filter(r => ["exact_match", "partial_match", "last_name_unique_match"].includes(r.confidence) && r.parsedSchedule),
    [rows]
  );

  const manualReviewRows = useMemo(() =>
    rows.filter(r => ["ambiguous", "no_match", "invalid_schedule"].includes(r.confidence)),
    [rows]
  );

  const handleApply = useCallback(async () => {
    if (!user) return;
    setApplying(true);
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of autoUpdateRows) {
      if (!row.matchedProfileId || !row.parsedSchedule) { skipped++; continue; }

      const { error } = await supabase
        .from("profiles")
        .update({
          schedule_type: row.parsedSchedule.schedule_type,
          work_start_time: row.parsedSchedule.work_start_time,
          work_end_time: row.parsedSchedule.work_end_time,
          work_timezone: row.parsedSchedule.work_timezone,
          profile_updated_at: new Date().toISOString(),
          profile_updated_by: "Schedule Import",
        })
        .eq("id", row.matchedProfileId);

      if (error) {
        errors.push(`${row.matchedProfileName}: ${error.message}`);
        skipped++;
      } else {
        updated++;
      }
    }

    // Log audit to leave_audit_log
    try {
      const auditEntries = autoUpdateRows
        .filter(r => r.matchedProfileId && r.parsedSchedule)
        .map(r => ({
          entity_type: "schedule_import",
          entity_id: r.matchedProfileId!,
          action: "schedule_updated",
          actor_id: user.id,
          before_snapshot: r.oldSchedule ? JSON.parse(JSON.stringify(r.oldSchedule)) : null,
          after_snapshot: JSON.parse(JSON.stringify(r.parsedSchedule)),
          notes: `Match: ${r.confidence} | Source: "${r.sourceName}" → "${r.sourceSchedule}"`,
        }));

      if (auditEntries.length > 0) {
        await supabase.from("leave_audit_log").insert(auditEntries);
      }
    } catch {
      // Audit logging is best-effort
    }

    setResults({ updated, skipped, errors });
    setStep("done");
    setApplying(false);
    qc.invalidateQueries({ queryKey: ["all-profiles"] });
    qc.invalidateQueries({ queryKey: ["schedule-import-profiles"] });
    toast.success(`Updated ${updated} schedules.${skipped ? ` ${skipped} skipped.` : ""}`);
  }, [autoUpdateRows, user, qc]);

  const handleReset = () => {
    setRawInput("");
    setRows([]);
    setStep("input");
    setResults({ updated: 0, skipped: 0, errors: [] });
  };

  // ─── Step 1: Input ────────────────────────────────────────
  if (step === "input") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Import Employee Schedules
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Paste employee names and schedules below. Supports tab-separated or "Name  Schedule" format.
            Each line should contain an employee name followed by their schedule (e.g., "9:00 AM - 6:00 PM" or "FLEXI").
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            placeholder={`Example:\nJohn Doe\t9:00 AM - 6:00 PM\nJane Smith\tFLEXI\nMark Johnson\t4:00 PM - 1:00 AM`}
            className="min-h-[220px] font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button onClick={handleParse} disabled={!rawInput.trim() || !profiles} className="gap-1.5">
              <ClipboardPaste className="h-4 w-4" /> Parse & Preview
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Step 2: Preview ──────────────────────────────────────
  if (step === "preview") {
    return (
      <div className="space-y-4">
        {/* Summary */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{autoUpdateRows.length}</span>
                <span className="text-muted-foreground">ready to update</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="font-medium">{manualReviewRows.length}</span>
                <span className="text-muted-foreground">need manual review</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                Total: {rows.length} rows parsed
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auto-update table */}
        {autoUpdateRows.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Will Auto-Update ({autoUpdateRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Source Name</TableHead>
                      <TableHead className="text-xs">Matched To</TableHead>
                      <TableHead className="text-xs">Confidence</TableHead>
                      <TableHead className="text-xs">Old Schedule</TableHead>
                      <TableHead className="text-xs">New Schedule</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {autoUpdateRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium py-2">{r.sourceName}</TableCell>
                        <TableCell className="text-xs py-2">{r.matchedProfileName ?? "—"}</TableCell>
                        <TableCell className="py-2"><ConfidenceBadge c={r.confidence} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">
                          {r.oldSchedule?.schedule_type === "flexible" ? "Flexible" :
                            r.oldSchedule?.work_start_time ? `${formatTime12(r.oldSchedule.work_start_time)} – ${formatTime12(r.oldSchedule.work_end_time)}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs font-medium py-2">{formatScheduleShort(r.parsedSchedule)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Manual review table */}
        {manualReviewRows.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-600 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Manual Review Required ({manualReviewRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Source Name</TableHead>
                      <TableHead className="text-xs">Schedule</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualReviewRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium py-2">{r.sourceName}</TableCell>
                        <TableCell className="text-xs py-2">{r.sourceSchedule}</TableCell>
                        <TableCell className="py-2"><ConfidenceBadge c={r.confidence} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2 max-w-[250px] truncate">{r.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleApply} disabled={applying || autoUpdateRows.length === 0} className="gap-1.5">
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {applying ? "Applying..." : `Apply ${autoUpdateRows.length} Updates`}
          </Button>
          <Button variant="outline" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> Start Over
          </Button>
        </div>
      </div>
    );
  }

  // ─── Step 3: Done ─────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
          <h3 className="font-semibold text-lg">Import Complete</h3>
          <div className="flex justify-center gap-6 text-sm">
            <div><span className="font-bold text-emerald-700">{results.updated}</span> updated</div>
            <div><span className="font-bold text-muted-foreground">{results.skipped}</span> skipped</div>
          </div>
          {results.errors.length > 0 && (
            <div className="text-xs text-red-600 space-y-1 mt-2">
              {results.errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </CardContent>
      </Card>

      {manualReviewRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-orange-600 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Still Needs Manual Update ({manualReviewRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Source Name</TableHead>
                    <TableHead className="text-xs">Schedule</TableHead>
                    <TableHead className="text-xs">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manualReviewRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium py-2">{r.sourceName}</TableCell>
                      <TableCell className="text-xs py-2">{r.sourceSchedule}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">{r.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Button variant="outline" onClick={handleReset} className="gap-1.5">
        <RotateCcw className="h-4 w-4" /> Import Another Batch
      </Button>
    </div>
  );
}
