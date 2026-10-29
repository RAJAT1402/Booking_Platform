import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { BookingService } from './booking.service';
import { RazorpayService } from './razorpay.service';

interface WebhookEntity {
  id?: string;
  order_id?: string;
}

interface WebhookEvent {
  event?: string;
  payload?: {
    payment?: { entity?: WebhookEntity };
    refund?: { entity?: WebhookEntity };
  };
}

@Controller('payments/razorpay')
export class RazorpayWebhookController {
  private readonly webhookSecret: string;

  constructor(
    private readonly booking: BookingService,
    private readonly razorpay: RazorpayService,
    config: ConfigService,
  ) {
    this.webhookSecret = config.getOrThrow<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!this.webhookSecret)
      throw new Error('RAZORPAY_WEBHOOK_SECRET must be configured');
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: RawBodyRequest<Request>) {
    const signature = req.header('x-razorpay-signature') ?? '';
    if (!req.rawBody) throw new BadRequestException('Missing raw webhook body');
    this.razorpay.verifyWebhookSignature(
      req.rawBody,
      signature,
      this.webhookSecret,
    );

    const event = req.body as WebhookEvent;
    if (event.event === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      if (!payment?.id || !payment.order_id) {
        throw new BadRequestException('Invalid payment webhook payload');
      }
      await this.booking.processCapturedPayment(payment.order_id, payment.id);
    } else if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      if (!refund?.id)
        throw new BadRequestException('Invalid refund webhook payload');
      await this.booking.markRefundProcessed(refund.id);
    }
    return { received: true };
  }
}
