import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { RedisController } from './redis.controller';
import { REDIS_CLIENT } from './redis.constants';

@Module({
    providers: [
        {
            provide: 'REDIS_CLIENT',
            useFactory: (config: ConfigService) => {
                return new Redis({
                    host: config.get('REDIS_HOST', 'redis-0.redis-headless.k8s-platform-lab.svc.cluster.local'),
                    port: config.get<number>('REDIS_PORT', 6379),
                    password: config.get('REDIS_PASSWORD'),
                });
            },
            inject: [ConfigService],
        },
        RedisService,
    ],
    controllers: [RedisController],
    exports: [RedisService],
})
export class RedisModule { }