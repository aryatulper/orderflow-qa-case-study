import assert from 'node:assert/strict';
import test from 'node:test';
import { cancellationAllowed, paymentAllowed, positiveInt, refundStatus } from '../../src/domain';

test('only a pending order can be paid', () => {
  assert.equal(paymentAllowed('PENDING_PAYMENT'), true);
  for (const status of ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED'] as const) {
    assert.equal(paymentAllowed(status), false);
  }
});

test('a partially refunded order cannot be cancelled again', () => {
  assert.equal(cancellationAllowed('PENDING_PAYMENT'), true);
  assert.equal(cancellationAllowed('PAID'), true);
  assert.equal(cancellationAllowed('PARTIALLY_REFUNDED'), false);
  assert.equal(cancellationAllowed('CANCELLED'), false);
});

test('refund calculation enforces the exact remaining balance', () => {
  assert.equal(refundStatus(24900, 0, 10000), 'PARTIALLY_REFUNDED');
  assert.equal(refundStatus(24900, 10000, 14900), 'REFUNDED');
  assert.throws(() => refundStatus(24900, 10000, 14901), { code: 'REFUND_LIMIT' });
  assert.throws(() => refundStatus(24900, 10000, 0), { code: 'REFUND_LIMIT' });
});

test('quantities and money amounts must be safe positive integers', () => {
  assert.equal(positiveInt(1, 'quantity'), 1);
  for (const value of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1, null]) {
    assert.throws(() => positiveInt(value, 'quantity'), { code: 'INVALID_INPUT' });
  }
});
