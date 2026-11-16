import { stockDecrementWhere, type CheckoutStore, type CheckoutTx } from "@/lib/checkout-fulfillment";
import { prisma } from "@/lib/prisma";

export function createPrismaCheckoutStore(pendingCheckoutId: string): CheckoutStore {
  return {
    findOrderByStripePaymentId(stripePaymentId) {
      return prisma.order.findUnique({ where: { stripePaymentId }, select: { id: true } });
    },
    withPaymentLock(stripePaymentId, fn) {
      return prisma.$transaction(async (tx) => {
        // Serializes webhook retries for this charge. The unique index on
        // Order.stripePaymentId is the backstop if two locks ever miss.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${stripePaymentId})::bigint)`;
        const checkoutTx: CheckoutTx = {
          findOrderByStripePaymentId(id) {
            return tx.order.findUnique({ where: { stripePaymentId: id }, select: { id: true } });
          },
          async decrementIfAvailable(productId, quantity) {
            const result = await tx.product.updateMany({
              where: stockDecrementWhere(productId, quantity),
              data: { inventoryCount: { decrement: quantity } },
            });
            return result.count === 1;
          },
          createOrder(input) {
            return tx.order.create({
              data: {
                buyerId: input.buyerId,
                shippingAddressId: input.shippingAddressId,
                totalAmountCents: input.totalAmountCents,
                stripePaymentId: input.stripePaymentId,
                items: {
                  create: input.lines.map((line) => ({
                    productId: line.productId,
                    sellerProfileId: line.sellerProfileId,
                    quantity: line.quantity,
                    unitPriceCents: line.unitPriceCents,
                    shippingCostCents: line.shippingCostCents,
                    fulfillmentMethod: line.fulfillmentMethod,
                  })),
                },
              },
              select: { id: true },
            });
          },
          async savePending(patch) {
            await tx.pendingCheckout.update({ where: { id: pendingCheckoutId }, data: patch });
          },
        };
        return fn(checkoutTx);
      });
    },
  };
}
