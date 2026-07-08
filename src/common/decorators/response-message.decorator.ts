import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message';

/**
 * Overrides the default success message in the wrapped API response.
 *
 * @example
 * @ResponseMessage('City created')
 * @Post()
 * create(@Body() dto: CreateCityDto) { ... }
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
