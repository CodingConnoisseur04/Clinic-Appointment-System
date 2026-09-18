"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { setPatientSeniorPwd } from "@/lib/patients/update-senior-flag";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/*
 * The senior/PWD priority mark. Gold is this design system's mark for
 * money-and-next-action; the priority lane is both (a discount and a
 * queue-visible flag), so it wears the same stamped .mark treatment as the
 * status marks rather than inventing a new visual. Badge-only by decision:
 * it changes what the desk SEES, never the queue order or slot rules.
 */
export function SeniorPwdMark({ className }: { className?: string }) {
  return (
    <span className={cn("mark mark-pending", className)}>Senior/PWD</span>
  );
}

/*
 * Row-level control: the gold mark when the patient is flagged, plus the
 * switch that flips the flag on the patient's RECORD (not the appointment —
 * the flag is a fact about the person). Optimistic: the switch moves at once
 * and reverts with an error toast if RLS refuses the write. The desk sees the
 * result; no success toast, the flipped state is the feedback.
 */
export function SeniorPwdToggle({
  patientId,
  flagged,
  onChanged,
  className,
}: {
  patientId: string | null | undefined;
  flagged: boolean;
  onChanged?: () => void | Promise<void>;
  className?: string;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    if (!patientId) return;
    setBusy(true);
    const result = await setPatientSeniorPwd(supabase, patientId, next);
    setBusy(false);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    await onChanged?.();
  }

  // The switch shows the ROW's flag, not local state: the write succeeds
  // first, the parent refetches (onChanged), and the fresh prop flips it.
  // No optimistic mirror to fall out of sync with the record.
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {flagged && <SeniorPwdMark />}
      <Switch
        size="sm"
        checked={flagged}
        disabled={busy || !patientId}
        onCheckedChange={(checked) => void toggle(checked === true)}
        aria-label="Senior/PWD priority"
      />
    </span>
  );
}
