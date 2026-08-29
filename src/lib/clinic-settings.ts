import type { SupabaseClient } from "@supabase/supabase-js";

export type ClinicSettings = {
  receptionist_phone: string;
};

const DEFAULTS: ClinicSettings = {
  receptionist_phone: "(088) 000-0000",
};

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
