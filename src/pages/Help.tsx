import "../styles/global.css";
import "./settings.css";

import TopBar from "../components/TopBar";
import { HELP } from "../data/help";
import type { HelpBlock, HelpText } from "../data/help";
import { CONSTANT_HELP, FUNCTION_HELP, KEYWORD_HELP, functionLabel } from "../lib/functionHelp";
import { KEYWORDS } from "../lib/modelLanguage";
import type { Language } from "../lib/useLanguage";
import { useTranslation } from "../lib/useTranslations";

// Text with `backticks` around code
function Inline({ text }: { text: string }) {
    return text.split("`").map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
    return (
        <div className="doc-table">
            <table>
                <thead>
                    <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.join()}>{row.map((cell, i) => <td key={i}><Inline text={cell}/></td>)}</tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// The interpreter's functions, keywords and constants, named in this language with the other language's name alongside
function BuiltIns({ kind, text, language }: { kind: "keywords" | "functions" | "constants"; text: HelpText; language: Language }) {
    const other: Language = language === "nl" ? "en" : "nl";
    const { word, otherLanguage, meaning, function: fn, constant } = text.columns;
    if (kind === "keywords") {
        const rows = KEYWORDS.map((k) => [`\`${k[language]}\``, `\`${k[other]}\``, KEYWORD_HELP[k.en][language]]);
        return <Table head={[word, otherLanguage, meaning]} rows={rows}/>;
    }
    if (kind === "functions") {
        const rows = FUNCTION_HELP.map((f) => [`\`${functionLabel(f, language)}\``, `\`${other === "nl" ? f.nl : f.name}\``, f.text[language]]);
        return <Table head={[fn, otherLanguage, meaning]} rows={rows}/>;
    }
    const rows = Object.entries(CONSTANT_HELP).map(([name, help]) => [`\`${name}\``, help[language]]);
    return <Table head={[constant, meaning]} rows={rows}/>;
}

function Block({ block, text, language }: { block: HelpBlock; text: HelpText; language: Language }) {
    if ("p" in block) return <p><Inline text={block.p}/></p>;
    if ("list" in block) return <ul>{block.list.map((item) => <li key={item}><Inline text={item}/></li>)}</ul>;
    if ("code" in block) return <pre className="doc-code"><code>{block.code}</code></pre>;
    if ("table" in block) return <Table head={block.head} rows={block.table}/>;
    return <BuiltIns kind={block.builtIn} text={text} language={language}/>;
}

// How a model works and everything that can be written in one; open to everyone, behind the help button
export default function Help() {
    const { t, language } = useTranslation();
    const text = HELP[language];
    // The address already uses # for the page, so the contents scroll instead of linking to #ids
    const scrollTo = (id: string) => {
        const heading = document.getElementById(`help-${id}`);
        heading?.scrollIntoView({ behavior: "smooth", block: "start" });
        heading?.focus({ preventScroll: true });
    };
    return (
        <div className="page-settings">
            <TopBar title={t("nav.help")}/>
            <div className="content-settings">
                <article className="document help">
                    <h1>{text.title}</h1>
                    <p>{text.intro}</p>
                    <nav aria-label={text.contents} className="doc-contents">
                        <h2>{text.contents}</h2>
                        <ol>
                            {text.sections.map((section) => (
                                <li key={section.id}>
                                    <button type="button" className="doc-link" onClick={() => scrollTo(section.id)}>{section.title}</button>
                                </li>
                            ))}
                        </ol>
                    </nav>
                    {text.sections.map((section) => (
                        <section key={section.id} aria-labelledby={`help-${section.id}`}>
                            <h2 id={`help-${section.id}`} tabIndex={-1}>{section.title}</h2>
                            {section.blocks.map((block, i) => <Block key={i} block={block} text={text} language={language}/>)}
                        </section>
                    ))}
                </article>
            </div>
        </div>
    );
}
