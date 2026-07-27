import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { TenantMiddleware } from './middleware/tenant.middleware.js';

@Module({
  imports: [HealthModule],
})
export class AppModule {
  configure(consumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
