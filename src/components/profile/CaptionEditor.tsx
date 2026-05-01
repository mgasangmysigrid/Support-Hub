import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Hash } from "lucide-react";
import { Link } from "react-router-dom";

interface MentionUser {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface CaptionEditorProps {
  value: string;
  onChange: (value: string, taggedUserIds: string[]) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}

const HASHTAG_REGEX = /#([a-zA-Z0-9]{1,20})/g;
const MAX_HASHTAGS = 3;

/** Extract hashtags from caption text */
export function extractHashtags(text: string): string[] {
  const matches = text.match(HASHTAG_REGEX) || [];
  const tags = matches.map((m) => m.slice(1).toLowerCase());
  // Deduplicate
  return [...new Set(tags)].slice(0, MAX_HASHTAGS);
}

/** Validate a single hashtag (no # prefix) */
export function isValidHashtag(tag: string): boolean {
  return /^[a-zA-Z0-9]{1,20}$/.test(tag);
}

export default function CaptionEditor({ value, onChange, onSave, onCancel, saving }: CaptionEditorProps) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [hashtagQuery, setHashtagQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);

  const currentHashtags = useMemo(() => extractHashtags(value), [value]);
  const hashtagLimitReached = currentHashtags.length >= MAX_HASHTAGS;

  const { data: users = [] } = useQuery<MentionUser[]>({
    queryKey: ["caption-mention-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch trending hashtags for suggestions
  const { data: trendingTags = [] } = useQuery<string[]>({
    queryKey: ["hashtag-suggestions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("photo_hashtags")
        .select("tag");
      if (error) throw error;
      // Count occurrences
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.tag] = (counts[row.tag] || 0) + 1;
      }
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([tag]) => tag);
    },
  });

  const filteredUsers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return users
      .filter((u) => u.id !== user?.id)
      .filter((u) => {
        const name = u.full_name?.toLowerCase() ?? "";
        const email = u.email?.toLowerCase() ?? "";
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 6);
  }, [mentionQuery, users, user?.id]);

  const filteredHashtags = useMemo(() => {
    if (hashtagQuery === null || hashtagLimitReached) return [];
    const q = hashtagQuery.toLowerCase();
    return trendingTags
      .filter((t) => t.includes(q) && !currentHashtags.includes(t))
      .slice(0, 6);
  }, [hashtagQuery, trendingTags, currentHashtags, hashtagLimitReached]);

  const showMentionDropdown = mentionQuery !== null && filteredUsers.length > 0;
  const showHashtagDropdown = hashtagQuery !== null && filteredHashtags.length > 0 && !hashtagLimitReached;
  const showDropdown = showMentionDropdown || showHashtagDropdown;

  const extractTaggedIds = useCallback((text: string) => {
    const mentions = text.match(/@\[([^\]]+)\]\(([^)]+)\)/g) || [];
    return mentions.map((m) => {
      const match = m.match(/@\[([^\]]+)\]\(([^)]+)\)/);
      return match?.[2] ?? "";
    }).filter(Boolean);
  }, []);

  const insertMention = useCallback((mu: MentionUser) => {
    const displayName = mu.full_name || mu.email || "user";
    const before = value.slice(0, mentionStartPos - 1);
    const after = value.slice(inputRef.current?.selectionStart ?? mentionStartPos);
    const mention = `@[${displayName}](${mu.id})`;
    const newValue = `${before}${mention} ${after}`;
    const taggedIds = extractTaggedIds(newValue);
    onChange(newValue, taggedIds);
    setMentionQuery(null);
    setHashtagQuery(null);
    setTimeout(() => {
      const pos = before.length + mention.length + 1;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    }, 0);
  }, [value, mentionStartPos, onChange, extractTaggedIds]);

  const insertHashtag = useCallback((tag: string) => {
    const before = value.slice(0, mentionStartPos - 1);
    const after = value.slice(inputRef.current?.selectionStart ?? mentionStartPos);
    const hashtag = `#${tag}`;
    const newValue = `${before}${hashtag} ${after}`;
    const taggedIds = extractTaggedIds(newValue);
    onChange(newValue, taggedIds);
    setHashtagQuery(null);
    setMentionQuery(null);
    setTimeout(() => {
      const pos = before.length + hashtag.length + 1;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    }, 0);
  }, [value, mentionStartPos, onChange, extractTaggedIds]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const taggedIds = extractTaggedIds(newValue);
    onChange(newValue, taggedIds);
    const cursorPos = e.target.selectionStart ?? 0;
    const textBefore = newValue.slice(0, cursorPos);

    // Check for @ mention
    const atMatch = textBefore.match(/@([^\s@\[\]()]*)$/);
    // Check for # hashtag
    const hashMatch = textBefore.match(/#([a-zA-Z0-9]{0,20})$/);

    if (atMatch && !hashMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStartPos(cursorPos - atMatch[1].length);
      setMentionIndex(0);
      setHashtagQuery(null);
    } else if (hashMatch) {
      setHashtagQuery(hashMatch[1]);
      setMentionStartPos(cursorPos - hashMatch[1].length);
      setMentionIndex(0);
      setMentionQuery(null);
    } else {
      setMentionQuery(null);
      setHashtagQuery(null);
    }
  }, [onChange, extractTaggedIds]);

  const dropdownItems = showMentionDropdown ? filteredUsers : filteredHashtags;

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => Math.min(i + 1, dropdownItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (showMentionDropdown && filteredUsers[mentionIndex]) {
        insertMention(filteredUsers[mentionIndex]);
      } else if (showHashtagDropdown && filteredHashtags[mentionIndex]) {
        insertHashtag(filteredHashtags[mentionIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMentionQuery(null);
      setHashtagQuery(null);
    }
  }, [showDropdown, showMentionDropdown, showHashtagDropdown, filteredUsers, filteredHashtags, mentionIndex, insertMention, insertHashtag, dropdownItems.length]);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMentionQuery(null);
        setHashtagQuery(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  return (
    <div className="relative">
      {/* Hashtag counter */}
      {currentHashtags.length > 0 && (
        <div className="flex items-center gap-1 mb-1.5 flex-wrap">
          {currentHashtags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
              <Hash className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
          <span className="text-[10px] text-muted-foreground">
            {currentHashtags.length}/{MAX_HASHTAGS}
          </span>
        </div>
      )}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Add a caption… Use @ to tag, # for hashtags"
            className="h-7 text-xs"
            maxLength={200}
          />
          {showDropdown && (
            <div
              ref={dropdownRef}
              className="absolute bottom-full left-0 mb-1 z-50 w-56 rounded-md border bg-popover shadow-lg"
            >
              <div className="py-1 max-h-40 overflow-y-auto">
                {showMentionDropdown && filteredUsers.map((mu, i) => (
                  <button
                    key={mu.id}
                    type="button"
                    className={`w-full text-left px-3 py-1.5 text-xs flex flex-col hover:bg-accent transition-colors ${
                      i === mentionIndex ? "bg-accent" : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(mu);
                    }}
                    onMouseEnter={() => setMentionIndex(i)}
                  >
                    <span className="font-medium text-foreground">
                      {mu.full_name || "Unnamed"}
                    </span>
                    {mu.email && (
                      <span className="text-[10px] text-muted-foreground">{mu.email}</span>
                    )}
                  </button>
                ))}
                {showHashtagDropdown && filteredHashtags.map((tag, i) => (
                  <button
                    key={tag}
                    type="button"
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-accent transition-colors ${
                      i === mentionIndex ? "bg-accent" : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertHashtag(tag);
                    }}
                    onMouseEnter={() => setMentionIndex(i)}
                  >
                    <Hash className="h-3 w-3 text-primary" />
                    <span className="font-medium text-foreground">{tag}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button size="sm" className="h-7 px-2 text-xs" onClick={onSave} disabled={saving}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancel}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/** Render caption text with clickable @mentions and #hashtags */
export function RenderCaption({ text }: { text: string }) {
  // Split on @mentions and #hashtags
  const parts = text.split(/(@\[[^\]]+\]\([^)]+\)|#[a-zA-Z0-9]{1,20})/g);
  return (
    <>
      {parts.map((part, i) => {
        // Check for @mention
        const mentionMatch = part.match(/@\[([^\]]+)\]\(([^)]+)\)/);
        if (mentionMatch) {
          const [, displayName, userId] = mentionMatch;
          return (
            <a
              key={i}
              href={`/profile/${userId}`}
              className="text-primary font-medium hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{displayName}
            </a>
          );
        }
        // Check for #hashtag
        const hashtagMatch = part.match(/^#([a-zA-Z0-9]{1,20})$/);
        if (hashtagMatch) {
          const tag = hashtagMatch[1].toLowerCase();
          return (
            <Link
              key={i}
              to={`/?hashtag=${tag}`}
              className="text-primary font-medium hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
