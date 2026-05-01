import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import React from "react";

export function ReadOnlyFieldStatic({ label, value, icon: Icon }: { label: string; value: string | null; icon?: React.ElementType }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </Label>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

export function EditableFieldInput({
  label,
  field,
  icon: Icon,
  type = "text",
  form,
  setForm,
}: {
  label: string;
  field: string;
  icon?: React.ElementType;
  type?: string;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </Label>
      <Input
        type={type}
        value={form[field] ?? ""}
        onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
        className="h-9 text-sm"
      />
    </div>
  );
}
