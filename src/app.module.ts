import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { BookingModule } from './modules/booking/booking.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { CityModule } from './modules/city/city.module';
import { MovieModule } from './modules/movie/movie.module';
import { ScreenModule } from './modules/screen/screen.module';
import { SeatModule } from './modules/seat/seat.module';
import { ShowModule } from './modules/show/show.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { VenueModule } from './modules/venue/venue.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    CityModule,
    VenueModule,
    MovieModule,
    ScreenModule,
    SeatModule,
    ShowModule,
    BookingModule,
    TicketModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
