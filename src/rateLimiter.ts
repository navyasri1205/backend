import { redis } from './redis.js';
import { config } from './config.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Get current hour window key (e.g. "2025-01-30T14").
 */
function getHourWindow(date: Date = new Date()): string {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 13);
}

/**
 * Redis key for global hourly count.
 */
function globalKey(hourWindow: string): string {
  return `rate:global:${hourWindow}`;
}

/**
 * Redis key for per-sender hourly count.
 */
function senderKey(hourWindow: string, senderId: string): string {
  return `rate:sender:${hourWindow}:${senderId}`;
}

/**
 * Get current count for this hour (global).
 */
export async function getGlobalHourlyCount(): Promise<number> {
  const window = getHourWindow();
  const count = await redis.get(globalKey(window));
  return count ? parseInt(count, 10) : 0;
}

/**
 * Get current count for this hour for a sender.
 */
export async function getSenderHourlyCount(senderId: string): Promise<number> {
  const window = getHourWindow();
  const count = await redis.get(senderKey(window, senderId));
  return count ? parseInt(count, 10) : 0;
}

/**
 * Check if we can send one more email this hour (global + per-sender).
 * Returns true if allowed.
 */
export async function canSendEmail(senderId?: string): Promise<boolean> {
  const [globalCount, senderCount] = await Promise.all([
    redis.get(globalKey(getHourWindow())).then((c: string | null) => (c ? parseInt(c, 10) : 0)),
    senderId
      ? redis.get(senderKey(getHourWindow(), senderId)).then((c: string | null) => (c ? parseInt(c, 10) : 0))
      : Promise.resolve(0),
  ]);

  if (globalCount >= config.maxEmailsPerHour) return false;
  if (senderId && senderCount >= config.maxEmailsPerHourPerSender) return false;
  return true;
}

/**
 * Increment hourly counter after sending. Call this only after successful send.
 * Keys expire after 2 hours to avoid unbounded growth.
 */
export async function incrementHourlyCount(senderId?: string): Promise<void> {
  const window = getHourWindow();
  const multi = redis.multi();
  multi.incr(globalKey(window));
  multi.expire(globalKey(window), 7200); // 2 hours
  if (senderId) {
    multi.incr(senderKey(window, senderId));
    multi.expire(senderKey(window, senderId), 7200);
  }
  await multi.exec();
}

/**
 * Get the start of the next hour window (for rescheduling when rate limited).
 */
export function getNextHourWindowStart(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(next.getHours() + 1);
  next.setMinutes(0, 0, 0);
  return next;
}
