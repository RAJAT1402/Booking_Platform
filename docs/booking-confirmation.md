# Booking confirmation emails and QR verification

Configure the SMTP variables and `BOOKING_QR_SECRET` from `.env.example` in your deployment. Use a separate random secret of at least 32 bytes, for example generated with `openssl rand -hex 32`. Keep it stable: changing it invalidates previously issued QR codes. Use port 465 with `SMTP_SECURE=true` for implicit TLS, or your provider's STARTTLS port (usually 587) with `SMTP_SECURE=false`. Set `BOOKING_TIMEZONE` to the timezone for show times in emails (default `Asia/Kolkata`).

After `POST /bookings` commits a confirmed booking, it sends the account's registered email address a confirmation with the booking ID, movie, venue, screen, show time, seats, amount, and an inline PNG QR attachment. The existing booking response gains `confirmationEmail: { status: "sent" | "failed" }`. `sent` means the SMTP server accepted the recipient, not guaranteed inbox delivery. No message is sent for a failed booking transaction. SMTP/configuration failures do not roll back a completed booking.

To retry email delivery, the booking owner or an admin can call `POST /bookings/:id/confirmation-email` with their usual bearer token. It sends only confirmed bookings to the registered account address and returns the email status. Retries are manual; there is no background delivery queue. A successful retry can send a duplicate email.

The QR contains an opaque signed token whose payload includes the booking ID. It is not a URL. A scanner frontend should read the QR text and submit it as:

```http
POST /bookings/verify
Authorization: Bearer <admin-or-venue-owner-access-token>
Content-Type: application/json

{"token":"<scanned QR text>"}
```

Only admins and the owner of the booking's venue can verify tickets. The endpoint checks the signature and current database state; it rejects cancelled/unconfirmed bookings, cancelled/completed shows, and shows past their end time. The response contains `valid: true`, booking ID/status, movie, venue, screen, start time, and seats, inside the normal API response envelope. A plain booking ID cannot be used in place of the signed token.

Verification is repeatable and does not mark a ticket as used. This backend change does not include a camera scanner UI or single-use admission/check-in tracking. The existing booking confirmation endpoint is the completion trigger; the app does not currently implement a payment-success callback.

For a live smoke test, configure a test SMTP inbox, complete a booking, decode its received PNG using a QR scanner, and submit the decoded token using an authorized account. Then cancel that booking and verify that the same token is rejected.
