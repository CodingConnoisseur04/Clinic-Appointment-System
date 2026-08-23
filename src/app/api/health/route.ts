import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("doctor_availability")
      .select("*")
      .order("day_of_week");

    if (error) {
      return Response.json(
        { connected: false, error: error.message },
        { status: 500 }
      );
    }

    return Response.json({ connected: true, availability: data });
  } catch (e) {
    return Response.json(
      { connected: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
