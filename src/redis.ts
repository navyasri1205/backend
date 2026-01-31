import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => console.error('Redis error:', err));
