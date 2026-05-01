import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { RedisService } from './redis.service';

@Controller('redis')
export class RedisController {
    constructor(private readonly redisService: RedisService) { }

    @Get('ping')
    async ping() {
        const result = await this.redisService.ping();
        return { pong: result };
    }

    @Post(':key')
    async set(@Param('key') key: string, @Body('value') value: string) {
        await this.redisService.set(key, value);
        return { ok: true, key, value };
    }

    @Get(':key')
    async get(@Param('key') key: string) {
        const value = await this.redisService.get(key);
        return { key, value };
    }
}