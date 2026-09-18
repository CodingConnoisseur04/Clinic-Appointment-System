import type { SupabaseClient } from "@supabase/supabase-js";

export type ClinicSettings = {
  receptionist_phone: string;
  // Whole pesos, prefilled into every payment dialog. Seeded to "500" in the
  // migration; the clinic changes it in Settings.
  consultation_fee: string;
};

/*
 * The seed value shipped in the local database. It is obviously not a real
 * number, so anything reading it can tell the clinic has not set its line yet
 * and say so, rather than publishing a fake number as if it were real.
 */
export const PLACEHOLDER_PHONE = "(088) 000-0000";

const DEFAULTS: ClinicSettings = {
  receptionist_phone: PLACEHOLDER_PHONE,
  consultation_fee: "500",
};

export function isPlaceholderPhone(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === PLACEHOLDER_PHONE || /^\D*0{3}\D*0{4}\D*$/.test(trimmed);
}

export async function getClinicSettings(
  supabase: SupabaseClient
): Promise<ClinicSettings> {
  const { data, error } = await supabase
    .from("clinic_settings")
    .select("key, value");
  if (error || !data) return { ...DEFAULTS };

  const map = new Map<string, string>(
    data.map((row: { key: string; value: string }) => [row.key, row.value])
  );
  return {
    receptionist_phone: map.get("receptionist_phone") ?? DEFAULTS.receptionist_phone,
    consultation_fee: map.get("consultation_fee") ?? DEFAULTS.consultation_fee,
  };
}

export async function upsertClinicSetting(
  supabase: SupabaseClient,
  key: string,
  value: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("clinic_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
