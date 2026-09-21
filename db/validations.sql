-- A non-empty result is a data-integrity failure. Run after API/UI tests.
SELECT 'order_total_mismatch' AS check_name, o.id AS order_id
FROM orders o JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, o.total_cents HAVING o.total_cents <> SUM(oi.quantity * oi.unit_price_cents)
UNION ALL
SELECT 'payment_amount_mismatch', o.id
FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.amount_cents <> o.total_cents
UNION ALL
SELECT 'paid_without_payment', o.id
FROM orders o WHERE o.status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)
UNION ALL
SELECT 'refund_exceeds_payment', o.id
FROM orders o JOIN refunds r ON r.order_id = o.id
GROUP BY o.id, o.total_cents HAVING SUM(r.amount_cents) > o.total_cents
UNION ALL
SELECT 'refunded_status_mismatch', o.id
FROM orders o JOIN refunds r ON r.order_id = o.id
WHERE o.status IN ('PARTIALLY_REFUNDED', 'REFUNDED')
GROUP BY o.id, o.status, o.total_cents
HAVING (o.status = 'REFUNDED' AND SUM(r.amount_cents) <> o.total_cents)
    OR (o.status = 'PARTIALLY_REFUNDED' AND SUM(r.amount_cents) >= o.total_cents)
UNION ALL
SELECT 'negative_stock', p.id FROM products p WHERE p.stock < 0
UNION ALL
SELECT 'cancelled_without_full_refund', o.id
FROM orders o JOIN payments p ON p.order_id = o.id
WHERE o.status = 'CANCELLED'
AND (SELECT COALESCE(SUM(r.amount_cents), 0) FROM refunds r WHERE r.order_id = o.id) <> o.total_cents
UNION ALL
-- An empty test database must not produce a misleading green result.
SELECT 'no_orders_present', 0 WHERE NOT EXISTS (SELECT 1 FROM orders)
UNION ALL
SELECT 'no_payments_present', 0 WHERE NOT EXISTS (SELECT 1 FROM payments)
UNION ALL
SELECT 'no_refunds_present', 0 WHERE NOT EXISTS (SELECT 1 FROM refunds);
