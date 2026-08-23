"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AvailabilityRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: boolean;
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function Home() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [rows, setRows] = useState<AvailabilityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.connected) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        setRows(body.availability);
        setStatus("ok");
      })
      .catch((e: Error) => {
        setError(e.message);
        setStatus("error");
      });
  }, []);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 p-8 font-sans dark:bg-black">
      <main className="w-full max-w-2xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            Clinic Appointment System
          </h1>
          {status === "loading" && <Badge variant="secondary">Checking Supabase…</Badge>}
          {status === "ok" && <Badge>Supabase connected</Badge>}
          {status === "error" && <Badge variant="destructive">Supabase error</Badge>}
        </div>

        {status === "error" && (
          <Card>
            <CardHeader>
              <CardTitle>Connection failed</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {status === "ok" && (
          <Card>
            <CardHeader>
              <CardTitle>doctor_availability</CardTitle>
              <CardDescription>
                Live query via local Supabase ({rows.length} seeded rows)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Slot (min)</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{DAYS[row.day_of_week]}</TableCell>
                      <TableCell>{row.start_time.slice(0, 5)}</TableCell>
                      <TableCell>{row.end_time.slice(0, 5)}</TableCell>
                      <TableCell>{row.slot_duration_minutes}</TableCell>
                      <TableCell>{row.is_active ? "Yes" : "No"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
