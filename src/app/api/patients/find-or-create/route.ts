import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/get-request-user";
import { findOrCreatePatient, type FindOrCreatePatientInput } from "@/lib/patients/find-or-create-patient";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A caller may only link a patients row to their OWN profile — unless
  // they're a receptionist (walk-ins are created unlinked; staff never need
  // to claim someone else's profileId). Without this check, any
  // authenticated session could create/link a record for another account.
  const supabase = await createClient();
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isReceptionist = callerProfile?.role === "receptionist";

  let body: { appointmentId?: unknown } & Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const profileId = body.profileId;
  if (
    !isReceptionist &&
    typeof profileId === "string" &&
    profileId !== user.id
  ) {
    return Response.json(
      { error: "profileId must belong to the signed-in user" },
      { status: 403 }
    );
  }

  const result = await findOrCreatePatient(createAdminClient(), {
    ...(body as FindOrCreatePatientInput),
    // Senior/PWD is a self-assertable, non-privileged flag (the desk verifies
    // it when money changes hands). Walk-in desk sends it explicitly; an
    // online signup's own flag rides their user_metadata. Only applied on
    // CREATE — an existing record's flag is never silently overwritten.
    isSeniorPwd:
      body.isSeniorPwd === true || user.user_metadata?.is_senior_pwd === true,
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}
