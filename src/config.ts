import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  // Allow both localhost and 127.0.0.1 so CORS works either way
  allowedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.FRONTEND_URL ?? 'http://localhost:3000',
  ].filter(Boolean),

  // Worker
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '5', 10),
  minDelayBetweenEmailsMs: parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS ?? '2000', 10),
  maxEmailsPerHour: parseInt(process.env.MAX_EMAILS_PER_HOUR ?? '200', 10),
  maxEmailsPerHourPerSender: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER ?? '50', 10),

  // Ethereal
  etherealUser: process.env.ETHEREAL_USER ?? '',
  etherealPass: process.env.ETHEREAL_PASS ?? '',
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
