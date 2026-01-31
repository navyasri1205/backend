import { Worker, Job } from 'bullmq';
import { config } from './config.js';
import { redis } from './redis.js';
import { prisma } from './db.js';
import { sendMail } from './mailer.js';
import {
  canSendEmail,
  incrementHourlyCount,
  getNextHourWindowStart,
} from './rateLimiter.js';
import { emailQueue, EMAIL_QUEUE_NAME, type EmailJobData } from './queue.js';

const SENDER_KEY = 'default'; // can be per-tenant from job data later

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailJobId, recipientEmail, subject, body, senderKey: jobSenderKey } = job.data;
  const senderId = jobSenderKey ?? SENDER_KEY;

  // Idempotency: ensure we don't send twice
  const record = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    select: { status: true, bullJobId: true },
  });
  if (!record) {
    throw new Error(`EmailJob ${emailJobId} not found`);
  }
  if (record.status === 'sent') {
    console.log(`EmailJob ${emailJobId} already sent, skipping (idempotent)`);
    return;
  }
  if (record.bullJobId && record.bullJobId !== job.id) {
    console.log(`EmailJob ${emailJobId} processed by another job, skipping`);
    return;
  }

  // Rate limit: if hourly limit reached, reschedule to next hour (re-add with delay)
  const allowed = await canSendEmail(senderId);
  if (!allowed) {
    const nextHour = getNextHourWindowStart();
    const delayMs = Math.max(0, nextHour.getTime() - Date.now());
    await emailQueue.add('send-email', job.data, { delay: delayMs, jobId: `${emailJobId}-retry-${nextHour.getTime()}` });
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'delayed', scheduledAt: nextHour, updatedAt: new Date() },
    });
    console.log(`Rate limit reached for ${emailJobId}, delayed to ${nextHour.toISOString()}`);
    return;
  }

  // Min delay between emails is enforced by BullMQ limiter (max 1 per minDelayMs)

  try {
    await sendMail({
      to: recipientEmail,
      subject,
      text: body,
    });
    await incrementHourlyCount(senderId);
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'failed',
        errorMessage: message,
        updatedAt: new Date(),
      },
    });
    throw err;
  }
}

const worker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job) => processEmailJob(job),
  {
    connection: redis,
    concurrency: config.workerConcurrency,
    limiter: {
      max: 1,
      duration: config.minDelayBetweenEmailsMs,
    },
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err?.message);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

console.log(
  `Email worker started (concurrency=${config.workerConcurrency}, minDelayMs=${config.minDelayBetweenEmailsMs})`
);

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});
