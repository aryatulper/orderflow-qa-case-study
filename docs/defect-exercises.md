# Defect-report writing exercises

These are **simulated training reports**, not bugs claimed to have been found in the finished application or an employer's system. The “observed” results below describe a hypothetical faulty build. Each can be reproduced only if such a fault is introduced, so the current passing system should show the expected result. Use the issue template for genuine future findings.

## EX-01 — Payment retry creates a second capture

- Requirement/test: BR-05 / TC-11; severity **Critical** because money can be charged twice.
- Preconditions: Customer A has one `PENDING_PAYMENT` order; use the same 8+ character idempotency key for both requests.
- Steps: (1) POST `/api/orders/{id}/payments` with key K. (2) Repeat the identical POST with key K. (3) Read the order and payment rows.
- Expected: First response 201; second response 200 with `replayed: true`; one payment row for the full total.
- Hypothetical observed defect: second response 201 and two payment rows.
- Evidence to attach in a real issue: sanitized requests/responses, order ID, two payment row IDs, build SHA, Newman/JUnit output.
- Regression guard: Newman cases 07–09, Playwright `payment replay creates only one payment`, database unique constraint.

## EX-02 — Other customer can view order details

- Requirement/test: BR-09 / TC-08; severity **High** because order details leak across accounts.
- Preconditions: Customer A creates an order; Customer B has a separate valid session.
- Steps: (1) Record A's order ID. (2) GET `/api/orders/{id}` with B's bearer token.
- Expected: 404 with no order details or indication that the order exists.
- Hypothetical observed defect: 200 with A's items, total and payment history.
- Evidence to attach in a real issue: redacted response, two distinct account IDs, build SHA; never paste bearer tokens.
- Regression guard: Newman case 06 and Playwright `another customer cannot view or cancel an order`.

## EX-03 — Refund exceeds remaining paid amount

- Requirement/test: BR-07 / TC-19; severity **Critical** because financial records become inconsistent.
- Preconditions: A paid 49,800-cent order has a prior 10,000-cent refund.
- Steps: (1) Admin POSTs a second refund of 39,801 cents. (2) Read order/refund rows.
- Expected: 409 `REFUND_LIMIT`; no new refund; cumulative amount remains 10,000 cents.
- Hypothetical observed defect: 201, cumulative refunds 49,801 cents.
- Evidence to attach in a real issue: sanitized API exchange, before/after SQL query, build SHA and exact amounts.
- Regression guard: unit refund boundary, Newman over-refund, SQL `refund_exceeds_payment` check.
