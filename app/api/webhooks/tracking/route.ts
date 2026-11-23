// EasyPost tracker webhook. The signature is checked before any status change.
// A repeated event id is acknowledged and ignored. Missing credentials do not
// accept unsigned updates.
export const dynamic = "force-dynamic";

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { logError, logWarning } from "@/lib/log";
import { aggregateOrderStatus } from "@/lib/order-status";
import { sendOrderEmail } from "@/lib/order-email";
import { prisma } from "@/lib/prisma";
import { carrierFromProvider, decideTrackingUpdate, verifyTrackingSignature } from "@/lib/tracking";
import { trackingWebhookSecret } from "@/lib/tracking-provider";

interface TrackerResult {
  id?: string;
  object?: string;
  tracking_code?: string;
  carrier?: string;
  status?: string;
  status_detail?: string;
  public_url?: string | null;
}

interface TrackingEventBody {
  id?: string;
  description?: string;
  result?: TrackerResult;
}

export async function POST(request: NextRequest) {
  const secret = trackingWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: "Tracking updates are not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const verified = verifyTrackingSignature({
    rawBody,
    signatureHeader: request.headers.get("x-hmac-signature"),
    signatureV2Header: request.headers.get("x-hmac-signature-v2"),
    timestampHeader: request.headers.get("x-timestamp"),
    pathHeader: request.headers.get("x-path"),
    secret,
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: TrackingEventBody;
  try {
    event = JSON.parse(rawBody) as TrackingEventBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const description = event.description ?? "";
  const tracker = event.result;
  if (!description.startsWith("tracker.") || tracker?.object !== "Tracker") {
    return NextResponse.json({ received: true, ignored: "not_a_tracker" });
  }
  const eventId = event.id;
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id." }, { status: 400 });
  }

  const carrier = carrierFromProvider(tracker.carrier);
  const trackingNumber = tracker.tracking_code?.trim();
  const items = await prisma.orderItem.findMany({
    where: {
      OR: [
        ...(tracker.id ? [{ providerTrackerId: tracker.id }] : []),
        ...(carrier && trackingNumber ? [{ carrier, trackingNumber }] : []),
      ],
    },
    select: {
      id: true,
      orderId: true,
      shippingStatus: true,
      product: { select: { title: true } },
      order: { select: { buyer: { select: { email: true } } } },
    },
  });

  if (items.length === 0) {
    logWarning("tracking.unknown_tracker", { eventId });
    return NextResponse.json({ received: true, ignored: "unknown_tracker" });
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId})::bigint)`;
      const existing = await tx.trackingEvent.findUnique({
        where: { providerEventId: eventId },
        select: { id: true },
      });
      if (existing) return { duplicate: true as const, emails: [] as EmailNotice[] };

      const emails: EmailNotice[] = [];
      for (const item of items) {
        const decision = decideTrackingUpdate({
          current: item.shippingStatus,
          carrierStatus: tracker.status,
          statusDetail: tracker.status_detail,
        });
        if ("ignore" in decision) continue;

        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            shippingStatus: decision.status,
            ...(tracker.public_url ? { trackingUrl: tracker.public_url } : {}),
          },
        });
        const lines = await tx.orderItem.findMany({
          where: { orderId: item.orderId },
          select: { shippingStatus: true },
        });
        await tx.order.update({
          where: { id: item.orderId },
          data: { shippingStatus: aggregateOrderStatus(lines.map((line) => line.shippingStatus)) },
        });
        if (decision.email) {
          emails.push({
            kind: decision.email,
            to: item.order.buyer.email,
            orderId: item.orderId,
            productTitle: item.product.title,
            trackingUrl: tracker.public_url ?? null,
            detail: tracker.status_detail ?? null,
          });
        }
      }

      await tx.trackingEvent.create({
        data: {
          providerEventId: eventId,
          orderItemId: items[0]?.id ?? null,
          carrierStatus: tracker.status ?? "unknown",
        },
      });
      return { duplicate: false as const, emails };
    });

    if (outcome.duplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    for (const notice of outcome.emails) {
      await sendOrderEmail(notice);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    logError("tracking.webhook", err, { eventId });
    return NextResponse.json({ error: "Failed to record tracking update." }, { status: 500 });
  }
}

interface EmailNotice {
  kind: "delivered" | "exception";
  to: string;
  orderId: string;
  productTitle: string;
  trackingUrl: string | null;
  detail: string | null;
}
