import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { RefreshDto } from './dto/refresh.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GoogleProfilePayload } from './strategies/google.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  // Redirects to Google's consent screen; Passport handles the redirect.
  googleLogin() {
    return;
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as GoogleProfilePayload;
    const { accessToken, refreshToken } =
      await this.authService.loginWithGoogle(profile);

    const frontend = this.config.getOrThrow<string>('FRONTEND_URL');
    const url = new URL(frontend);
    url.searchParams.set('accessToken', accessToken);
    url.searchParams.set('refreshToken', refreshToken);
    return res.redirect(url.toString());
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthUser, @Body() dto: RefreshDto) {
    await this.authService.logout(user.id, dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.id);
  }
}
