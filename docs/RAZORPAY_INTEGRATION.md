# Razorpay checkout

The backend uses Razorpay Orders in INR. A booking stays `PENDING` until Razorpay
reports a **captured** payment. Checkout holds seats for 10 minutes; expired
bookings release their seats. The backend attempts an automatic full refund if a
captured payment arrives after the hold expires. Paid booking cancellation is
currently disabled because a separate refund policy has not been implemented.

## Configure

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in
the backend environment. Start with Razorpay test keys. Enable automatic payment
capture in the Razorpay account. In the Razorpay dashboard, configure the webhook
URL `https://<backend-host>/payments/razorpay/webhook` and subscribe to
`payment.captured` and `refund.processed`. The webhook secret is the secret you
choose when creating that webhook; it is separate from the API key secret.

Apply the database migration before starting this version:

```bash
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart booking-platform
```

## Browser flow

1. `POST /bookings/lock` with `{ "showId": "...", "showSeatIds": ["..."] }`
   and the user's bearer token. This selection hold lasts two minutes.
2. `POST /bookings` with the same body and bearer token. It returns
   `bookingId`, `orderId`, `keyId`, `amount` (paise), `currency` (`INR`), and
   `expiresAt`. The booking is now `PENDING`.
3. Open Razorpay Checkout with `key: keyId`, `order_id: orderId`, `amount`, and
   `currency`. Do not create orders or calculate the final amount in the browser.
4. On Checkout success, call `POST /bookings/:bookingId/verify-payment` with:

   ```json
   {
     "razorpay_order_id": "order_...",
     "razorpay_payment_id": "pay_...",
     "razorpay_signature": "..."
   }
   ```

   The backend checks the signature, fetches the payment from Razorpay, verifies
   its order, amount, currency, and captured status, then confirms the booking.
5. If the browser closes before step 4, the signed webhook can still confirm the
   booking. Poll `GET /bookings/:bookingId` to show its final status. Send the
   ticket only when status is `CONFIRMED`.

All booking endpoints except the signed webhook require the user's bearer token.
`POST /bookings/:id/cancel` only cancels unpaid pending checkouts. Webhook
requests must contain the original body and Razorpay signature header; a normal
curl with unsigned JSON will be rejected.

## Local smoke test

With a valid access token and IDs from `GET /shows/:showId/seats`:

```bash
curl -X POST http://localhost:3000/bookings/lock \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"showId":"<SHOW_ID>","showSeatIds":["<SHOW_SEAT_ID>"]}'

curl -X POST http://localhost:3000/bookings \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"showId":"<SHOW_ID>","showSeatIds":["<SHOW_SEAT_ID>"]}'
```

Use the returned order in Razorpay's test Checkout. Payment cannot be simulated
by calling the verification endpoint with invented IDs or a fabricated signature.
