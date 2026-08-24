import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

// Authenticates a route-handler request via the SSR session cookie, falling
// back to an Authorization: Bearer <access_token> header (used by scripts
// and any non-cookie API callers).
export async function getRequestUser(
  request?: Request
): Promise<User | null> {
  const cookieClient = await createClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (user) return user;

  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;

  const tokenClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
      global: {
        headers: { Authorization: authHeader },
      },
    }
  );
  const {
    data: { user: bearerUser },
  } = await tokenClient.auth.getUser();
  return bearerUser ?? null;
}
