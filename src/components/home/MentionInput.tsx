import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  storageToDisplay,
  displayToStorage,
  rebuildMappings,
  type MentionMapping,
} from "@/lib/mention-utils";

/**
 * ZWJ (Zero-Width Joiner, U+200D) is used as an invisible boundary marker
 * around mention names in the textarea. Users see plain "@Name" while the
 * code can precisely detect mention boundaries for storage conversion.
 *
 * This is an INTERIM solution. A proper rich mention editor (TipTap/Slate/Lexical)
 * should replace this textarea approach for inline styled mention chips.
 * See mention-utils.tsx header comment for full rationale and risks.
 */
const ZWJ = "\u200D";

interface Props {
  /** Value in storage format: @[Name](uuid) */
  value: string;
  /** Called with storage format on every change */
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  showEveryone?: boolean;
}

export default function MentionInput({ value, onChange, placeholder, className, rows = 1, showEveryone = false }: Props) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [search, setSearch] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Internal display text (with ZWJ markers) and ordered mention mappings
  const [displayText, setDisplayText] = useState("");
  const [mappings, setMappings] = useState<MentionMapping[]>([]);
  // Track the last storage value we synced from, to avoid re-parsing our own emissions
  const lastStorageRef = useRef(value);

  // Sync from external storage value → internal display (e.g. parent reset, edit load)
  useEffect(() => {
    if (value !== lastStorageRef.current) {
      const { display, mappings: newMappings } = storageToDisplay(value);
      setDisplayText(display);
      setMappings(newMappings);
      lastStorageRef.current = value;
    }
  }, [value]);

  // Initialize on mount
  useEffect(() => {
    const { display, mappings: newMappings } = storageToDisplay(value);
    setDisplayText(display);
    setMappings(newMappings);
    lastStorageRef.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: users = [] } = useQuery({
    queryKey: ["mention-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, profile_photo_url, job_title")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60000,
  });

  const everyoneMatch = showEveryone && (!search || "everyone".startsWith(search.toLowerCase()));

  const filtered = search
    ? users.filter((u) =>
        u.full_name?.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : users.slice(0, 8);

  const emitStorage = useCallback((newDisplay: string, newMappings: MentionMapping[]) => {
    const storage = displayToStorage(newDisplay, newMappings);
    lastStorageRef.current = storage;
    onChange(storage);
  }, [onChange]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      const pos = e.target.selectionStart ?? 0;
      setDisplayText(val);
      setCursorPos(pos);

      // Rebuild mappings: drop any whose ZWJ boundaries were broken by editing
      const newMappings = rebuildMappings(val, mappings);
      setMappings(newMappings);
      emitStorage(val, newMappings);

      // Detect @ trigger for suggestion dropdown
      const textBefore = val.slice(0, pos);
      const lastAt = textBefore.lastIndexOf("@");
      if (lastAt >= 0) {
        const charBefore = lastAt > 0 ? textBefore[lastAt - 1] : " ";
        if (charBefore === " " || charBefore === "\n" || lastAt === 0) {
          const searchText = textBefore.slice(lastAt + 1);
          // Don't open picker if cursor is inside a ZWJ-bounded mention
          if (!searchText.includes(ZWJ) && (!searchText.includes(" ") || searchText.length <= 30)) {
            setMentionStart(lastAt);
            setSearch(searchText);
            setShowSuggestions(true);
            return;
          }
        }
      }
      setShowSuggestions(false);
    },
    [emitStorage, mappings]
  );

  const selectUser = useCallback(
    (user: { id: string; full_name: string | null }) => {
      const name = user.full_name ?? "Unknown";
      const before = displayText.slice(0, mentionStart);
      const after = displayText.slice(cursorPos);
      // Insert ZWJ-bounded mention — invisible to user, shows as @Name
      const displayMention = `@${ZWJ}${name}${ZWJ} `;
      const newDisplay = before + displayMention + after;

      // Append mapping entry (order matters for duplicate name resolution)
      const newMappings = [...mappings, { displayName: name, userId: user.id }];

      setDisplayText(newDisplay);
      setMappings(newMappings);
      setShowSuggestions(false);
      emitStorage(newDisplay, newMappings);

      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = before.length + displayMention.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    },
    [displayText, mentionStart, cursorPos, mappings, emitStorage]
  );

  const selectEveryone = useCallback(() => {
    const before = displayText.slice(0, mentionStart);
    const after = displayText.slice(cursorPos);
    const mention = `@everyone `;
    const newDisplay = before + mention + after;
    setDisplayText(newDisplay);
    setShowSuggestions(false);
    emitStorage(newDisplay, mappings);

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + mention.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [displayText, mentionStart, cursorPos, mappings, emitStorage]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    if (showSuggestions) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSuggestions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setShowSuggestions(false);
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={displayText}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn("resize-none", className)}
        rows={rows}
      />
      {showSuggestions && (everyoneMatch || filtered.length > 0) && (
        <div
          ref={suggestionsRef}
          className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          {everyoneMatch && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors border-b border-border"
              onMouseDown={(e) => {
                e.preventDefault();
                selectEveryone();
              }}
            >
              <span className="h-5 w-5 flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-[10px] font-bold">@</span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-destructive">@everyone</div>
                <div className="text-[10px] text-muted-foreground">Notify all employees</div>
              </div>
            </button>
          )}
          {filtered.map((u) => {
            const initials = (u.full_name ?? "?")
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return (
              <button
                key={u.id}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectUser(u);
                }}
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={u.profile_photo_url ?? undefined} />
                  <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{u.full_name}</div>
                  {u.job_title && (
                    <div className="text-[10px] text-muted-foreground truncate">{u.job_title}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
