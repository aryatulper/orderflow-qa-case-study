# Workflow diagrams

These diagrams make the scope and actor boundaries reviewable in GitHub. They are a use-case view and an activity flow; implementation details remain in the API contract and requirements.

## Use-case view

```mermaid
flowchart LR
  Customer([Customer]) --> Login([Sign in])
  Customer --> Catalog([View products and stock])
  Customer --> Place([Place order])
  Customer --> Pay([Pay own pending order])
  Customer --> Cancel([Cancel own eligible order])
  Customer --> History([Read own history])
  Admin([Administrator]) --> Login
  Admin --> All([Read all orders])
  Admin --> Refund([Issue monetary refund])
  Place -. "includes" .-> Stock([Validate and reserve stock])
  Pay -. "includes" .-> Idempotency([Check payment idempotency])
  Cancel -. "if paid" .-> FullRefund([Create full cancellation refund])
  Refund -. "includes" .-> Limit([Check remaining balance])
```

## Checkout and after-sale activity

```mermaid
flowchart TD
  Start([Customer submits cart]) --> Validate{Items valid?}
  Validate -- No --> BadInput([400 invalid input])
  Validate -- Yes --> Lock[Lock product rows in ID order]
  Lock --> Stock{Enough stock?}
  Stock -- No --> Conflict([409; roll back])
  Stock -- Yes --> Reserve[Create pending order and reserve stock]
  Reserve --> Choice{Next action}
  Choice -- Cancel --> CancelPending[Return stock; mark cancelled]
  Choice -- Pay --> Key{Payment key seen?}
  Key -- Yes --> Replay[Return existing payment, no new charge]
  Key -- No --> Capture[Record full payment; mark paid]
  Capture --> PaidChoice{After payment}
  PaidChoice -- Cancel before refund --> CancelPaid[Full cancellation refund + return stock]
  PaidChoice -- Admin return refund --> Amount{Within remaining balance?}
  Amount -- No --> RefundConflict([409; no refund row])
  Amount -- Yes --> Record[Record refund; keep stock unchanged]
  Record --> Status{Remaining balance?}
  Status -- Positive --> Partial([Partially refunded])
  Status -- Zero --> Full([Refunded])
```
