import React from "react";
import type { NavigateFunction } from "react-router-dom";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MENTION SYSTEM — Storage & Display Format
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * STORAGE FORMAT (persisted in DB):
 *   @[Full Name](uuid)
 *   Example: @[James Fuentes](4bed9087-f506-4ffd-9e0c-7347906629f3)
 *
 * DISPLAY FORMAT (shown in textarea during editing):
 *   @‍Full Name‍   (ZWJ-bounded — invisible to user, appears as "@Full Name")
 *
 * WHY ZWJ (Zero-Width Joiner, U+200D)?
 *   HTML textareas cannot render rich text, so we need invisible boundary
 *   markers to distinguish a mention token from plain text that happens to
 *   start with "@". ZWJ is:
 *     - invisible in all fonts/platforms
 *     - safe in textarea (doesn't affect layout or line breaks)
 *     - unlikely to be typed by users accidentally
 *
 * RISKS / LIMITATIONS:
 *   - If a user copy-pastes mention text from another source, ZWJ markers
 *     will be missing and the text becomes plain (graceful degradation).
 *   - If a user partially edits inside a ZWJ-bounded token (e.g. deletes
 *     one character from the name), the mention structure breaks and
 *     `rebuildMappings` drops it — it becomes plain text. This is by design.
 *   - Orphaned ZWJ characters (unpaired markers) are cleaned on save via
 *     `sanitizeOrphanedZwj`.
 *   - Screen readers may behave slightly differently with ZWJ. No known
 *     issues in practice, but worth monitoring.
 *
 * FUTURE:
 *   This is an INTERIM textarea-safe solution. The proper long-term fix is
 *   to replace <textarea> with a contenteditable / rich-text mention editor
 *   (e.g. TipTap, Slate, or Lexical) which can render styled mention chips
 *   inline. The storage format (@[Name](uuid)) should remain unchanged so
 *   migration is seamless.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Mention format: @[Name](userId)
const MENTION_REGEX = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g;

// Zero-width joiner used as invisible boundary markers around mention names.
const ZWJ = "\u200D";

// Regex source for matching ZWJ-bounded display mentions: @‍Name‍
const DISPLAY_MENTION_REGEX_SRC = `@${ZWJ}([^${ZWJ}]+)${ZWJ}`;

/**
 * Extract mentioned user IDs from storage-format text.
 */
export function extractMentionIds(text: string): string[] {
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(MENTION_REGEX.source, "g");
  while ((match = regex.exec(text)) !== null) {
    if (!ids.includes(match[2])) ids.push(match[2]);
  }
  return ids;
}

/**
 * Check if text contains @everyone
 */
export function hasEveryoneMention(text: string): boolean {
  return /@everyone\b/i.test(text);
}

/**
 * Strip @everyone from text (for unauthorized users)
 */
export function stripEveryone(text: string): string {
  return text.replace(/@everyone\b/gi, "everyone");
}

// ─── Display ↔ Storage conversion ────────────────────────────────────────

export interface MentionMapping {
  displayName: string;
  userId: string;
}

/**
 * Remove orphaned ZWJ characters that aren't part of a valid mention pair.
 * This prevents malformed hidden markers from leaking into storage.
 */
export function sanitizeOrphanedZwj(text: string): string {
  // First, temporarily protect valid ZWJ-bounded mentions
  const validMentionRegex = new RegExp(DISPLAY_MENTION_REGEX_SRC, "g");
  const placeholders: string[] = [];
  let sanitized = text.replace(validMentionRegex, (match) => {
    placeholders.push(match);
    return `\x00MENTION_${placeholders.length - 1}\x00`;
  });

  // Strip all remaining orphaned ZWJ characters
  sanitized = sanitized.replace(/\u200D/g, "");

  // Restore valid mentions
  sanitized = sanitized.replace(/\x00MENTION_(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]);

  return sanitized;
}

/**
 * Convert storage format `@[Name](uuid)` → display format with invisible ZWJ markers.
 * Users see "@Name" in the textarea. Returns ordered mappings for reconversion.
 *
 * Each mention occurrence produces its own mapping entry (even for the same user),
 * so that duplicate names or repeated mentions of the same user are handled correctly
 * via ordered consumption in `displayToStorage`.
 */
export function storageToDisplay(text: string): { display: string; mappings: MentionMapping[] } {
  const mappings: MentionMapping[] = [];
  const display = text.replace(new RegExp(MENTION_REGEX.source, "g"), (_match, name, userId) => {
    // Push one entry per occurrence (not deduplicated — order matters)
    mappings.push({ displayName: name, userId });
    return `@${ZWJ}${name}${ZWJ}`;
  });
  return { display, mappings };
}

/**
 * Convert display format (ZWJ-bounded mentions) → storage format using ordered mappings.
 *
 * Uses ordered consumption: each display mention consumes the next available mapping
 * entry with the same name. This correctly handles:
 *   - Two different users with identical names (different IDs)
 *   - Same user mentioned multiple times
 *   - Mentions deleted by the user (mapping entries left unconsumed)
 */
export function displayToStorage(displayText: string, mappings: MentionMapping[]): string {
  const consumed = new Set<number>();

  // First, convert valid ZWJ mentions to storage format
  let result = displayText.replace(new RegExp(DISPLAY_MENTION_REGEX_SRC, "g"), (_match, name) => {
    const idx = mappings.findIndex((m, i) => !consumed.has(i) && m.displayName === name);
    if (idx >= 0) {
      consumed.add(idx);
      return `@[${mappings[idx].displayName}](${mappings[idx].userId})`;
    }
    // No mapping → plain text (graceful degradation)
    return `@${name}`;
  });

  // Clean any orphaned ZWJ that might remain after partial edits
  result = result.replace(/\u200D/g, "");

  return result;
}

/**
 * Scan display text for intact ZWJ-bounded mentions and return matching mappings.
 * Used after every keystroke to keep mappings in sync with what's actually in the text.
 *
 * If a user partially deletes a mention (breaking the ZWJ boundary), its mapping
 * is dropped and the text becomes plain — this is intentional.
 */
export function rebuildMappings(newDisplay: string, currentMappings: MentionMapping[]): MentionMapping[] {
  const mentionRegex = new RegExp(DISPLAY_MENTION_REGEX_SRC, "g");
  const foundMentions: MentionMapping[] = [];
  const consumed = new Set<number>();
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(newDisplay)) !== null) {
    const name = match[1];
    const idx = currentMappings.findIndex((m, i) => !consumed.has(i) && m.displayName === name);
    if (idx >= 0) {
      consumed.add(idx);
      foundMentions.push(currentMappings[idx]);
    }
    // If no mapping found for an intact ZWJ mention, it's orphaned — skip it
  }
  return foundMentions;
}

/**
 * Render storage-format text with highlighted, clickable mention badges.
 * Used in read-only display (comment bodies, post content).
 */
export function renderMentionText(
  text: string,
  navigate?: NavigateFunction
): React.ReactNode[] {
  const regex = new RegExp(MENTION_REGEX.source, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <React.Fragment key={`t-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </React.Fragment>
      );
    }
    const name = match[1];
    const userId = match[2];
    parts.push(
      <span
        key={`m-${match.index}`}
        className="inline-flex items-center px-1 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium cursor-pointer hover:bg-primary/20 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          navigate?.(`/profile/${userId}`);
        }}
      >
        @{name}
      </span>
    );
    lastIndex = regex.lastIndex;
  }

  // Remaining text — handle @everyone badges
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    const everyoneRegex = /@everyone\b/gi;
    let evMatch: RegExpExecArray | null;
    let evLast = 0;
    const evParts: React.ReactNode[] = [];
    while ((evMatch = everyoneRegex.exec(remaining)) !== null) {
      if (evMatch.index > evLast) {
        evParts.push(
          <React.Fragment key={`ev-t-${lastIndex + evLast}`}>
            {remaining.slice(evLast, evMatch.index)}
          </React.Fragment>
        );
      }
      evParts.push(
        <span
          key={`ev-${lastIndex + evMatch.index}`}
          className="inline-flex items-center px-1 py-0.5 rounded bg-destructive/10 text-destructive text-xs font-medium"
        >
          @everyone
        </span>
      );
      evLast = everyoneRegex.lastIndex;
    }
    if (evParts.length > 0) {
      if (evLast < remaining.length) {
        evParts.push(
          <React.Fragment key={`ev-end-${lastIndex + evLast}`}>
            {remaining.slice(evLast)}
          </React.Fragment>
        );
      }
      parts.push(...evParts);
    } else {
      parts.push(
        <React.Fragment key={`end-${lastIndex}`}>
          {remaining}
        </React.Fragment>
      );
    }
  }

  return parts;
}
