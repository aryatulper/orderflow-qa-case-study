# Selected test cases

Precondition for all cases unless stated: the Compose environment is healthy, seed data exists, and the listed actor is signed in. `arya@example.test` is Customer A, `other@example.test` is Customer B, and `admin@example.test` is Admin. Exact IDs may vary; use IDs returned by the API.

| ID | Level/type | Action / test data | Expected result | Rule |
| --- | --- | --- | --- | --- |
| TC-01 | API positive | Customer A logs in with seeded credentials. | 200; token and customer role. | BR-09 |
| TC-02 | API negative | Log in with wrong password. | 401; no token. | BR-09 |
| TC-03 | API positive | Read product catalog. | Four priced products and nonnegative stock. | BR-01, BR-03 |
| TC-04 | API negative | Order 2 Limited Edition Pins (stock 1). | 409 `INSUFFICIENT_STOCK`; no order/stock change. | BR-03 |
| TC-05 | API positive | Order 2 Canvas Totes. | 201, total 49,800 cents, pending status, stock −2. | BR-01, BR-04 |
| TC-06 | API negative | Order with zero, fraction or string quantity. | 400; nothing persisted. | BR-02 |
| TC-07 | API negative | Put same product twice in one order. | 400 duplicate-product error. | BR-02 |
| TC-08 | API/security | Customer B fetches Customer A's order. | 404; no order data leaked. | BR-09 |
| TC-09 | API/security | Customer B cancels Customer A's order. | 404; no state/stock change. | BR-09 |
| TC-10 | API positive | Pay pending order with key K. | 201; one payment for full total; `PAID`. | BR-05 |
| TC-11 | API regression | Repeat same payment request with key K. | 200 `replayed: true`; still one payment. | BR-05 |
| TC-12 | API negative | Pay already paid order with different key. | 409; still one payment. | BR-05 |
| TC-13 | API negative | Pay without an idempotency key. | 400; no payment. | BR-05 |
| TC-14 | API positive | Cancel pending order. | 200 `CANCELLED`; stock returned, no refund. | BR-04, BR-06 |
| TC-15 | API negative | Cancel same order again. | 409; no second stock return. | BR-04, BR-06 |
| TC-16 | API positive | Cancel paid, unrefunded order. | Full cancellation refund, `CANCELLED`, stock returned. | BR-06 |
| TC-17 | API/security | Customer requests a refund. | 403; no refund. | BR-07 |
| TC-18 | API positive | Admin refunds 10,000 cents of 49,800. | 201 `PARTIALLY_REFUNDED`; stock unchanged. | BR-07, BR-08 |
| TC-19 | API boundary | Admin tries refund above remaining balance. | 409 `REFUND_LIMIT`; no new refund. | BR-07 |
| TC-20 | API positive | Admin refunds exact remaining balance. | 201 `REFUNDED`; sum equals payment. | BR-07 |
| TC-21 | UI smoke | Add Tote, place order, pay. | Pending then paid order visible; one payment. | BR-01, BR-05 |
| TC-22 | UI regression | Add Mug, place order, cancel. | Cancelled status and original stock restored. | BR-04 |
| TC-23 | SQL integration | Run `db/validations.sql` after suites. | Zero anomaly rows. | BR-10 |

Cases TC-02, 06, 07 and 13 are documented manual/next automation candidates; the automated suite concentrates on the P0/P1 paths shown in the traceability matrix. A case being listed here does not imply it has been automated.
