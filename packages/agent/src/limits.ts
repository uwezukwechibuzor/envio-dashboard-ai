import { AgentError } from './types.js';

export const MAX_REQUESTS_PER_DAY = 50;
export const MAX_TOKENS_PER_REQUEST = 500_000;

type UserRecord = { date: string; count: number; tokens: number };
const userRecords = new Map<string, UserRecord>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function getOrCreate(userId: string): UserRecord {
  const d = today();
  const existing = userRecords.get(userId);
  if (!existing || existing.date !== d) {
    const fresh: UserRecord = { date: d, count: 0, tokens: 0 };
    userRecords.set(userId, fresh);
    return fresh;
  }
  return existing;
}

export function checkLimits(userId: string): void {
  const record = getOrCreate(userId);
  if (record.count >= MAX_REQUESTS_PER_DAY) {
    throw new AgentError(
      'RATE_LIMIT_EXCEEDED',
      `Daily request limit (${MAX_REQUESTS_PER_DAY}) exceeded for user ${userId}. Try again tomorrow.`,
    );
  }
  record.count++;
}

export function recordTokenUsage(userId: string, tokens: number): void {
  const record = userRecords.get(userId);
  if (record && record.date === today()) {
    record.tokens += tokens;
  }
}

export function getUserStats(userId: string): UserRecord {
  return getOrCreate(userId);
}

export function resetUserStats(userId: string): void {
  userRecords.delete(userId);
}
