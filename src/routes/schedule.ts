import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { emailQueue } from '../queue.js';
import type { EmailJobData } from '../queue.js';

const router = Router();

const ScheduleBodySchema = z.object({
  userId: z.string().min(1),
  userEmail: z.string().email().optional(),
  userName: z.string().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  recipients: z.array(z.string().email()).min(1),
  startTime: z.string().datetime(),
  delayBetweenMs: z.number().int().min(0),
  hourlyLimit: z.number().int().min(1),
});

router.post('/', async (req, res) => {
  try {
    const parsed = ScheduleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const {
      userId,
      userEmail,
      userName,
      subject,
      body,
      recipients,
      startTime,
      delayBetweenMs,
      hourlyLimit,
    } = parsed.data;

    const start = new Date(startTime);
    if (start.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'startTime must be in the future' });
    }

    // Ensure user exists
    const user = await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: userEmail ?? `user-${userId}@placeholder.local`,
        name: userName ?? null,
        googleId: userId,
      },
      update: {
        email: userEmail,
        name: userName,
      },
    });

    // Create campaign
    const campaign = await prisma.emailCampaign.create({
      data: {
        userId: user.id,
        subject,
        body,
        startTime: start,
        delayBetweenMs,
        hourlyLimit,
        status: 'scheduled',
      },
    });

    // Create DB jobs first (idempotency)
    const jobs: { id: string; recipientEmail: string; scheduledAt: Date }[] =
      [];

    for (let i = 0; i < recipients.length; i++) {
      const scheduledAt = new Date(start.getTime() + i * delayBetweenMs);

      const job = await prisma.emailJob.create({
        data: {
          campaignId: campaign.id,
          recipientEmail: recipients[i],
          subject,
          body,
          scheduledAt,
          status: 'pending',
        },
      });

      jobs.push({
        id: job.id,
        recipientEmail: job.recipientEmail,
        scheduledAt: job.scheduledAt,
      });
    }

    // Add BullMQ delayed jobs
    for (const j of jobs) {
      const delayMs = Math.max(0, j.scheduledAt.getTime() - Date.now());

      const data: EmailJobData = {
        emailJobId: j.id,
        campaignId: campaign.id,
        recipientEmail: j.recipientEmail,
        subject,
        body,
        senderKey: userId,
      };

      const bullJob = await emailQueue.add('send-email', data, {
        delay: delayMs,
        jobId: j.id,
      });

      await prisma.emailJob.update({
        where: { id: j.id },
        data: { bullJobId: bullJob.id ?? undefined },
      });
    }

    return res.status(201).json({
      campaignId: campaign.id,
      totalScheduled: jobs.length,
      startTime: start.toISOString(),
      jobs: jobs.slice(0, 10),
    });
  } catch (err) {
    console.error('Schedule error:', err);

    if (config.nodeEnv !== 'production') {
      return res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return res.status(500).json({ error: 'Failed to schedule emails' });
  }
});

export default router;
