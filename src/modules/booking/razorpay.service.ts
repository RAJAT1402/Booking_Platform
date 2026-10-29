import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
}

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

@Injectable()
export class RazorpayService {
  private readonly keyId: string;
  private readonly keySecret: string;

  constructor(config: ConfigService) {
    this.keyId = config.getOrThrow<string>('RAZORPAY_KEY_ID');
    this.keySecret = config.getOrThrow<string>('RAZORPAY_KEY_SECRET');
    if (!this.keyId || !this.keySecret) {
      throw new Error(
        'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured',
      );
    }
  }

  get checkoutKeyId() {
    return this.keyId;
  }

  async createOrder(bookingId: string, amountPaise: number) {
    const order = await this.request<RazorpayOrder>('POST', '/orders', {
      amount: amountPaise,
      currency: 'INR',
      receipt: bookingId,
      notes: { bookingId },
    });
    if (!order.id || order.amount !== amountPaise || order.currency !== 'INR') {
      throw new BadGatewayException('Invalid Razorpay order response');
    }
    return order;
  }

  async getPayment(paymentId: string) {
    return this.request<RazorpayPayment>(
      'GET',
      `/payments/${encodeURIComponent(paymentId)}`,
    );
  }

  async refund(paymentId: string, amountPaise: number) {
    return this.request<RazorpayRefund>(
      'POST',
      `/payments/${encodeURIComponent(paymentId)}/refund`,
      { amount: amountPaise },
    );
  }

  async getRefund(refundId: string) {
    return this.request<RazorpayRefund>(
      'GET',
      `/refunds/${encodeURIComponent(refundId)}`,
    );
  }

  async listRefunds(paymentId: string) {
    return this.request<{ items: RazorpayRefund[] }>(
      'GET',
      `/payments/${encodeURIComponent(paymentId)}/refunds`,
    );
  }

  verifyCheckoutSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ) {
    const expected = createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    if (!this.safeEqual(expected, signature)) {
      throw new UnauthorizedException('Invalid Razorpay payment signature');
    }
  }

  verifyWebhookSignature(body: Buffer, signature: string, secret: string) {
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    if (!this.safeEqual(expected, signature)) {
      throw new UnauthorizedException('Invalid Razorpay webhook signature');
    }
  }

  private safeEqual(expected: string, supplied: string): boolean {
    if (!/^[a-f0-9]{64}$/i.test(supplied ?? '')) return false;
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(supplied, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: object,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new BadGatewayException('Razorpay is temporarily unavailable');
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `Razorpay request failed (${response.status})`,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new BadGatewayException('Invalid Razorpay response');
    }
  }
}
