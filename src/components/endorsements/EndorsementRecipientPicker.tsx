import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function EndorsementRecipientPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const { data: employees } = useQuery({
    queryKey: ["active-employees-endorsement"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      return data || [];
    },
    staleTime: 60000,
  });

  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(v === "none" ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select employee" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— Not assigned —</SelectItem>
        {(employees || []).map((emp) => (
          <SelectItem key={emp.id} value={emp.id}>
            {emp.full_name || emp.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
