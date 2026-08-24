import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/get-request-user";
import { findOrCreatePatient, type FindOrCreatePatientInput } from "@/lib/patients/find-or-create-patient";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await findOrCreatePatient(
    createAdminClient(),
    body as FindOrCreatePatientInput
  );

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}
