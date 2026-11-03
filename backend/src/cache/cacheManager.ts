import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const TTL_ODDS_MS = 15 * 60 * 1000;      // 15 minuti
export const TTL_RSS_MS = 2 * 60 * 60 * 1000;   // 2 ore
export const TTL_STATS_MS = 6 * 60 * 60 * 1000; // 6 ore
export const TTL_FIXTURES_MS = 60 * 60 * 1000;  // 1 ora

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

const DISK_CACHE_FILE = path.join(os.tmpdir(), 'samubet-dev-cache-v1.json');

class CacheAndQuotaManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private ipRequests = new Map<string, number[]>();

  private currentDayKey: string = this.getTodayKey();
  private currentMonthKey: string = this.getMonthKey();
  private dailyExternalApiCalls = 0;
  private monthlyGroundingCalls = 0;
  private oddsApiRemainingCredits: number | null = null;
  private oddsApiUsedCredits: number | null = null;

  // AI telemetry
  private aiLatencies: number[] = [];
  private activeAiModel = 'gemini-3.8-flash';

  constructor() {
    this.loadFromDisk();
  }

  private getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getMonthKey(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private loadFromDisk(): void {
    if (process.env.NODE_ENV === 'test') return;
    try {
      if (!fs.existsSync(DISK_CACHE_FILE)) return;
      const raw = fs.readFileSync(DISK_CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as {
        entries?: Array<[string, CacheEntry<unknown>]>;
        dayKey?: string;
        monthKey?: string;
        dailyExternalApiCalls?: number;
        monthlyGroundingCalls?: number;
        oddsApiRemainingCredits?: number | null;
        oddsApiUsedCredits?: number | null;
        activeAiModel?: string;
      };
      const now = Date.now();
      if (Array.isArray(parsed.entries)) {
        for (const [k, v] of parsed.entries) {
          if (v && typeof v.expiresAt === 'number' && v.expiresAt > now) {
            this.cache.set(k, v);
          }
        }
      }
      if (parsed.dayKey === this.currentDayKey) {
        this.dailyExternalApiCalls = parsed.dailyExternalApiCalls || 0;
        this.oddsApiRemainingCredits = parsed.oddsApiRemainingCredits ?? null;
        this.oddsApiUsedCredits = parsed.oddsApiUsedCredits ?? null;
      }
      if (parsed.monthKey === this.currentMonthKey) {
        this.monthlyGroundingCalls = parsed.monthlyGroundingCalls || 0;
      }
      if (parsed.activeAiModel) {
        this.activeAiModel = parsed.activeAiModel;
      }
    } catch {
      // ignore corrupted cache file
    }
  }

  private saveToDisk(): void {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const now = Date.now();
      const validEntries: Array<[string, CacheEntry<unknown>]> = [];
      for (const [k, v] of this.cache.entries()) {
        if (v.expiresAt > now) {
          validEntries.push([k, v]);
        }
      }
      const payload = {
        dayKey: this.currentDayKey,
        monthKey: this.currentMonthKey,
        dailyExternalApiCalls: this.dailyExternalApiCalls,
        monthlyGroundingCalls: this.monthlyGroundingCalls,
        oddsApiRemainingCredits: this.oddsApiRemainingCredits,
        oddsApiUsedCredits: this.oddsApiUsedCredits,
        activeAiModel: this.activeAiModel,
        entries: validEntries
      };
      fs.writeFileSync(DISK_CACHE_FILE, JSON.stringify(payload), 'utf-8');
    } catch {
      // ignore disk write errors
    }
  }

  private ensureDayReset(): void {
    const today = this.getTodayKey();
    if (today !== this.currentDayKey) {
      this.currentDayKey = today;
      this.dailyExternalApiCalls = 0;
    }
    const month = this.getMonthKey();
    if (month !== this.currentMonthKey) {
      this.currentMonthKey = month;
      this.monthlyGroundingCalls = 0;
    }
  }

  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs: number): void {
    const now = Date.now();
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt: now + ttlMs
    });
    this.saveToDisk();
  }

  public checkIpRateLimit(ip: string): { allowed: boolean; remaining: number; resetInMinutes: number } {
    const isDev = process.env.NODE_ENV !== 'production';
    const configuredMax = Number(process.env.RATE_LIMIT_PER_IP_HOUR) || 15;
    const maxPerHour = isDev ? Math.max(configuredMax, 300) : configuredMax;
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const history = (this.ipRequests.get(ip) || []).filter((ts) => ts > oneHourAgo);
    if (history.length >= maxPerHour) {
      const oldest = history[0] || now;
      const resetInMinutes = Math.max(1, Math.ceil((oldest + 60 * 60 * 1000 - now) / 60000));
      return { allowed: false, remaining: 0, resetInMinutes };
    }

    history.push(now);
    this.ipRequests.set(ip, history);
    return {
      allowed: true,
      remaining: Math.max(0, maxPerHour - history.length),
      resetInMinutes: 60
    };
  }

  public canMakeExternalApiCall(): boolean {
    this.ensureDayReset();
    const dailyLimit = Number(process.env.DAILY_API_QUOTA_LIMIT) || 1000;
    if (this.oddsApiRemainingCredits !== null && this.oddsApiRemainingCredits <= 0) {
      return false;
    }
    if (this.dailyExternalApiCalls >= dailyLimit) {
      if (process.env.NODE_ENV !== 'production' && this.oddsApiRemainingCredits !== null && this.oddsApiRemainingCredits > 0) {
        return true;
      }
      return false;
    }
    return true;
  }

  public recordExternalApiCall(cost = 1): void {
    this.ensureDayReset();
    this.dailyExternalApiCalls += cost;
    this.saveToDisk();
  }

  public updateOddsApiHeaders(remainingHeader?: string | null, usedHeader?: string | null): void {
    if (remainingHeader && !Number.isNaN(Number(remainingHeader))) {
      this.oddsApiRemainingCredits = Number(remainingHeader);
    }
    if (usedHeader && !Number.isNaN(Number(usedHeader))) {
      this.oddsApiUsedCredits = Number(usedHeader);
    }
    this.saveToDisk();
  }

  // --- Grounding Budget Tracking ---
  public canMakeGroundingCall(): boolean {
    this.ensureDayReset();
    const enabled = process.env.GROUNDING_ENABLED === 'true';
    if (!enabled) return false;
    const budget = Number(process.env.GROUNDING_MONTHLY_BUDGET) || 4000;
    return this.monthlyGroundingCalls < budget;
  }

  public recordGroundingCall(count = 1): void {
    this.ensureDayReset();
    this.monthlyGroundingCalls += count;
    this.saveToDisk();
  }

  public getGroundingStatus() {
    this.ensureDayReset();
    const budget = Number(process.env.GROUNDING_MONTHLY_BUDGET) || 4000;
    const enabled = process.env.GROUNDING_ENABLED === 'true';
    return {
      enabled,
      month: this.currentMonthKey,
      used: this.monthlyGroundingCalls,
      budget,
      remaining: Math.max(0, budget - this.monthlyGroundingCalls),
      exhausted: this.monthlyGroundingCalls >= budget
    };
  }

  // --- AI Telemetry ---
  public recordAiLatency(ms: number, model?: string): void {
    this.aiLatencies.push(ms);
    if (this.aiLatencies.length > 50) this.aiLatencies.shift();
    if (model) {
      this.activeAiModel = model;
      this.saveToDisk();
    }
  }

  public getAiTelemetry() {
    const avgLatency =
      this.aiLatencies.length > 0
        ? Math.round(this.aiLatencies.reduce((a, b) => a + b, 0) / this.aiLatencies.length)
        : 0;
    return {
      activeModel: this.activeAiModel,
      avgLatencyMs: avgLatency,
      samples: this.aiLatencies.length
    };
  }

  public getQuotaStatus() {
    this.ensureDayReset();
    const dailyLimit = Number(process.env.DAILY_API_QUOTA_LIMIT) || 45;
    return {
      day: this.currentDayKey,
      dailyCallsUsed: this.dailyExternalApiCalls,
      dailyCallsLimit: dailyLimit,
      dailyQuotaExhausted: !this.canMakeExternalApiCall(),
      oddsApiRemainingCredits: this.oddsApiRemainingCredits,
      oddsApiUsedCredits: this.oddsApiUsedCredits,
      cacheEntriesCount: this.cache.size,
      grounding: this.getGroundingStatus(),
      aiTelemetry: this.getAiTelemetry()
    };
  }
}

export const sharedCache = new CacheAndQuotaManager();
