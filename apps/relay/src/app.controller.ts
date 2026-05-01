import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { RedisService } from './redis/redis.service';

@Controller()
export class AppController {
    constructor(private readonly redis: RedisService) { }

    @Get()
    getInfo() {
        return { service: 'relay', version: '1.0.0', status: 'ok' };
    }

    @Post('cache/:key')
    async setCache(@Param('key') key: string, @Body('value') value: string) {
        await this.redis.set(key, value);
        return { ok: true };
    }

    @Get('cache/:key')
    async getCache(@Param('key') key: string) {
        const value = await this.redis.get(key);
        return { key, value };
    }
}