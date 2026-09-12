import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/get-request-user";
import { sendConfirmationSms } from "@/lib/sms/send-confirmation";

export const dynamic = "force-dynamic";

// Confirmation SMS sender for the receptionist confirm dialog. Runs
// server-side so SEMAPHORE_API_KEY never reaches the browser, while still
// binding to the CALLER'S OWN session (cookie-based) so the
// sms_logs_insert_receptionist policy applies exactly as designed.
export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { appointmentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const appointmentId = body.appointmentId;
  if (typeof appointmentId !== "string") {
    return Response.json({ error: "appointmentId required" }, { status: 400 });
  }

  // Role check HERE, not only in RLS: sendConfirmationSms fires the paid
  // provider call BEFORE writing the sms_logs row RLS judges. Without this,
  // any signed-in session could trigger real Semaphore sends for its own
  // appointments and only fail afterwards, at the log write.
  const supabase = await createClient();
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "receptionist") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await sendConfirmationSms(supabase, appointmentId);
  return Response.json(result);
}
