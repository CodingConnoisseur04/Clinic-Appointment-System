import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";

export default async function ReceptionistLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRole(["receptionist"]);
  return <div className="flex flex-col flex-1">{children}</div>;
}
