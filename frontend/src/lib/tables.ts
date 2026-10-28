/** Extract GFM tables from Markdown so numeric columns can be charted.
 * Only values literally present in the table are used. */

export interface ParsedTable {
  headers: string[]
  rows: string[][]
}

export interface ChartSeries {
  label: string
  column: string
  points: { label: string; value: number }[]
}

const splitRow = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

const isSeparator = (line: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

export function parseTables(markdown: string): ParsedTable[] {
  const lines = markdown.split(/\r?\n/)
  const tables: ParsedTable[] = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes('|') || !isSeparator(lines[i + 1])) continue
    const headers = splitRow(lines[i])
    const rows: string[][] = []
    let j = i + 2
    while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
      rows.push(splitRow(lines[j]))
      j++
    }
    if (rows.length) tables.push({ headers, rows })
    i = j - 1
  }
  return tables
}

/** Parse "RM 1,200,000", "$450k", "12.5%", "-3" into a number; otherwise null. */
export function parseNumber(cell: string): number | null {
  const cleaned = cell.replace(/\*\*/g, '').replace(/[,\s]/g, '').replace(/^(RM|USD|\$|€|£|MYR)/i, '')
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)(%|k|m|b)?$/i)
  if (!m) return null
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as 'k' | 'm' | 'b'] ?? 1
  return parseFloat(m[1]) * mult
}

export function numericSeries(table: ParsedTable): ChartSeries[] {
  const series: ChartSeries[] = []
  for (let c = 1; c < table.headers.length; c++) {
    const points = table.rows
      .map((r) => ({ label: r[0] ?? '', value: parseNumber(r[c] ?? '') }))
      .filter((p): p is { label: string; value: number } => p.value !== null)
    if (points.length >= 2 && points.length === table.rows.length) {
      series.push({ label: table.headers[c], column: table.headers[c], points })
    }
  }
  return series
}
