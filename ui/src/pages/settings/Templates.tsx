import { FileText, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { FormMsg, LoadGate, SettingsPage } from '@/components/SettingsPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ago, HEADER_LABEL, STATUS_LABEL, STATUS_TONE, type Tpl, type TplList } from '@/lib/templates'
import { useLoad } from '@/lib/useLoad'

export default function Templates() {
  const { state: auth } = useAuth()
  const isAdmin = auth.status === 'in' && auth.me.staff.role === 'admin'
  const { state, reload, set } = useLoad<TplList>('/api/templates')
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({})

  const sync = async () => {
    setSyncing(true); setMsg({})
    try {
      const r = await api<TplList & { count?: number; changed?: number }>('/api/templates/sync', { method: 'POST' })
      await reload()
      setMsg({ ok: r.changed ? `Synced. ${r.changed} updated.` : 'Synced. Nothing changed.' })
    } catch (e) { setMsg({ error: (e as Error).message }) } finally { setSyncing(false) }
  }
  const remove = async (t: Tpl) => {
    if (!window.confirm(`Delete ${t.name} (${t.language})? This also deletes it at Meta.`)) return
    setMsg({})
    try {
      await api(`/api/templates/${encodeURIComponent(t.id)}`, { method: 'DELETE' })
      if (state.status === 'ready') set({ ...state.data, templates: state.data.templates.filter((x) => x.id !== t.id) })
    } catch (e) { setMsg({ error: (e as Error).message }) }
  }

  return (
    <SettingsPage
      title="Templates" subtitle="Approved templates are the only way to message outside the 24 hour window."
      actions={<>
        <Button variant="secondary" loading={syncing} onClick={() => void sync()}>{!syncing && <RefreshCw aria-hidden className="h-4 w-4" />}Sync</Button>
        {isAdmin && <Link to="/settings/templates/new" className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90"><Plus aria-hidden className="h-4 w-4" />New</Link>}
      </>}
    >
      <FormMsg error={msg.error} ok={msg.ok} />
      <LoadGate load={state} retry={() => void reload()} rows={4}>
        {(d) => d.templates.length === 0
          ? <EmptyState icon={FileText} title="No templates yet" body={isAdmin ? 'Create one, or sync to pull in the ones already approved at Meta.' : 'Ask an admin to create one, or sync to pull in existing ones.'} action={isAdmin ? <Link to="/settings/templates/new" className="inline-flex min-h-[40px] items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground">Create the first one</Link> : undefined} />
          : (
            <>
              <ul className="divide-y rounded-lg border bg-surface" aria-label="Templates">
                {d.templates.map((t) => (
                  <li key={t.id} className={`px-4 py-3 ${t.sendable === false ? 'opacity-60' : ''}`} data-testid={`tpl-${t.name}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{t.name}</p>
                        <p className="mt-0.5 line-clamp-2 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{t.body}</p>
                      </div>
                      <span className="shrink-0" data-testid="tpl-status"><Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status] ?? t.status}</Badge></span>
                      {isAdmin && <Button variant="ghost" aria-label={`Delete ${t.name}`} className="w-11 shrink-0 px-0" onClick={() => void remove(t)}><Trash2 aria-hidden className="h-4 w-4" /></Button>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t.language} · {t.category.toLowerCase()} · {HEADER_LABEL[t.header_format] ?? t.header_format} · synced {ago(t.synced_at)}</p>
                    {t.sendable === false && <p role="note" className="mt-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">Not sendable from WhaLeads. {t.unsendable_reason}</p>}
                    {t.status === 'REJECTED' && (
                      <p role="note" title={t.rejected_reason ?? undefined} className="mt-2 break-words rounded-md bg-danger/10 px-3 py-2 text-xs text-danger [overflow-wrap:anywhere]">
                        <strong>Rejected by Meta.</strong> {t.rejected_reason || 'No reason given.'}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Last synced {ago(d.synced_at)}.{d.pending > 0 ? ` ${d.pending} pending, checked hourly.` : ''}</p>
            </>
          )}
      </LoadGate>
    </SettingsPage>
  )
}
