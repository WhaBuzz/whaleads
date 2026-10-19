// Meta's template rules, pure so the Worker and the UI form enforce the same table. No imports.

export const TEMPLATE_LIMITS = { name: 512, body: 1024, footer: 60, headerText: 60, maxParams: 10, param: 1024 } as const
export type HeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
export type TemplateCategory = 'MARKETING' | 'UTILITY'

export interface TemplateInput {
  name: string
  language: string
  category: string
  body: string
  /** One sample per placeholder, in order. */
  body_samples?: string[]
  footer?: string
  header?: { format: HeaderFormat; text?: string; text_sample?: string } | null
  /** A sample file was supplied (required for IMAGE/VIDEO/DOCUMENT). */
  has_media_sample?: boolean
}

export interface RuleIssue { field: 'name' | 'language' | 'category' | 'body' | 'body_samples' | 'footer' | 'header' | 'header_text' | 'header_sample' | 'media'; message: string }

const PLACEHOLDER = /\{\{\s*(\d+)\s*\}\}/g

/** Distinct placeholder numbers in order of first appearance. */
export function placeholders(text: string): number[] {
  const seen: number[] = []
  for (const m of text.matchAll(PLACEHOLDER)) { const n = Number(m[1]); if (!seen.includes(n)) seen.push(n) }
  return seen
}

/** `{{1}}` -> params[0]. Missing params render as the bare placeholder. */
export function renderParams(text: string, params: string[]): string {
  return text.replace(PLACEHOLDER, (all, n) => params[Number(n) - 1] ?? all)
}

/** Meta rejects parameter values with line breaks, tabs or runs of 4+ spaces. */
export function paramProblem(v: string): string | null {
  if (!v.trim()) return 'Cannot be empty.'
  if (v.length > TEMPLATE_LIMITS.param) return `At most ${TEMPLATE_LIMITS.param} characters.`
  if (/[\n\r\t]/.test(v) || / {4,}/.test(v)) return 'No line breaks, tabs or runs of 4 spaces.'
  return null
}

function placeholderIssue(text: string, label: 'body' | 'header', max: number): string | null {
  const stripped = text.replace(PLACEHOLDER, '')
  if (/\{\{|\}\}/.test(stripped)) return `Use {{1}}, {{2}} ... for variables. Anything else in double braces is not allowed.`
  const nums = placeholders(text)
  if (nums.length > max) return `At most ${max} variable${max === 1 ? '' : 's'} in the ${label}.`
  if ([...nums].sort((x, y) => x - y).some((n, i) => n !== i + 1)) return `Variables must be numbered {{1}}, {{2}} ... with no gaps.`
  return null
}

export function validateTemplate(t: TemplateInput): { errors: RuleIssue[]; warnings: RuleIssue[] } {
  const errors: RuleIssue[] = []
  const warnings: RuleIssue[] = []
  const e = (field: RuleIssue['field'], message: string) => errors.push({ field, message })

  if (!t.name) e('name', 'A name is required.')
  else if (!/^[a-z0-9_]+$/.test(t.name)) e('name', 'Lowercase letters, numbers and underscores only.')
  else if (t.name.length > TEMPLATE_LIMITS.name) e('name', `At most ${TEMPLATE_LIMITS.name} characters.`)
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(t.language ?? '')) e('language', 'Use a Meta language code such as en or en_US.')
  if (t.category !== 'MARKETING' && t.category !== 'UTILITY') e('category', 'Choose Utility or Marketing.')

  const body = t.body ?? ''
  if (!body.trim()) e('body', 'The message body is required.')
  else {
    if (body.length > TEMPLATE_LIMITS.body) e('body', `At most ${TEMPLATE_LIMITS.body} characters.`)
    const pi = placeholderIssue(body, 'body', TEMPLATE_LIMITS.maxParams)
    if (pi) e('body', pi)
    else {
      const n = placeholders(body).length
      const samples = t.body_samples ?? []
      for (let i = 0; i < n; i++) if (!(samples[i] ?? '').trim()) { e('body_samples', `A sample value for {{${i + 1}}} is required.`); break }
      if (/^\s*\{\{\s*\d+\s*\}\}/.test(body) || /\{\{\s*\d+\s*\}\}\s*$/.test(body)) warnings.push({ field: 'body', message: 'Meta often rejects a body that starts or ends with a variable.' })
    }
  }

  if (t.footer) {
    if (t.footer.length > TEMPLATE_LIMITS.footer) e('footer', `At most ${TEMPLATE_LIMITS.footer} characters.`)
    else if (/\{\{|\}\}/.test(t.footer)) e('footer', 'The footer cannot contain variables.')
  }

  const h = t.header
  if (h && h.format !== 'NONE') {
    if (h.format === 'TEXT') {
      const text = h.text ?? ''
      if (!text.trim()) e('header_text', 'Header text is required.')
      else {
        if (text.length > TEMPLATE_LIMITS.headerText) e('header_text', `At most ${TEMPLATE_LIMITS.headerText} characters.`)
        const pi = placeholderIssue(text, 'header', 1)
        if (pi) e('header_text', pi)
        else if (placeholders(text).length && !(h.text_sample ?? '').trim()) e('header_sample', 'A sample value for the header variable is required.')
      }
    } else if (h.format === 'IMAGE' || h.format === 'VIDEO' || h.format === 'DOCUMENT') {
      if (!t.has_media_sample) e('media', `A sample ${h.format.toLowerCase()} is required for a ${h.format.toLowerCase()} header.`)
    } else e('header', 'Unknown header type.')
  }
  return { errors, warnings }
}

/** Meta create-template `components`, order HEADER, BODY, FOOTER. `headerHandle` = media-handle `h` for media headers. */
export function buildComponents(t: TemplateInput, headerHandle?: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const h = t.header
  if (h && h.format === 'TEXT') {
    const c: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text: h.text }
    if (placeholders(h.text ?? '').length) c.example = { header_text: [h.text_sample ?? ''] }
    out.push(c)
  } else if (h && h.format !== 'NONE') {
    out.push({ type: 'HEADER', format: h.format, example: { header_handle: [headerHandle ?? ''] } })
  }
  const body: Record<string, unknown> = { type: 'BODY', text: t.body }
  const n = placeholders(t.body).length
  if (n) body.example = { body_text: [(t.body_samples ?? []).slice(0, n)] }
  out.push(body)
  if (t.footer) out.push({ type: 'FOOTER', text: t.footer })
  return out
}
