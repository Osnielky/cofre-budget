import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* Renders Ask Cofre's replies: bold, lists, headings, links and GFM tables, styled with
   theme variables. Raw HTML in a reply is never rendered (react-markdown escapes it by
   default and its URL transform drops javascript: links). */

const cell = { border: '1px solid var(--color-border)' };

const COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
  h1: ({ children }) => <h3 className="font-semibold text-base mt-3 mb-1">{children}</h3>,
  h2: ({ children }) => <h3 className="font-semibold text-base mt-3 mb-1">{children}</h3>,
  h3: ({ children }) => <h4 className="font-semibold mt-3 mb-1">{children}</h4>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-primary)' }}>
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="px-1 py-0.5 rounded text-[0.85em]" style={{ background: 'var(--color-elevated)' }}>{children}</code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2 last:mb-0 max-w-full">
      <table className="text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left font-semibold" style={{ ...cell, background: 'var(--color-elevated)' }}>{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-1.5 tabular-nums" style={cell}>{children}</td>,
};

export default function ChatMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
}
