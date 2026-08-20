import type { ReactNode } from "react";

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*[^*\n]+\*)/gu;

function inline(source: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of source.matchAll(INLINE)) {
    const token = match[0];
    const index = match.index;
    if (index > cursor) nodes.push(source.slice(cursor, index));
    if (token.startsWith("`")) nodes.push(<code key={`${key}-${index}`}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) nodes.push(<strong key={`${key}-${index}`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("*")) nodes.push(<em key={`${key}-${index}`}>{token.slice(1, -1)}</em>);
    else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/u.exec(token);
      nodes.push(link === null ? token : <a key={`${key}-${index}`} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
    }
    cursor = index + token.length;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

interface Block { readonly kind: "code" | "heading" | "quote" | "ul" | "ol" | "rule" | "paragraph"; readonly lines: readonly string[]; readonly level?: number; readonly language?: string }

function blocks(markdown: string): Block[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const result: Block[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (line.trim() === "") { index += 1; continue; }
    const fence = /^```\s*([\w-]*)\s*$/u.exec(line);
    if (fence !== null) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/u.test(lines[index] ?? "")) { code.push(lines[index] ?? ""); index += 1; }
      if (index < lines.length) index += 1;
      result.push({ kind: "code", lines: code, ...(fence[1] === undefined || fence[1] === "" ? {} : { language: fence[1] }) });
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading !== null) { result.push({ kind: "heading", lines: [heading[2] ?? ""], level: heading[1]?.length ?? 1 }); index += 1; continue; }
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) { result.push({ kind: "rule", lines: [] }); index += 1; continue; }
    if (/^>\s?/u.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? "")) { quote.push((lines[index] ?? "").replace(/^>\s?/u, "")); index += 1; }
      result.push({ kind: "quote", lines: quote });
      continue;
    }
    const unordered = /^[-*+]\s+(.+)$/u.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/u.exec(line);
    if (unordered !== null || ordered !== null) {
      const kind = unordered !== null ? "ul" : "ol";
      const items: string[] = [];
      const pattern = kind === "ul" ? /^[-*+]\s+(.+)$/u : /^\d+[.)]\s+(.+)$/u;
      while (index < lines.length) {
        const item = pattern.exec(lines[index] ?? "");
        if (item === null) break;
        items.push(item[1] ?? "");
        index += 1;
      }
      result.push({ kind, lines: items });
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (next.trim() === "" || /^```|^#{1,6}\s|^>\s?|^[-*+]\s+|^\d+[.)]\s+/u.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    result.push({ kind: "paragraph", lines: paragraph });
  }
  return result;
}

export function MarkdownPreview({ content, label }: { readonly content: string; readonly label: string }) {
  const parsed = blocks(content);
  if (parsed.length === 0) return <div className="oh-story-markdown-empty">这个 Markdown 文件还是空的。</div>;
  return <article className="oh-story-markdown" aria-label={`${label} 渲染预览`}>
    {parsed.map((block, index) => {
      const key = `block-${String(index)}`;
      if (block.kind === "code") return <pre key={key}><code data-language={block.language}>{block.lines.join("\n")}</code></pre>;
      if (block.kind === "rule") return <hr key={key} />;
      if (block.kind === "quote") return <blockquote key={key}>{block.lines.map((line, lineIndex) => <p key={`${key}-${String(lineIndex)}`}>{inline(line, key)}</p>)}</blockquote>;
      if (block.kind === "ul" || block.kind === "ol") {
        const items = block.lines.map((line, lineIndex) => <li key={`${key}-${String(lineIndex)}`}>{inline(line, key)}</li>);
        return block.kind === "ul" ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>;
      }
      if (block.kind === "heading") {
        const children = inline(block.lines[0] ?? "", key);
        switch (block.level) {
          case 1: return <h1 key={key}>{children}</h1>;
          case 2: return <h2 key={key}>{children}</h2>;
          case 3: return <h3 key={key}>{children}</h3>;
          case 4: return <h4 key={key}>{children}</h4>;
          case 5: return <h5 key={key}>{children}</h5>;
          default: return <h6 key={key}>{children}</h6>;
        }
      }
      return <p key={key}>{block.lines.map((line, lineIndex) => <span key={`${key}-${String(lineIndex)}`}>{lineIndex === 0 ? null : <br />}{inline(line, key)}</span>)}</p>;
    })}
  </article>;
}
