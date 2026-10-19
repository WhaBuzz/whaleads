import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_JOBS, isDailyRun, isQuarterHour, runCron, type CronJobs } from '../src/cron'
import { rig, type Rig } from './flows.helpers'

let r: Rig
beforeEach(async () => { r = await rig() })
const at = (hh: number, mm: number) => Date.UTC(2026, 9, 19, hh, mm, 0)
const empty = { resumed: 0, completed: 0, awaiting: 0, failed: 0, skipped: 0, stalled: 0, abandoned: 0, dbCalls: 0, more: false }

function jobs() {
  const log: string[] = []
  const budgets: { dbBudget: number; sweep: boolean; now: number }[] = []
  const j: CronJobs = {
    tick: async (_e, o) => { log.push('tick'); budgets.push(o); return empty },
    quarterHour: async () => { log.push('quarter') },
    daily: async () => { log.push('daily') },
  }
  return { j, log, budgets }
}

describe('cron gating', () => {
  it('the minute boundary helpers', () => {
    expect([0, 15, 30, 45].every((m) => isQuarterHour(at(5, m)))).toBe(true)
    expect([1, 7, 14, 16, 29, 59].some((m) => isQuarterHour(at(5, m)))).toBe(false)
    expect(isDailyRun(at(3, 0))).toBe(true)
    expect(isDailyRun(at(3, 1))).toBe(false)
    expect(isDailyRun(at(4, 0))).toBe(false)
  })
  it('the tick runs every minute; the 15-minute jobs only on the quarter hour', async () => {
    const ranQuarter: number[] = [], ranTick: number[] = []
    for (let m = 0; m < 60; m++) {
      const { j, log } = jobs()
      await runCron(r.env, at(10, m), j)
      if (log.includes('tick')) ranTick.push(m)
      if (log.includes('quarter')) ranQuarter.push(m)
    }
    expect(ranTick).toHaveLength(60)
    expect(ranQuarter).toEqual([0, 15, 30, 45])
  })
  it('the daily purge runs once a day at 03:00 UTC only', async () => {
    const hits: string[] = []
    for (const [h, m] of [[2, 59], [3, 0], [3, 15], [3, 45], [4, 0]] as const) {
      const { j, log } = jobs(); await runCron(r.env, at(h, m), j)
      if (log.includes('daily')) hits.push(`${h}:${m}`)
    }
    expect(hits).toEqual(['3:0'])
  })
  it('quarter minutes get the smaller shared D1 budget and the abandon sweep', async () => {
    const a = jobs(); await runCron(r.env, at(1, 7), a.j)
    const b = jobs(); await runCron(r.env, at(1, 15), b.j)
    expect(a.budgets[0]).toMatchObject({ dbBudget: 40, sweep: false, now: Math.floor(at(1, 7) / 1000) })
    expect(b.budgets[0]).toMatchObject({ dbBudget: 20, sweep: true })
  })
  it('one failing job never skips the others, and is logged', async () => {
    const { j, log } = jobs()
    j.tick = async () => { throw new Error('boom') }
    await runCron(r.env, at(3, 0), j)
    expect(log).toEqual(['quarter', 'daily'])
    const row = r.raw.prepare(`SELECT kind FROM events WHERE kind='cron_error'`).get()
    expect(row).toBeTruthy()
  })
  it('the real default jobs run on a quarter hour against an empty database', async () => {
    expect((await runCron(r.env, at(3, 0), DEFAULT_JOBS)).ran).toEqual(['flow_tick', 'quarter_hour', 'daily'])
  })
})
