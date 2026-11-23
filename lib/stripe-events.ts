// Fulfillment runs for both Checkout completion events. A delayed payment
// method sends checkout.session.completed while payment_status is still
// unpaid, then checkout.session.async_payment_succeeded once it clears.
export function checkoutEventShouldFulfill(eventType: string): boolean {
  return eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded";
}
