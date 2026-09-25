import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as monaco from "monaco-editor";

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    language?: string;
    onRun?: () => void;
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
const THEME_NAME = "physicsgo-light";
const LANGUAGE_ID = "physicsgo";

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
}
definePhysicsGoTheme();

function definePhysicsGoLanguage() {
    monaco.languages.register({ id: LANGUAGE_ID });

    monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
        keywords: ["als", "stop"],
        builtins: ["sin", "cos", "sqrt"],
        tokenizer: {
            root: [
                [/\/\/.*$/, "comment"],
                [/[a-zA-Z_]\w*(?=\s*\()/, { cases: { "@builtins": "predefined", "@default": "identifier" } }],
                [/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
                [/\d+(\.\d+)?/, "number"],
                [/<=|>=|==|!=/, "operator"],
                [/[+\-*/^=<>]/, "operator"],
                [/[():]/, "delimiter"],
            ],
        },
    });

    monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
        comments: { lineComment: "//" },
        brackets: [["(", ")"]],
        autoClosingPairs: [{ open: "(", close: ")" }],
    });
}
definePhysicsGoLanguage();

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
    ({ value, onChange, language = LANGUAGE_ID, onRun }, ref) => {
        const containerRef = useRef<HTMLDivElement | null>(null);
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

        return <div ref={containerRef} className="monaco-container"/>;
    }
);

export default CodeEditor;