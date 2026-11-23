import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

import { logError, logInfo } from "@/lib/log";
import type { OrderEmailKind } from "@/lib/order-email-content";
import { orderEmailContent } from "@/lib/order-email-content";

export type { OrderEmailKind };
export { orderEmailContent };

let client: SESv2Client | undefined;

function sesClient(): SESv2Client {
  if (!client) {
    client = new SESv2Client({ region: process.env.AWS_REGION || process.env.COGNITO_REGION || "us-west-2" });
  }
  return client;
}

export async function sendOrderEmail(input: {
  to: string;
  kind: OrderEmailKind;
  orderId: string;
  productTitle?: string;
  refundCents?: number;
}): Promise<"sent" | "skipped" | "failed"> {
  const from = process.env.SES_FROM_EMAIL?.trim();
  const content = orderEmailContent(input);
  if (!from) {
    logInfo("order-email.skipped", { kind: input.kind, orderId: input.orderId, reason: "SES_FROM_EMAIL unset" });
    return "skipped";
  }

  try {
    await sesClient().send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [input.to] },
        Content: {
          Simple: {
            Subject: { Data: content.subject, Charset: "UTF-8" },
            Body: { Text: { Data: content.text, Charset: "UTF-8" } },
          },
        },
      }),
    );
    logInfo("order-email.sent", { kind: input.kind, orderId: input.orderId });
    return "sent";
  } catch (err) {
    // SES sandbox or a missing domain identity must not undo the order update.
    logError("order-email.failed", err, { kind: input.kind, orderId: input.orderId });
    return "failed";
  }
}
