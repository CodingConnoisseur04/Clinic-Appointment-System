import type { SupabaseClient } from "@supabase/supabase-js";

type CsvRow = {
  date: string;
  time: string;
  patient_name: string;
  patient_phone: string;
  senior_pwd: string;
  source: string;
  status: string;
  reason: string;
  attendance: string;
  payment_method: string;
  payment_amount: string;
  discount_amount: string;
  payment_reference: string;
};

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function downloadAppointmentCsv(
  supabase: SupabaseClient,
  range: { from: string; to: string }
): Promise<void> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "appointment_date, appointment_time, status, source, reason, attendance, payment_method, payment_amount, discount_amount, payment_reference, patients(full_name, phone, is_senior_pwd)"
    )
    .gte("appointment_date", range.from)
    .lte("appointment_date", range.to)
    .order("appointment_date")
    .order("appointment_time");

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to fetch appointments");
  }

  const headers = [
    "Date",
    "Time",
    "Patient",
    "Phone",
    "Senior/PWD",
    "Source",
    "Status",
    "Reason",
    "Attendance",
    "Payment Method",
    "Fee (PHP)",
    "Discount (PHP)",
    "Payment Reference",
  ];

  const rows: CsvRow[] = (data as unknown as Record<string, unknown>[]).map(
    (row) => {
      const patient = row.patients as
        | { full_name: string | null; phone: string | null; is_senior_pwd: boolean | null }
        | null;
      return {
        date: String(row.appointment_date ?? ""),
        time: String(row.appointment_time ?? ""),
        patient_name: patient?.full_name ?? "",
        patient_phone: patient?.phone ?? "",
        senior_pwd: patient?.is_senior_pwd === true ? "Yes" : "No",
        source: String(row.source ?? ""),
        status: String(row.status ?? ""),
        reason: String(row.reason ?? ""),
        attendance: String(row.attendance ?? ""),
        payment_method: String(row.payment_method ?? ""),
        payment_amount: row.payment_amount === null || row.payment_amount === undefined ? "" : String(row.payment_amount),
        discount_amount: row.discount_amount === null || row.discount_amount === undefined ? "" : String(row.discount_amount),
        payment_reference: String(row.payment_reference ?? ""),
      };
    }
  );

  const csvContent = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) =>
      [
        row.date,
        row.time,
        row.patient_name,
        row.patient_phone,
        row.senior_pwd,
        row.source,
        row.status,
        row.reason,
        row.attendance,
        row.payment_method,
        row.payment_amount,
        row.discount_amount,
        row.payment_reference,
      ]
        .map(escapeCsv)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `appointments_${range.from}_to_${range.to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
