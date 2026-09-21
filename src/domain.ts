export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'CANCELLED';

export class DomainError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

export function positiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError(400, 'INVALID_INPUT', `${field} must be a positive integer`);
  }
  return value;
}

// Keep state-transition rules here so API handlers and unit tests share one source of truth.
export function paymentAllowed(status: OrderStatus): boolean {
  return status === 'PENDING_PAYMENT';
}

export function cancellationAllowed(status: OrderStatus): boolean {
  return status === 'PENDING_PAYMENT' || status === 'PAID';
}

export function refundStatus(totalCents: number, alreadyRefundedCents: number, amountCents: number): OrderStatus {
  // A refund can use only the remaining balance; the final amount closes the order.
  if (amountCents <= 0 || amountCents > totalCents - alreadyRefundedCents) {
    throw new DomainError(409, 'REFUND_LIMIT', 'Refund exceeds the remaining paid amount');
  }
  return alreadyRefundedCents + amountCents === totalCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}
