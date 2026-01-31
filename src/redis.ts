import Redis from 'ioredis';
import { config } from './config.js';

// ioredis type incompatibilities can occur with certain bundlers; cast to any for constructor
const RedisCtor: any = Redis as any;
export const redis = new RedisCtor(config.redisUrl, {
  maxRetriesPerRequest: null,
});

redis.on('error', (err: unknown) => console.error('Redis error:', err));
