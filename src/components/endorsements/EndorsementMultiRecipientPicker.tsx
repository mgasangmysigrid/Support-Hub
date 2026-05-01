import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Search, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function EndorsementMultiRecipientPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

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

  const filtered = (employees || []).filter((emp) => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      emp.full_name?.toLowerCase().includes(term) ||
      emp.email?.toLowerCase().includes(term)
    );
  });

  const selectedEmployees = (employees || []).filter((e) =>
    value.includes(e.id)
  );

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const remove = (id: string) => {
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div className="space-y-2">
      {selectedEmployees.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedEmployees.map((emp) => (
            <Badge
              key={emp.id}
              variant="secondary"
              className="flex items-center gap-1 pl-2 pr-1 py-0.5"
            >
              <span className="text-xs">{emp.full_name || emp.email}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(emp.id)}
                  className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start text-muted-foreground font-normal"
            >
              <Search className="h-3.5 w-3.5 mr-2" />
              {value.length === 0 ? "Select employees..." : "Add more..."}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <ScrollArea className="max-h-[200px]">
              <div className="p-1">
                {filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    No employees found
                  </p>
                )}
                {filtered.map((emp) => {
                  const selected = value.includes(emp.id);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => toggle(emp.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                    >
                      <div
                        className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                          selected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-input"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </div>
                      <span className="truncate">
                        {emp.full_name || emp.email}
                      </span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
