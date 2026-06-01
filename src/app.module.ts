import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CityModule } from './modules/city/city.module';
import { VenueModule } from './modules/venue/venue.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, CityModule, VenueModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
