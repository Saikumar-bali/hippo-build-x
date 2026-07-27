import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'hippo-api',
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check endpoint' })
  ready() {
    // TODO: Check database, Redis, and other dependencies
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
        redis: 'ok',
      },
    };
  }
}
