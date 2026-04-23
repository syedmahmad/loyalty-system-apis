# Loyalty Checkout API — Integration Guide

**Audience:** NCMC Frontend / ERP team  
**Base URL:** `https://<your-domain>/loyalty`  
**Version:** Current

---

## Overview

The Loyalty API allows your checkout page or POS system to let customers redeem their loyalty points at the time of payment. The same set of endpoints works for **two types of loyalty programs**:

| Program Type | How it works | Example |
|---|---|---|
| **Points** | Customer has an internal points wallet. They choose how many points to use. Points are deducted when payment is confirmed. | Petromin internal loyalty |
| **OTP (Qitaf)** | Customer pays with their STC Qitaf points. They receive a 4-digit PIN via SMS and enter it at checkout. No internal wallet is involved. | STC Qitaf |

**Your frontend does not need to know which type a program is in advance.** Call `GET /loyalty/programs` first — the `type` field on each program tells you how to behave.

---

## Authentication

Every request must include the tenant API token in the `Authorization` header:

```
Authorization: Bearer <tenant-api-token>
```

The token is issued per tenant from the admin panel. **Never put it in query strings or request body.**

---

## About Branch ID and Terminal ID (OTP / Qitaf only)

This is important to understand before integration:

- **STC assigns a Branch ID and Terminal ID** to each store and POS machine when Qitaf is activated for your tenant.
- These IDs are **configured in your ERP system** at the time of STC onboarding — the ERP already knows which terminal is which.
- **The cashier does not type them.** The ERP/POS sends them automatically on every Qitaf request.
- Your frontend just needs to pass whatever `branch_id` and `terminal_id` the ERP provides.
- If the terminal is not registered in the system, the API returns a clear error before even contacting STC.

> **Simple rule:** For OTP programs, always include `branch_id` and `terminal_id` in your request. Get these values from your ERP/POS configuration, not from the user.

---

## API Reference

---

### 1. GET /loyalty/programs

Lists all active loyalty programs for the tenant. Pass `customer_phone` to also get the customer's current points balance.

**Request**

```
GET /loyalty/programs?customer_phone=966501234567
Authorization: Bearer <token>
```

| Parameter | Required | Description |
|---|---|---|
| `customer_phone` | Optional | Customer's Saudi mobile number. Include country code (e.g. `966501234567` or `+966501234567`). Returns points balance for points-type programs. |

**Response**

```json
{
  "programs": [
    {
      "uuid": "a1b2c3d4-...",
      "name": "Petromin Loyalty",
      "description": "Earn and redeem points on every visit",
      "type": "points",
      "points": 1500
    },
    {
      "uuid": "e5f6g7h8-...",
      "name": "STC Qitaf",
      "description": "Pay with your Qitaf points",
      "type": "otp",
      "points": null
    }
  ]
}
```

> **Note:** For `type: "otp"` programs, `points` is always `null` — the customer's Qitaf balance is managed entirely by STC, not our system.

**Frontend usage:** Show the list of programs to the customer on the checkout page. Store the `uuid` for use in subsequent API calls. If `type` is `otp`, do not show a points slider — show an OTP input instead.

---

### 2. GET /loyalty/redemption-info

Returns the burn rule for a **points-type** program and the customer's current balance. Optionally simulates how much the customer can redeem on a specific invoice amount.

> This endpoint is **only for points programs**. For OTP programs, skip this step entirely.

**Request**

```
GET /loyalty/redemption-info?customer_phone=966501234567&program_uuid=a1b2c3d4-...&transaction_amount=500
Authorization: Bearer <token>
```

| Parameter | Required | Description |
|---|---|---|
| `customer_phone` | Yes | Customer's Saudi mobile number |
| `program_uuid` | Yes | UUID from `GET /loyalty/programs` |
| `transaction_amount` | Optional | Invoice total in SAR. If provided, simulates the maximum the customer can redeem. |

**Response (with simulation)**

```json
{
  "program": { "uuid": "a1b2c3d4-...", "name": "Petromin Loyalty", "type": "points" },
  "customer": {
    "available_points": 1500,
    "available_in_sar": 15.00
  },
  "burn_rule": {
    "max_burn_percent_on_invoice": 30,
    "points_conversion_factor": 0.01,
    "max_redeemption_points_limit": 2000,
    "min_amount_spent": 100,
    "frequency": "AnyTime"
  },
  "simulation": {
    "eligible": true,
    "max_points_can_burn": 1500,
    "max_discount_sar": 15.00,
    "min_amount_to_pay": 485.00
  }
}
```

**Frontend usage:** Use `simulation.max_points_can_burn` and `simulation.max_discount_sar` to drive the points slider. Let the customer choose any amount from 0 up to the maximum. Pass their chosen `points_to_burn` to `POST /loyalty/confirm-transaction` later.

---

### 3. POST /loyalty/request-transaction

Initiates a loyalty transaction. For **points** programs this creates a pending record. For **OTP** programs this triggers STC to send the customer a 4-digit PIN via SMS.

**Always call this before confirm-transaction.** The `transaction_id` returned here must be passed to the next step.

**Request body — Points program**

```json
{
  "customer_phone": "966501234567",
  "program_uuid": "a1b2c3d4-...",
  "transaction_amount": 500.00,
  "invoice_id": "INV-2024-00123",
  "remarks": "Optional note"
}
```

**Request body — OTP program (Qitaf)**

```json
{
  "customer_phone": "966501234567",
  "program_uuid": "e5f6g7h8-...",
  "transaction_amount": 500.00,
  "invoice_id": "INV-2024-00123",
  "branch_id": "BR001",
  "terminal_id": "TRM001"
}
```

| Field | Required | Description |
|---|---|---|
| `customer_phone` | Yes | Customer's Saudi mobile number |
| `program_uuid` | Yes | UUID from `GET /loyalty/programs` |
| `transaction_amount` | Yes | Full invoice total in SAR |
| `invoice_id` | Recommended | Your ERP's order/invoice reference number. Used to link refunds later. |
| `branch_id` | OTP only | STC-assigned branch code — read from ERP config |
| `terminal_id` | OTP only | STC-assigned terminal code — read from ERP config |
| `remarks` | Optional | Free-text note (e.g. "VIP customer") |
| `from_app` | Optional | Identifier of calling system (e.g. `"web-checkout"`, `"pos-v2"`) |

**Response — Points program**

```json
{
  "transaction_id": "uuid-of-pending-wallet-transaction",
  "program_type": "points",
  "transaction_amount": 500.00,
  "max_points_can_burn": 1500,
  "max_discount_sar": 15.00,
  "note": "Points not deducted yet. Call confirm-transaction with points_to_burn to finalise."
}
```

**Response — OTP program (Qitaf)**

```json
{
  "transaction_id": "uuid-of-qitaf-otp-transaction",
  "program_type": "otp",
  "transaction_amount": 500.00,
  "note": "OTP sent to customer. Call confirm-transaction with otp to finalise redemption."
}
```

> **Important:** The customer receives an SMS from STC with their 4-digit PIN immediately after this call. Show an OTP input field on your checkout page so they can enter it.

> **On error:** If STC fails to send the OTP, the API returns an error. Do not proceed to confirm-transaction — ask the customer to try again or choose a different payment method.

---

### 4. POST /loyalty/confirm-transaction

Finalises the transaction after payment is collected.

- **Points:** Deducts the chosen points from the customer's wallet.
- **OTP:** Submits the customer's PIN to STC, which deducts their Qitaf points.

**Request body — Points program**

```json
{
  "transaction_id": "uuid-from-request-transaction",
  "points_to_burn": 1200
}
```

**Request body — OTP program (Qitaf)**

```json
{
  "transaction_id": "uuid-from-request-transaction",
  "points_to_burn": 0,
  "otp": 4729,
  "redeem_amount": 500.00
}
```

| Field | Required | Description |
|---|---|---|
| `transaction_id` | Yes | UUID returned by `POST /loyalty/request-transaction` |
| `points_to_burn` | Yes | Points to deduct from wallet. Use `0` for OTP programs. |
| `otp` | OTP only | 4-digit PIN the customer received via SMS |
| `redeem_amount` | OTP only | SAR amount to pay using Qitaf. Defaults to the full `transaction_amount`. Send a smaller number if the customer only wants to partially pay with Qitaf. |

**Response — Points program**

```json
{
  "transaction_id": "uuid-of-confirmed-transaction",
  "program_type": "points",
  "points_burned": 1200,
  "discount_amount": 12.00,
  "final_amount": 488.00,
  "remaining_points": 300
}
```

**Response — OTP program (Qitaf)**

```json
{
  "transaction_id": "uuid-of-redeem-transaction",
  "program_type": "otp",
  "redeemed_sar": 500.00,
  "remaining_amount": 0,
  "note": "Earn reward queued for SAR 50 (amount paid by card/cash)."
}
```

> **Note on `remaining_amount`:** If the customer only redeemed part of the invoice via Qitaf (e.g. paid SAR 500 via Qitaf on a SAR 550 invoice), `remaining_amount` is SAR 50. STC automatically earns reward points on that remaining amount — no extra action needed from your side.

> **On wrong OTP:** STC returns an error. Show the error to the customer and let them re-enter the PIN. The same `transaction_id` can be retried with a corrected OTP.

> **On critical STC error or timeout:** STC auto-reverses the transaction. The API returns an error with a message like `"Redemption failed. Transaction automatically reversed."` In this case, the customer was not charged — inform them and proceed without Qitaf redemption.

---

### 5. POST /loyalty/refund

Fully refunds a completed transaction.

- **Points:** Returns all burned points back to the customer's wallet.
- **OTP (Qitaf):** Sends a reverse request to STC. Qitaf points are returned to the customer's STC balance.

Pass **either** `transaction_id` or `invoice_id` — not both.

**Request body — Points program (by transaction_id)**

```json
{
  "transaction_id": "uuid-from-confirm-transaction"
}
```

**Request body — OTP program (by invoice_id)**

```json
{
  "invoice_id": "INV-2024-00123"
}
```

| Field | Required | Description |
|---|---|---|
| `transaction_id` | Points programs | UUID returned by `POST /loyalty/confirm-transaction` |
| `invoice_id` | OTP programs | The `invoice_id` you sent in `POST /loyalty/request-transaction` |

**Response — Points program**

```json
{
  "refund_transaction_id": "uuid-of-adjustment-transaction",
  "original_transaction_id": "uuid-of-original-transaction",
  "program_type": "points",
  "points_returned": 1200,
  "new_available_points": 1500
}
```

**Response — OTP program**

```json
{
  "program_type": "otp",
  "invoice_id": "INV-2024-00123",
  "note": "Qitaf redemption reversed. Points returned to customer by STC."
}
```

> **Partial refund is not supported.** The entire redemption is reversed.

> **For OTP refunds:** The `invoice_id` you passed at request-transaction time is used to look up the original STC redemption. If you did not pass `invoice_id` originally, you cannot refund via this endpoint — always send `invoice_id` on every transaction.

---

## Complete Checkout Flows

### Flow A — Points Program

```
1. GET /loyalty/programs?customer_phone=...
      → Find the program UUID, confirm type = "points"

2. GET /loyalty/redemption-info?customer_phone=...&program_uuid=...&transaction_amount=500
      → Show the customer their balance and max discount slider

3. Customer selects how many points to use (e.g. 1200 points = SAR 12 off)

4. POST /loyalty/request-transaction
      { customer_phone, program_uuid, transaction_amount: 500, invoice_id: "INV-123" }
      → Receive transaction_id

5. Process payment for (500 - 12 = SAR 488) via your payment gateway

6. POST /loyalty/confirm-transaction
      { transaction_id, points_to_burn: 1200 }
      → Points deducted. Show "12 SAR discount applied" confirmation.
```

### Flow B — OTP Program (Qitaf)

```
1. GET /loyalty/programs?customer_phone=...
      → Find the program UUID, confirm type = "otp"

2. (Skip /loyalty/redemption-info — not applicable for OTP)

3. POST /loyalty/request-transaction
      { customer_phone, program_uuid, transaction_amount: 500, invoice_id: "INV-123",
        branch_id: "BR001", terminal_id: "TRM001" }
      → Receive transaction_id
      → STC sends 4-digit PIN to customer's mobile

4. Show OTP input field to customer. Customer enters the PIN from their SMS.

5. Customer decides how much to pay via Qitaf (full SAR 500 or partial)

6. POST /loyalty/confirm-transaction
      { transaction_id, points_to_burn: 0, otp: 4729, redeem_amount: 500 }
      → STC redeems the points. Show "Paid via Qitaf" confirmation.

7. (If partial redemption: collect remaining amount via card/cash as normal)
```

### Flow C — Refund

```
Points program:
  POST /loyalty/refund
  { transaction_id: "uuid-from-confirm-step" }

OTP program:
  POST /loyalty/refund
  { invoice_id: "INV-123" }
```

---

## Error Handling

All errors follow a standard format:

```json
{
  "statusCode": 400,
  "message": "branch_id and terminal_id are required for OTP-based programs"
}
```

| HTTP Status | Meaning |
|---|---|
| `400 Bad Request` | Missing or invalid field in your request |
| `404 Not Found` | Customer, program, or transaction not found |
| `422 Unprocessable Entity` | STC rejected the redemption and auto-reversed it |
| `504 Gateway Timeout` | STC API did not respond in 60 seconds (auto-reversed) |
| `502 Bad Gateway` | STC returned an error code |

For `422` and `504`, the Qitaf transaction is automatically cancelled by STC. Inform the customer and proceed without loyalty redemption.

---

## Quick Reference — What to Send Per Program Type

| Field | Points Program | OTP Program |
|---|---|---|
| `customer_phone` | ✅ Required | ✅ Required |
| `program_uuid` | ✅ Required | ✅ Required |
| `transaction_amount` | ✅ Required | ✅ Required |
| `invoice_id` | ✅ Strongly recommended | ✅ **Mandatory for refunds** |
| `branch_id` | ❌ Not needed | ✅ Required (from ERP) |
| `terminal_id` | ❌ Not needed | ✅ Required (from ERP) |
| `points_to_burn` (confirm) | ✅ Customer's choice (≥ 1) | ✅ Send `0` |
| `otp` (confirm) | ❌ Not needed | ✅ 4-digit PIN from customer |
| `redeem_amount` (confirm) | ❌ Not needed | Optional (defaults to full amount) |

---

## Notes for NCMC Team

1. **Do not hardcode branch_id / terminal_id.** These come from STC configuration in your ERP. Different POS machines have different terminal IDs.

2. **Always pass `invoice_id`.** It is your ERP's order/invoice reference number (same field you already use for invoices). Without it, OTP refunds are not possible.

3. **The `program_uuid` never changes** for a given program. You can cache it per tenant session instead of calling `/loyalty/programs` on every page load.

4. **For OTP programs, the customer must already be registered with STC Qitaf.** If STC says the customer is not found, they need to sign up for Qitaf separately — this is outside our system.

5. **Partial Qitaf redemption:** If the customer wants to pay SAR 300 of a SAR 500 invoice via Qitaf and the rest by card — send `redeem_amount: 300` in confirm-transaction. STC will also automatically earn reward points for the remaining SAR 200 paid by card.

6. **Phone format is flexible.** The API accepts `966501234567`, `+966501234567`, or `501234567` — all produce the same result.
