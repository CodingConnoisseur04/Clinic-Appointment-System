"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AppointmentRow = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  source: "online" | "walk_in";
  reason: string | null;
  attendance: "ATTENDED" | "NO_SHOW" | null;
  payment_method: "cash" | "gcash" | null;
  payment_reference: string | null;
  payment_amount: number | null;
  discount_amount: number | null;
  created_at: string;
  patients: { id: string; full_name: string; phone: string; is_senior_pwd: boolean | null } | null;
};

export function useAppointments() {
  const supabase = createClient();
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAppointments = useCallback(async () => {
    const { data } = await supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, status, source, reason, attendance, payment_method, payment_reference, payment_amount, discount_amount, created_at, patients(id, full_name, phone, is_senior_pwd)"
      )
      .order("appointment_date")
      .order("appointment_time");
    return (data ?? []) as unknown as AppointmentRow[];
  }, [supabase]);

  const refresh = useCallback(async () => {
    setAppointments(await fetchAppointments());
  }, [fetchAppointments]);

  useEffect(() => {
    let cancelled = false;
    fetchAppointments().then((rows) => {
      if (!cancelled) {
        setAppointments(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAppointments]);

  return { appointments, loading, refresh, supabase };
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
