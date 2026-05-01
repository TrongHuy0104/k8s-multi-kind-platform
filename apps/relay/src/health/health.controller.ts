import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private redis: RedisService,
    ) { }

    @Get()
    @HealthCheck()
    check() {
        return this.health.check([
            async () => ({
                redis: {
                    status: (await this.redis.isHealthy()) ? 'up' : 'down',
                },
            }),
        ]);
    }
}