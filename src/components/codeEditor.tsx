import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    language?: string;
}

const THEME_NAME = "physicsgo-light";

function definePhysicsGoTheme() {
    monaco.editor.defineTheme(THEME_NAME, {
        base: "vs",
        inherit: true,
        rules: [
            { token: "comment", foreground: "475569", fontStyle: "italic" },
            { token: "keyword", foreground: "0D9488" },
            { token: "number", foreground: "0F766E" },
            { token: "string", foreground: "0F766E" },
            { token: "identifier", foreground: "0F172A" },
            { token: "delimiter", foreground: "475569" },
        ],
        colors: {
            "editor.background": "#F8FAFC",
            "editor.foreground": "#0F172A",
            "editorLineNumber.foreground": "#94A3B8",
            "editorLineNumber.activeForeground": "#475569",
            "editorCursor.foreground": "#0D9488",
            "editor.selectionBackground": "#CCFBF1",
            "editor.inactiveSelectionBackground": "#E2E8F0",
            "editor.lineHighlightBackground": "#F1F5F9",
            "editor.lineHighlightBorder": "#00000000",
            "editorIndentGuide.background": "#E2E8F0",
            "editorIndentGuide.activeBackground": "#CBD5E1",
            "editorWhitespace.foreground": "#E2E8F0",
            "editorBracketMatch.background": "#CCFBF1",
            "editorBracketMatch.border": "#0D9488",
            "scrollbarSlider.background": "#94A3B833",
            "scrollbarSlider.hoverBackground": "#94A3B855",
            "scrollbarSlider.activeBackground": "#94A3B877",
            "editorWidget.background": "#FFFFFF",
            "editorWidget.border": "#E2E8F0",
            "editorSuggestWidget.background": "#FFFFFF",
            "editorSuggestWidget.border": "#E2E8F0",
            "editorSuggestWidget.selectedBackground": "#CCFBF1",
            "editorHoverWidget.background": "#FFFFFF",
            "editorHoverWidget.border": "#E2E8F0",
        },
    });
}

definePhysicsGoTheme();

export default function CodeEditor({ value, onChange, language = "javascript" }: CodeEditorProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        if (!containerRef.current) return;

        const editor = monaco.editor.create(containerRef.current, {
            value,
            language,
            theme: THEME_NAME,
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace',
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            renderLineHighlight: "line",
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
        });
        editorRef.current = editor;

        const subscription = editor.onDidChangeModelContent(() => {
            onChangeRef.current(editor.getValue());
        });

        return () => {
            subscription.dispose();
            editor.dispose();
            editorRef.current = null;
        };
    }, []);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        if (editor.getValue() !== value) {
            editor.setValue(value);
        }
    }, [value]);

    return <div ref={containerRef} className="monaco-container"/>;
}