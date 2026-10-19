import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, FormMsg, SettingsPage } from '@/components/SettingsPage'
import { WaCard } from '@/components/templates/WaCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ApiError, api } from '@/lib/api'
import type { HeaderFormat } from '@/lib/templates'
import { placeholders, TEMPLATE_LIMITS, validateTemplate, type RuleIssue, type TemplateInput } from '../../../../src/templateRules'

const area = 'mt-1 w-full rounded-md border bg-surface px-3 py-2 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
const ACCEPT: Record<string, string> = { IMAGE: 'image/jpeg,image/png', VIDEO: 'video/mp4,video/3gpp', DOCUMENT: 'application/pdf' }

export default function TemplateCreate() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en')
  const [category, setCategory] = useState('UTILITY')
  const [format, setFormat] = useState<HeaderFormat>('NONE')
  const [headerText, setHeaderText] = useState('')
  const [headerSample, setHeaderSample] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [samples, setSamples] = useState<string[]>([])
  const [footer, setFooter] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<{ message: string; field?: string; hint?: string } | null>(null)
  const [touched, setTouched] = useState(false)

  const nums = useMemo(() => placeholders(body), [body])
  const headerNums = useMemo(() => (format === 'TEXT' ? placeholders(headerText) : []), [format, headerText])
  useEffect(() => { setSamples((s) => Array.from({ length: nums.length }, (_, i) => s[i] ?? '')) }, [nums.length])
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setFileUrl(null); return }
    const u = URL.createObjectURL(file); setFileUrl(u); return () => URL.revokeObjectURL(u)
  }, [file])

  const input: TemplateInput = {
    name, language, category, body, body_samples: samples, footer: footer || undefined,
    header: format === 'NONE' ? null : { format, text: format === 'TEXT' ? headerText : undefined, text_sample: format === 'TEXT' ? headerSample : undefined },
    has_media_sample: !!file,
  }
  const { errors, warnings } = useMemo(() => validateTemplate(input), [name, language, category, body, samples, footer, format, headerText, headerSample, file]) // eslint-disable-line react-hooks/exhaustive-deps
  const on = (f: RuleIssue['field'][], list: RuleIssue[]) => list.filter((i) => f.includes(i.field))
  const show = (f: RuleIssue['field'][]) => (touched ? on(f, errors) : [])
  const Msgs = ({ fields }: { fields: RuleIssue['field'][] }) => (<>
    {show(fields).map((i) => <p key={i.message} role="alert" className="mt-1 text-xs text-danger">{i.message}</p>)}
    {on(fields, warnings).map((i) => <p key={i.message} className="mt-1 text-xs text-muted-foreground">{i.message}</p>)}
  </>)

  const submit = async () => {
    setTouched(true); setErr(null)
    if (errors.length) return
    setBusy(true)
    try {
      const payload = { name, language, category, body, body_samples: samples, footer: footer || undefined, header: input.header ?? undefined }
      if (file) {
        const fd = new FormData(); fd.set('payload', JSON.stringify(payload)); fd.set('sample', file)
        await api('/api/templates', { method: 'POST', body: fd })
      } else await api('/api/templates', { method: 'POST', body: payload })
      nav('/settings/templates')
    } catch (e) {
      const a = e as ApiError
      setErr({ message: a.message, field: a.field, hint: typeof a.data?.hint === 'string' ? a.data.hint : undefined })
    } finally { setBusy(false) }
  }

  return (
    <SettingsPage title="New template" subtitle="Meta reviews it before it can be sent. Usually minutes, sometimes a day.">
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Card title="Basics">
          <div className="space-y-3">
            <label className="block text-sm font-semibold">Name
              <Input className="mt-1" value={name} maxLength={TEMPLATE_LIMITS.name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '_'))} placeholder="order_update" />
              <Msgs fields={['name']} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">Language
                <Input className="mt-1" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" />
                <Msgs fields={['language']} />
              </label>
              <label className="block text-sm font-semibold">Category
                <Select className="mt-1" value={category} onChange={(e) => setCategory(e.target.value)}><option value="UTILITY">Utility</option><option value="MARKETING">Marketing</option></Select>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {category === 'UTILITY'
                ? 'Utility: about something the customer already did, such as an order, booking or payment. Promotional wording gets it reclassified or rejected.'
                : 'Marketing: offers, announcements and anything meant to bring someone back. Billed at the higher rate.'}
            </p>
          </div>
        </Card>

        <Card title="Header (optional)">
          <label className="block text-sm font-semibold">Type
            <Select className="mt-1" value={format} onChange={(e) => { setFormat(e.target.value as HeaderFormat); setFile(null) }}>
              <option value="NONE">None</option><option value="TEXT">Text</option><option value="IMAGE">Image</option><option value="VIDEO">Video</option><option value="DOCUMENT">Document</option>
            </Select>
          </label>
          {format === 'TEXT' && (
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-semibold">Header text
                <Input className="mt-1" value={headerText} maxLength={TEMPLATE_LIMITS.headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Order {{1}}" />
              </label>
              {headerNums.length > 0 && (
                <label className="block text-sm font-semibold">Sample for {'{{1}}'}
                  <Input className="mt-1" value={headerSample} onChange={(e) => setHeaderSample(e.target.value)} placeholder="A100" />
                </label>
              )}
              <Msgs fields={['header_text', 'header_sample']} />
            </div>
          )}
          {(format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT') && (
            <div className="mt-3">
              <label className="block text-sm font-semibold">Sample file
                <input type="file" aria-label="Sample file" accept={ACCEPT[format]} className="mt-1 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">Meta reviews this sample. It also becomes the default header when you send. {file ? `Selected: ${file.name}` : ''}</p>
              <Msgs fields={['media', 'header']} />
            </div>
          )}
        </Card>

        <Card title="Message">
          <label className="block text-sm font-semibold">Body
            <textarea className={`${area} min-h-[120px]`} value={body} maxLength={TEMPLATE_LIMITS.body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{1}}, your order {{2}} is on its way." />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">{body.length}/{TEMPLATE_LIMITS.body}. Variables are {'{{1}}'}, {'{{2}}'} and so on, up to {TEMPLATE_LIMITS.maxParams}.</span>
            <Msgs fields={['body']} />
          </label>
          {nums.length > 0 && (
            <fieldset className="mt-3 space-y-2">
              <legend className="text-sm font-semibold">Samples for review</legend>
              {nums.map((n, i) => (
                <label key={n} className="block text-xs font-semibold">{`{{${n}}}`}
                  <Input className="mt-1" aria-label={`Sample for {{${n}}}`} value={samples[i] ?? ''} onChange={(e) => setSamples((s) => s.map((v, j) => (j === i ? e.target.value : v)))} placeholder={i === 0 ? 'Asha' : 'A100'} />
                </label>
              ))}
              <Msgs fields={['body_samples']} />
            </fieldset>
          )}
          <label className="mt-3 block text-sm font-semibold">Footer (optional)
            <Input className="mt-1" value={footer} maxLength={TEMPLATE_LIMITS.footer} onChange={(e) => setFooter(e.target.value)} placeholder="Reply STOP to opt out" />
            <Msgs fields={['footer']} />
          </label>
        </Card>

        <Card title="Preview">
          <WaCard header={format} headerText={headerText} headerImageUrl={fileUrl} body={body} footer={footer} samples={samples} headerSamples={[headerSample]} />
        </Card>

        {err && (
          <div role="alert" className="break-words rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            <p>{err.message}</p>
            {err.field && <p className="mt-1 text-xs">Check the {err.field.replace('_', ' ')} field.</p>}
            {err.hint && <p className="mt-1 text-xs">{err.hint}</p>}
          </div>
        )}
        {touched && errors.length > 0 && <FormMsg error="Fix the highlighted fields to continue." />}
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>Submit for review</Button>
          <Button type="button" variant="secondary" onClick={() => nav('/settings/templates')}>Cancel</Button>
        </div>
      </form>
    </SettingsPage>
  )
}
