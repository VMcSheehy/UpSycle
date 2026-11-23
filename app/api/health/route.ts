// App Runner health check. Confirms the process is up and can reach Postgres.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Health check failed", err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
