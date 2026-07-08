import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from './common/decorators/response-message.decorator';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ResponseMessage('OK')
  getHello(): string {
    return this.appService.getHello();
  }
}
