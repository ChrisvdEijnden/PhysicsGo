import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as monaco from "monaco-editor";

import { useTheme } from "../lib/useTheme";
import type { Theme } from "../lib/useTheme";

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    language?: string;
    onRun?: () => void;
    // Shown but not editable, e.g. a teacher viewing a student's model
    readOnly?: boolean;
}

export interface InterpreterError {
    line: number;
    column: number;
    message: string;
}

export interface CodeEditorHandle {
    setErrors: (errors: InterpreterError[]) => void;
    clearErrors: () => void;
}

const MARKER_OWNER = "physicsgo-interpreter";
// Editor themes follow the app's light/dark setting
const THEME_NAMES: Record<Theme, string> = { light: "physicsgo-light", dark: "physicsgo-dark" };
const LANGUAGE_ID = "physicsgo";

function definePhysicsGoThemes() {
    monaco.editor.defineTheme(THEME_NAMES.light, {
        base: "vs",
        inherit: true,
        rules: [
            { token: "comment", foreground: "475569", fontStyle: "italic" },
            { token: "keyword", foreground: "0D9488" },
            { token: "number", foreground: "0F766E" },
            { token: "string", foreground: "0F766E" },
            { token: "identifier", foreground: "0F172A" },
            { token: "delimiter", foreground: "475569" },
            { token: "operator", foreground: "475569" },
            { token: "predefined", foreground: "0D9488", fontStyle: "bold" },
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
        },
    });
    // Matches the dark app tokens in global.css
    monaco.editor.defineTheme(THEME_NAMES.dark, {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "comment", foreground: "94A3B8", fontStyle: "italic" },
            { token: "keyword", foreground: "2DD4BF" },
            { token: "number", foreground: "5EEAD4" },
            { token: "string", foreground: "5EEAD4" },
            { token: "identifier", foreground: "F1F5F9" },
            { token: "delimiter", foreground: "94A3B8" },
            { token: "operator", foreground: "94A3B8" },
            { token: "predefined", foreground: "2DD4BF", fontStyle: "bold" },
        ],
        colors: {
            "editor.background": "#0B1220",
            "editor.foreground": "#F1F5F9",
            "editorLineNumber.foreground": "#8A9BB3",
            "editorLineNumber.activeForeground": "#CBD5E1",
            "editorCursor.foreground": "#2DD4BF",
            "editor.selectionBackground": "#0F766E88",
            "editor.inactiveSelectionBackground": "#33415588",
            "editor.lineHighlightBackground": "#1E293B",
            "editor.lineHighlightBorder": "#00000000",
            "editorIndentGuide.background": "#334155",
            "editorIndentGuide.activeBackground": "#475569",
            "editorWhitespace.foreground": "#334155",
            "editorBracketMatch.background": "#0F766E55",
            "editorBracketMatch.border": "#2DD4BF",
            "scrollbarSlider.background": "#94A3B833",
            "scrollbarSlider.hoverBackground": "#94A3B855",
            "scrollbarSlider.activeBackground": "#94A3B877",
            "editorWidget.background": "#1E293B",
            "editorWidget.border": "#334155",
        },
    });
}
definePhysicsGoThemes();

// Monaco measures character widths once; when the bundled font arrives after that, measure again
// so the cursor and selections line up with the text
document.fonts?.load('13px "JetBrains Mono Variable"').then(() => monaco.editor.remeasureFonts(), () => undefined);

interface LanguageInfo {
    functions: { name: string; args: string }[];
    keywords: string[];
    constants: string[];
}

// Highlighting for the modeling language; the keywords, functions and constants come from the
// interpreter itself, so the editor never disagrees with what actually runs
function setTokens(info: LanguageInfo) {
    monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
        keywords: info.keywords,
        builtins: info.functions.map((f) => f.name),
        constants: info.constants,
        tokenizer: {
            root: [
                [/\/\/.*$/, "comment"],
                [/[a-zA-Z_]\w*(?=\s*\()/, { cases: { "@builtins": "predefined", "@default": "identifier" } }],
                [/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@constants": "number", "@default": "identifier" } }],
                [/\d+(\.\d+)?/, "number"],
                [/<=|>=|==|!=/, "operator"],
                [/[+\-*/^=<>]/, "operator"],
                [/[(),:]/, "delimiter"],
            ],
        },
    });
}

let languageInfo: LanguageInfo = { functions: [], keywords: [], constants: [] };

function definePhysicsGoLanguage() {
    monaco.languages.register({ id: LANGUAGE_ID });
    setTokens(languageInfo);

    // Suggestions: the language's functions (with their brackets), keywords and constants, and the
    // variables the code in this editor already uses
    monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
        provideCompletionItems(model, position) {
            const word = model.getWordUntilPosition(position);
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
            const { Function, Keyword, Constant, Variable } = monaco.languages.CompletionItemKind;
            const variables = new Set(model.getValue().replace(/\/\/.*$/gm, "").match(/[A-Za-z_]\w*/g) ?? []);
            for (const known of [...languageInfo.keywords, ...languageInfo.functions.map((f) => f.name), word.word]) {
                variables.delete(known);
            }
            return {
                suggestions: [
                    ...languageInfo.functions.map((f) => ({
                        label: f.name,
                        kind: Function,
                        detail: `${f.name}(${f.args === "1" ? "x" : f.args === "2" ? "a, b" : "a, b, …"})`,
                        insertText: `${f.name}($0)`,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range,
                    })),
                    ...languageInfo.keywords.map((k) => ({ label: k, kind: Keyword, insertText: k, range })),
                    ...languageInfo.constants.map((c) => ({ label: c, kind: Constant, insertText: c, range })),
                    ...[...variables].map((v) => ({ label: v, kind: Variable, insertText: v, range })),
                ],
            };
        },
    });

    monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
        comments: { lineComment: "//" },
        brackets: [["(", ")"]],
        autoClosingPairs: [{ open: "(", close: ")" }],
        // Enter after "als ...:" indents the next line; typing "anders" moves that line back out
        indentationRules: {
            increaseIndentPattern: /^.*:\s*(\/\/.*)?$/,
            decreaseIndentPattern: /^\s*(anders|else)\b.*$/,
        },
    });
}
definePhysicsGoLanguage();

// The interpreter's built-ins, read once from the WebAssembly module (the models themselves run in a worker)
import("../wasm/interpreterGo").then(async (wasm) => {
    await wasm.default();
    languageInfo = wasm.language() as LanguageInfo;
    setTokens(languageInfo);
}).catch(() => {
    // Without it, code is still editable; only highlighting and suggestions of built-ins are missing
});

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
    ({ value, onChange, language = LANGUAGE_ID, onRun, readOnly = false }, ref) => {
        const containerRef = useRef<HTMLDivElement | null>(null);
        const { theme } = useTheme();
        const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

        const onChangeRef = useRef(onChange);
        useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

        const onRunRef = useRef(onRun);
        useEffect(() => { onRunRef.current = onRun; }, [onRun]);

        useImperativeHandle(ref, () => ({
            setErrors: (errors) => {
                const model = editorRef.current?.getModel();
                if (!model) return;
                monaco.editor.setModelMarkers(
                    model,
                    MARKER_OWNER,
                    errors.map((e) => ({
                        startLineNumber: e.line,
                        endLineNumber: e.line,
                        startColumn: e.column,
                        endColumn: e.column + 1,
                        message: e.message,
                        severity: monaco.MarkerSeverity.Error,
                    }))
                );
            },
            clearErrors: () => {
                const model = editorRef.current?.getModel();
                if (model) monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
            },
        }));

        useEffect(() => {
            if (!containerRef.current) return;

            const editor = monaco.editor.create(containerRef.current, {
                value,
                language,
                theme: THEME_NAMES[theme],
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                renderLineHighlight: "line",
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                readOnly,
                domReadOnly: readOnly,
            });
            editorRef.current = editor;

            editor.addAction({
                id: "run-simulation",
                label: "Run Simulation",
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
                run: () => onRunRef.current?.(),
            });

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
            if (editor.getValue() !== value) editor.setValue(value);
        }, [value]);

        // Monaco has one theme for all editors on the page
        useEffect(() => {
            monaco.editor.setTheme(THEME_NAMES[theme]);
        }, [theme]);

        return <div ref={containerRef} className="monaco-container"/>;
    }
);

export default CodeEditor;