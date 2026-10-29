import { IsString, Matches } from 'class-validator';

export class VerifyPaymentDto {
  @IsString()
  razorpay_order_id: string;

  @IsString()
  razorpay_payment_id: string;

  @Matches(/^[a-f0-9]{64}$/i)
  razorpay_signature: string;
}
