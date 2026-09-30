import type { ReactNode } from "react";

// The Markdown teachers write explanations in: # headings, paragraphs, - and 1. lists, **bold**,
// *italic*, `code` and [links](https://…). It becomes React elements, never HTML, so nothing a
// project's text contains can run as code.

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*|_[^_\n]+_)|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

function inline(text: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
        const at = m.index ?? 0;
        if (at > last) nodes.push(text.slice(last, at));
        const key = nodes.length;
        if (m[1]) nodes.push(<code key={key}>{m[1].slice(1, -1)}</code>);
        else if (m[2]) nodes.push(<strong key={key}>{m[2].slice(2, -2)}</strong>);
        else if (m[3]) nodes.push(<em key={key}>{m[3].slice(1, -1)}</em>);
        else nodes.push(<a key={key} href={m[5]} target="_blank" rel="noopener noreferrer">{m[4]}</a>);
        last = at + m[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

type Block =
    | { kind: "heading"; level: number; text: string }
    | { kind: "paragraph"; text: string }
    | { kind: "list"; ordered: boolean; items: string[] };

function blocks(source: string): Block[] {
    const result: Block[] = [];
    for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
        const line = raw.trim();
        const prev = result[result.length - 1];
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        const bullet = /^[-*]\s+(.*)$/.exec(line);
        const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
        if (!line) {
            result.push({ kind: "paragraph", text: "" }); // ends the block before it
        } else if (heading) {
            result.push({ kind: "heading", level: heading[1].length, text: heading[2] });
        } else if (bullet || numbered) {
            const ordered = !bullet;
            const text = (bullet ?? numbered)![1];
            if (prev?.kind === "list" && prev.ordered === ordered) prev.items.push(text);
            else result.push({ kind: "list", ordered, items: [text] });
        } else if (prev?.kind === "paragraph" && prev.text) {
            prev.text += ` ${line}`;
        } else {
            result.push({ kind: "paragraph", text: line });
        }
    }
    return result.filter((b) => b.kind !== "paragraph" || b.text);
}

export default function Markdown({ text, className }: { text: string; className?: string }) {
    return (
        <div className={`markdown${className ? ` ${className}` : ""}`}>
            {blocks(text).map((block, i) => {
                if (block.kind === "heading") {
                    const Tag = (["h3", "h4", "h5"] as const)[block.level - 1];
                    return <Tag key={i}>{inline(block.text)}</Tag>;
                }
                if (block.kind === "list") {
                    const Tag = block.ordered ? "ol" : "ul";
                    return <Tag key={i}>{block.items.map((item, j) => <li key={j}>{inline(item)}</li>)}</Tag>;
                }
                return <p key={i}>{inline(block.text)}</p>;
            })}
        </div>
    );
}
