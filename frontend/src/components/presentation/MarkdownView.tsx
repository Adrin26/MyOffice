import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { numericSeries, parseTables } from '../../lib/tables'
import { BarChart } from './BarChart'

/** Renders untrusted Markdown safely: raw HTML is not rendered and unsafe URLs are stripped. */
export const MarkdownView = memo(function MarkdownView({ markdown, charts = false }: { markdown: string; charts?: boolean }) {
  const series = useMemo(() => (charts ? parseTables(markdown).flatMap(numericSeries).slice(0, 3) : []), [markdown, charts])
  return (
    <div>
      <div className="md">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
            table: ({ children }) => (
              <div className="md-table">
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
      {series.length > 0 && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {series.map((s) => (
            <BarChart key={s.column} series={s} />
          ))}
        </div>
      )}
    </div>
  )
})
