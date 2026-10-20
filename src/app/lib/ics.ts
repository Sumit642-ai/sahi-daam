/**
 * "Remind me every Monday" (spec v2, 7.8): a calendar file with a weekly
 * Monday-morning reminder and a link back to the app. Works on Android and
 * iPhone calendars with no server.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** The next Monday on or after `from`, at 10:00 local time. */
export function nextMonday(from: Date): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 10, 0, 0)
  const add = (8 - d.getDay()) % 7
  d.setDate(d.getDate() + (add === 0 && from.getHours() >= 10 ? 7 : add))
  return d
}

const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** RFC 5545 text escaping, and 75-octet line folding. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--
    out.push(rest.slice(0, cut))
    rest = ` ${rest.slice(cut)}`
  }
  out.push(rest)
  return out.join('\r\n')
}

export function mondayReminderIcs(args: { appUrl: string; title: string; description: string; now?: Date; uid?: string }): string {
  const now = args.now ?? new Date()
  const start = nextMonday(now)
  const end = new Date(start.getTime() + 15 * 60_000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sahi Daam//Monday reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${args.uid ?? `monday-${now.getTime()}@sahi-daam`}`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${local(start)}`,
    `DTEND:${local(end)}`,
    'RRULE:FREQ=WEEKLY;BYDAY=MO',
    `SUMMARY:${esc(args.title)}`,
    `DESCRIPTION:${esc(`${args.description}\n${args.appUrl}`)}`,
    `URL:${args.appUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(args.title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Hands the browser a file to save (works offline). */
export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
