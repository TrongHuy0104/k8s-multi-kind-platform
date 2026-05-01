import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
    constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) { }

    async ping(): Promise<string> {
        return this.client.ping();
    }

    async set(key: string, value: string): Promise<string> {
        return this.client.set(key, value, 'EX', 3600);
    }

    async get(key: string): Promise<string | null> {
        return this.client.get(key);
    }

    async isHealthy(): Promise<boolean> {
        try {
            const res = await this.client.ping();
            return res === 'PONG';
        } catch {
            return false;
        }
    }
}