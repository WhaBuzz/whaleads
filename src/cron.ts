// Cron entry. The trigger fires every minute: the flow tick runs on every firing, and the older 15-minute jobs
// (media retries, session/rate-limit purge, send-record repair, template sync, dead push subscriptions) run only on
// minutes divisible by 15, exactly as before. The finished-run purge runs once a day at 03:00 UTC.
import type { Env } from './db'
import { ensureSchema, logEvent } from './db'
import { LIMITS } from './flows/types'
import { purgeFinishedRuns, tick, type TickResult } from './flows/tick'
import { scheduled as mediaJobs } from './media'
import { purgeDeadSubscriptions } from './push'
import { syncPendingTemplates } from './templates' // S5

export interface CronJobs {
  tick: (env: Env, opts: { dbBudget: number; sweep: boolean; now: number }) => Promise<TickResult>
  quarterHour: (env: Env) => Promise<void>
  daily: (env: Env, now: number) => Promise<void>
}

export const isQuarterHour = (scheduledTime: number) => new Date(scheduledTime).getUTCMinutes() % 15 === 0
export const isDailyRun = (scheduledTime: number) => { const d = new Date(scheduledTime); return d.getUTCHours() === 3 && d.getUTCMinutes() === 0 }

export const DEFAULT_JOBS: CronJobs = {
  tick: (env, o) => tick(env, o),
  quarterHour: async (env) => { await mediaJobs(env); await syncPendingTemplates(env).catch(() => {}); await purgeDeadSubscriptions(env).catch(() => {}) },
  daily: async (env, now) => { await purgeFinishedRuns(env, Math.floor(now / 1000)) },
}

/**
 * One cron firing. Awaited by the caller (not waitUntil): a cron invocation may run for minutes, whereas
 * waitUntil work is cut 30 s after the handler returns. Each job is isolated so one failing never skips the rest.
 */
export async function runCron(env: Env, scheduledTime: number = Date.now(), jobs: CronJobs = DEFAULT_JOBS): Promise<{ ran: string[] }> {
  const ran: string[] = []
  await ensureSchema(env.DB)
  const quarter = isQuarterHour(scheduledTime)
  const guard = async (name: string, fn: () => Promise<unknown>) => {
    ran.push(name)
    try { await fn() } catch (e) { await logEvent(env.DB, 'cron_error', { job: name, error: String(e).slice(0, 300) }).catch(() => {}) }
  }
  await guard('flow_tick', async () => {
    const r = await jobs.tick(env, { dbBudget: quarter ? LIMITS.TICK_DB_CALLS_SHARED : LIMITS.TICK_DB_CALLS, sweep: quarter, now: Math.floor(scheduledTime / 1000) })
    if (r.resumed || r.stalled || r.abandoned) await logEvent(env.DB, 'flow_tick', { ...r })
  })
  if (quarter) await guard('quarter_hour', () => jobs.quarterHour(env))
  if (isDailyRun(scheduledTime)) await guard('daily', () => jobs.daily(env, scheduledTime))
  // One overwritten row (never a per-tick events row): /api/health reports it so a silent cron is visible.
  await env.DB.prepare(`INSERT INTO meta (key,value) VALUES ('cron_last_at', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(String(Math.floor(Date.now() / 1000))).run().catch(() => {})
  return { ran }
}
