import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { RazorpayService } from './razorpay.service';

describe('Razorpay signature verification', () => {
  const service = new RazorpayService(
    new ConfigService({
      RAZORPAY_KEY_ID: 'rzp_test_example',
      RAZORPAY_KEY_SECRET: 'test-api-secret',
    }),
  );

  it('accepts the signed order and payment pair and rejects tampering', () => {
    const signature = createHmac('sha256', 'test-api-secret')
      .update('order_1|pay_1')
      .digest('hex');
    expect(() =>
      service.verifyCheckoutSignature('order_1', 'pay_1', signature),
    ).not.toThrow();
    expect(() =>
      service.verifyCheckoutSignature('order_1', 'pay_2', signature),
    ).toThrow(UnauthorizedException);
  });

  it('verifies the exact raw webhook bytes', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const signature = createHmac('sha256', 'webhook-secret')
      .update(body)
      .digest('hex');
    expect(() =>
      service.verifyWebhookSignature(body, signature, 'webhook-secret'),
    ).not.toThrow();
    expect(() =>
      service.verifyWebhookSignature(
        Buffer.from('{}'),
        signature,
        'webhook-secret',
      ),
    ).toThrow(UnauthorizedException);
  });
});
