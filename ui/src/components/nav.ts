import { BarChart3, Workflow, CalendarCheck, Inbox, Settings, Target, Users, type LucideIcon } from 'lucide-react'

export interface NavItem { to: string; label: string; icon: LucideIcon; match?: 'end' | 'prefix'; badge?: 'unread'; desktopOnly?: boolean /* S7 */ }
export const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: CalendarCheck },
  { to: '/inbox', label: 'Inbox', icon: Inbox, match: 'prefix', badge: 'unread' },
  // S4c
  { to: '/leads', label: 'Leads', icon: Target, match: 'prefix' },
  { to: '/contacts', label: 'Contacts', icon: Users, match: 'prefix' },
  { to: '/reports', label: 'Reports', icon: BarChart3, match: 'prefix', desktopOnly: true }, // S7
  { to: '/automations', label: 'Automations', icon: Workflow, match: 'prefix', desktopOnly: true }, // S6d
  { to: '/settings', label: 'Settings', icon: Settings, match: 'prefix' },
]
