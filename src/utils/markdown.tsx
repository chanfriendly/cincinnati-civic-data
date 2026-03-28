import React from 'react';

/**
 * Lightweight inline markdown renderer — no external dependencies.
 * Handles the subset the AI model (MiniMax M2.5) actually produces:
 *   **bold**, *italic*, `inline code`, [link](url)
 */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Order matters: bold before italic so ** is matched first
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const raw = match[0];
    if (raw.startsWith('**')) {
      parts.push(<strong key={key++}>{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith('*')) {
      parts.push(<em key={key++}>{raw.slice(1, -1)}</em>);
    } else if (raw.startsWith('`')) {
      parts.push(
        <code key={key++} className="bg-gray-100 rounded px-1 py-0.5 text-xs font-mono">
          {raw.slice(1, -1)}
        </code>
      );
    } else if (raw.startsWith('[')) {
      // match[2] = link text, match[3] = href
      parts.push(
        <a key={key++} href={match[3]} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
          {match[2]}
        </a>
      );
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

/**
 * Block-level markdown renderer.
 * Supported constructs: # h1, ## h2, ### h3, - / * / + lists,
 * 1. ordered lists, ``` code fences, --- horizontal rules, blank lines.
 * Everything else renders as a paragraph with inline formatting applied.
 */
export function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ────────────────────────────────────────────
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={key++} className="bg-gray-100 rounded p-3 text-xs font-mono overflow-x-auto my-2 whitespace-pre-wrap">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i++; // skip closing ```
      continue;
    }

    // ── Headings ─────────────────────────────────────────────────────
    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={key++} className="text-sm font-semibold mt-3 mb-1 text-gray-900">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={key++} className="text-base font-semibold mt-3 mb-1 text-gray-900">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={key++} className="text-lg font-bold mt-3 mb-1 text-gray-900">
          {renderInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // ── Horizontal rule ───────────────────────────────────────────────
    if (/^[-*]{3,}$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="my-3 border-gray-300" />);
      i++;
      continue;
    }

    // ── Unordered list ────────────────────────────────────────────────
    if (/^[-*+] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        items.push(
          <li key={i} className="ml-1">
            {renderInline(lines[i].slice(2))}
          </li>
        );
        i++;
      }
      nodes.push(
        <ul key={key++} className="list-disc list-inside my-1.5 space-y-0.5 text-gray-700">
          {items}
        </ul>
      );
      continue;
    }

    // ── Ordered list ──────────────────────────────────────────────────
    if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(
          <li key={i} className="ml-1">
            {renderInline(lines[i].replace(/^\d+\. /, ''))}
          </li>
        );
        i++;
      }
      nodes.push(
        <ol key={key++} className="list-decimal list-inside my-1.5 space-y-0.5 text-gray-700">
          {items}
        </ol>
      );
      continue;
    }

    // ── Blank line → vertical spacer ─────────────────────────────────
    if (line.trim() === '') {
      if (nodes.length > 0) {
        nodes.push(<div key={key++} className="mt-2" />);
      }
      i++;
      continue;
    }

    // ── Paragraph ─────────────────────────────────────────────────────
    nodes.push(
      <p key={key++} className="my-0.5 text-gray-700 leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <>{nodes}</>;
}
