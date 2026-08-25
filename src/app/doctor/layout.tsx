import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";

export default async function DoctorLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRole(["doctor"]);
  return <div className="flex flex-col flex-1">{children}</div>;
}
