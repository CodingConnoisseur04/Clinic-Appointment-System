import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/auth/get-request-user";
import { getAvailableSlots } from "@/lib/booking/get-available-slots";
import { z } from "zod";

export const dynamic = "force-dynamic";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = new URL(request.url).searchParams.get("date") ?? "";
  const parsed = dateSchema.safeParse(date);
  if (!parsed.success) {
    return Response.json(
      { error: "date query parameter must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const slots = await getAvailableSlots(createAdminClient(), parsed.data);
  return Response.json({ date: parsed.data, slots });
}
