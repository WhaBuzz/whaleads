import { useMemo, useState, type FormEvent } from 'react'
import { CountrySelect, timezoneList } from '@/components/CountrySelect'
import { Card, FormMsg, LoadGate, SettingsPage } from '@/components/SettingsPage'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLoad } from '@/lib/useLoad'

type Day = { open: string; close: string } | null
type Hours = Record<string, Day>
interface Resp { settings: { business_name: string; default_country: string | null; timezone: string; working_hours: Hours | null }; sources: Record<string, string> }
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const

function Form({ data, reloadMe }: { data: Resp; reloadMe: () => void }) {
  const s = data.settings
  const [name, setName] = useState(s.business_name)
  const [country, setCountry] = useState(s.default_country ?? '')
  const [tz, setTz] = useState(s.timezone)
  const [hours, setHours] = useState<Hours>(() => Object.fromEntries(DAYS.map(([k]) => [k, s.working_hours?.[k] ?? null])))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(''); const [ok, setOk] = useState('')
  const zones = useMemo(() => timezoneList(tz), [tz])
  const setDay = (k: string, d: Day) => setHours({ ...hours, [k]: d })

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setOk('')
    try {
      await api('/api/settings', { method: 'PATCH', body: { business_name: name, default_country: country || null, timezone: tz, working_hours: hours } })
      setOk('Saved.'); reloadMe()
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save}>
      <Card title="Business">
        <div className="space-y-4">
          <Field id="business_name" label="Business name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <div><Label htmlFor="country">Default country</Label><CountrySelect id="country" value={country} onChange={setCountry} /><p className="mt-1 text-xs text-muted-foreground">Used to read phone numbers typed without a country code.</p></div>
          <div><Label htmlFor="tz">Timezone</Label><Select id="tz" value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</Select></div>
        </div>
      </Card>
      <Card title="Working hours">
        <ul className="space-y-2">
          {DAYS.map(([k, label]) => {
            const d = hours[k]
            return (
              <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="flex min-h-[40px] w-32 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!d} onChange={(e) => setDay(k, e.target.checked ? { open: '09:00', close: '18:00' } : null)} className="h-4 w-4 accent-[hsl(var(--accent))]" />{label}</label>
                {d ? (
                  <span className="flex items-center gap-2">
                    <input aria-label={`${label} opens`} type="time" value={d.open} onChange={(e) => setDay(k, { ...d, open: e.target.value })} className="min-h-[40px] rounded-md border bg-surface px-2 text-base" />
                    <span className="text-muted-foreground">to</span>
                    <input aria-label={`${label} closes`} type="time" value={d.close} onChange={(e) => setDay(k, { ...d, close: e.target.value })} className="min-h-[40px] rounded-md border bg-surface px-2 text-base" />
                  </span>
                ) : <span className="text-sm text-muted-foreground">Closed</span>}
              </li>
            )
          })}
        </ul>
      </Card>
      <div className="flex items-center gap-3"><Button type="submit" loading={busy}>Save changes</Button><FormMsg error={err} ok={ok} /></div>
    </form>
  )
}

export default function Business() {
  const { refresh } = useAuth()
  const l = useLoad<Resp>('/api/settings')
  return (
    <SettingsPage title="Business" subtitle="How your workspace appears and keeps time">
      <LoadGate load={l.state} retry={() => void l.reload()}>{(d) => <Form data={d} reloadMe={() => void refresh()} />}</LoadGate>
    </SettingsPage>
  )
}
