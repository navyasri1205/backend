import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { Prisma } from '@prisma/client';

const router = Router();

const querySchema = z.object({
  userId: z.string().optional(),
  status: z.enum(['scheduled', 'sent']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * List scheduled emails (pending/delayed).
 */
router.get('/scheduled', async (req, res) => {
  try {
    const q = querySchema.safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ error: 'Invalid query', details: q.error.flatten() });
    }

    const { userId, limit, offset } = q.data;

    const where = {
      status: { in: ['pending', 'delayed'] },
    } as unknown as Prisma.EmailJobWhereInput;

    if (userId) {
      where.campaign = { userId };
    }

    const [jobs, total] = await Promise.all([
      prisma.emailJob.findMany({
        where,
        include: { campaign: { select: { userId: true } } },
        orderBy: { scheduledAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.emailJob.count({ where }),
    ]);

    const items = jobs.map((j) => ({
      id: j.id,
      email: j.recipientEmail,
      subject: j.subject,
      scheduledAt: j.scheduledAt.toISOString(),
      status: j.status,
    }));

    return res.json({ items, total, limit, offset });
  } catch (err) {
    console.error('List scheduled error:', err);
    return res.status(500).json({ error: 'Failed to list scheduled emails' });
  }
});

/**
 * List sent emails (sent/failed).
 */
router.get('/sent', async (req, res) => {
  try {
    const q = querySchema.safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ error: 'Invalid query', details: q.error.flatten() });
    }

    const { userId, limit, offset } = q.data;

    const where = {
      status: { in: ['sent', 'failed'] },
    } as unknown as Prisma.EmailJobWhereInput;

    if (userId) {
      where.campaign = { userId };
    }

    const [jobs, total] = await Promise.all([
      prisma.emailJob.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.emailJob.count({ where }),
    ]);

    const items = jobs.map((j) => ({
      id: j.id,
      email: j.recipientEmail,
      subject: j.subject,
      sentAt: j.sentAt?.toISOString() ?? j.updatedAt.toISOString(),
      status: j.status,
      errorMessage: j.errorMessage ?? undefined,
    }));

    return res.json({ items, total, limit, offset });
  } catch (err) {
    console.error('List sent error:', err);
    return res.status(500).json({ error: 'Failed to list sent emails' });
  }
});

export default router;
