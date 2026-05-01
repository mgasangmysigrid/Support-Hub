import { useState, useCallback, useRef, useEffect, useMemo, forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { X, Image as ImageIcon } from "lucide-react";

interface PastedImage {
  id: string;
  file: File;
  previewUrl: string;
}

export interface MentionUser {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface PasteableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  pastedImages: PastedImage[];
  onPastedImagesChange: (images: PastedImage[]) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  required?: boolean;
  id?: string;
  mentionUsers?: MentionUser[];
}

export type { PastedImage };

export const PasteableTextarea = forwardRef<HTMLTextAreaElement, PasteableTextareaProps>(function PasteableTextarea({
  value,
  onChange,
  pastedImages,
  onPastedImagesChange,
  placeholder,
  rows = 5,
  className,
  required,
  id,
  mentionUsers = [],
}, _ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const filteredUsers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim().toLowerCase();
    return mentionUsers.filter((u) => {
      const fullName = u.full_name?.trim().toLowerCase() ?? "";
      const email = u.email?.trim().toLowerCase() ?? "";
      return fullName.includes(q) || email.includes(q);
    }).slice(0, 8);
  }, [mentionQuery, mentionUsers]);

  const showDropdown = mentionQuery !== null && filteredUsers.length > 0;

  const insertMention = useCallback(
    (user: MentionUser) => {
      const firstName = (user.full_name || user.email || "user").split(" ")[0];
      // mentionStartPos points to right after the @, so slice before the @ (mentionStartPos - 1)
      const before = value.slice(0, mentionStartPos - 1);
      const after = value.slice(textareaRef.current?.selectionStart ?? mentionStartPos);
      const newValue = `${before}@${firstName} ${after}`;
      onChange(newValue);
      setMentionQuery(null);
      
      setTimeout(() => {
        const pos = mentionStartPos - 1 + firstName.length + 2; // @ + firstName + space
        textareaRef.current?.setSelectionRange(pos, pos);
        textareaRef.current?.focus();
      }, 0);
    },
    [value, onChange, mentionStartPos]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const cursorPos = e.target.selectionStart;
      // Check if we're in a mention context
      const textBefore = newValue.slice(0, cursorPos);
      const atMatch = textBefore.match(/@([^\s@]*)$/);

      if (atMatch) {
        setMentionQuery(atMatch[1]);
        setMentionStartPos(cursorPos - atMatch[1].length);
        setMentionIndex(0);

        // Position dropdown
        if (textareaRef.current) {
          const rect = textareaRef.current.getBoundingClientRect();
          // Approximate position - bottom of textarea
          setDropdownPos({
            top: rect.height + 4,
            left: 0,
          });
        }
      } else {
        setMentionQuery(null);
      }
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showDropdown) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredUsers.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredUsers[mentionIndex]) {
          insertMention(filteredUsers[mentionIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
      }
    },
    [showDropdown, filteredUsers, mentionIndex, insertMention]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) return;
      e.preventDefault();

      const newImages: PastedImage[] = imageFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      onPastedImagesChange([...pastedImages, ...newImages]);
    },
    [pastedImages, onPastedImagesChange]
  );

  const removeImage = useCallback(
    (imageId: string) => {
      const img = pastedImages.find((i) => i.id === imageId);
      if (img) URL.revokeObjectURL(img.previewUrl);
      onPastedImagesChange(pastedImages.filter((i) => i.id !== imageId));
    },
    [pastedImages, onPastedImagesChange]
  );

  // Close dropdown on click outside
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMentionQuery(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={rows}
          className={className}
          required={required}
        />
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-64 rounded-md border bg-popover shadow-lg"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <div className="py-1 max-h-48 overflow-y-auto">
              {filteredUsers.map((user, i) => (
                <button
                  key={user.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm flex flex-col hover:bg-accent transition-colors ${
                    i === mentionIndex ? "bg-accent" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(user);
                  }}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  <span className="font-medium text-foreground">{user.full_name || "Unnamed"}</span>
                  {user.email && (
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {pastedImages.length > 0 && (
        <div className="space-y-3">
          {pastedImages.map((img) => (
            <div key={img.id} className="relative group rounded-lg border overflow-hidden">
              <img
                src={img.previewUrl}
                alt="Pasted"
                className="w-full max-h-[400px] object-contain bg-muted/30"
              />
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="absolute top-2 right-2 bg-background/90 border rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {pastedImages.length === 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <ImageIcon className="h-3 w-3" />
          You can paste images or type @ to mention
        </p>
      )}
    </div>
  );
});
