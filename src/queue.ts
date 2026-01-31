import { Queue } from 'bullmq';
import { config } from './config.js';
import { redis } from './redis.js';

export const EMAIL_QUEUE_NAME = 'email-send';

export interface EmailJobData {
  emailJobId: string;
  campaignId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  senderKey?: string; // for per-sender rate limiting
}

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});
