ALTER TABLE "ShowSeat" ADD COLUMN "lockToken" TEXT;
ALTER TABLE "Booking" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "providerPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "providerRefundId" TEXT;

DROP INDEX "BookingSeat_showSeatId_key";
CREATE INDEX "BookingSeat_showSeatId_idx" ON "BookingSeat"("showSeatId");
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE UNIQUE INDEX "Payment_providerRefundId_key" ON "Payment"("providerRefundId");
