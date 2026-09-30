import type { CSSProperties } from "react";

import PlayIcon20px from "../../assets/icons/play-20px.svg";
import CodeEditor from "../../components/codeEditor.tsx";
import ErrorBoundary from "../../components/ErrorBoundary";
import { isMac } from "../../lib/platform";
import { useTranslation } from "../../lib/useTranslations";
import { DEFAULT_STEPS, MAX_STEPS } from "./useModelRun";
import type { useModelRun } from "./useModelRun";

// The middle column: start values (run once) and model rules (run every step), the run button, the
// number of steps, and how the last run went
export default function CodePanel({ style, run, start, model, steps, readOnly, onStart, onModel, onSteps, onRun }: {
    style: CSSProperties;
    run: ReturnType<typeof useModelRun>;
    start: string;
    model: string;
    steps: string;
    readOnly: boolean;
    onStart: (value: string) => void;
    onModel: (value: string) => void;
    onSteps: (value: string) => void;
    onRun: () => void;
}) {
    const { t, language } = useTranslation();
    const { simulation, wasm } = run;
    // Ctrl+Enter runs the model (⌘+Enter on a Mac)
    const shortcutKeys = isMac ? "⌘ Enter" : "Ctrl+Enter";

    return (
        <div className="code-panel" id="panel-code" style={style}>
            <div className="code">
                <div className="code-panel-actions">
                    {simulation.running ? (
                        <button className="play-btn" aria-label={t("modeling.stopRun")} title={t("modeling.stopRun")}
                                onClick={simulation.stop}>
                            <span className="stop-icon" aria-hidden="true"/>
                        </button>
                    ) : (
                        <button
                            className="play-btn"
                            aria-label={t("modeling.runSimulation")}
                            title={wasm === "loading" ? t("modeling.wasmLoading") : t("modeling.runShortcut", { keys: shortcutKeys })}
                            onClick={onRun}
                            disabled={!run.wasmReady}
                        >
                            <img src={PlayIcon20px} alt=""/>
                        </button>
                    )}
                </div>
                {/* Start values run once before the first step; model rules run every step */}
                <div className="code-block code-block-start">
                    <p className="code-block-label">{t("modeling.startValues")}</p>
                    <div className="code-editor">
                        <ErrorBoundary compact>
                            <CodeEditor ref={run.startEditorRef} value={start} onChange={onStart} onRun={onRun} readOnly={readOnly}/>
                        </ErrorBoundary>
                    </div>
                </div>
                <div className="code-block code-block-model">
                    <p className="code-block-label">{t("modeling.modelRules")}</p>
                    <div className="code-editor">
                        <ErrorBoundary compact>
                            <CodeEditor ref={run.modelEditorRef} value={model} onChange={onModel} onRun={onRun} readOnly={readOnly}/>
                        </ErrorBoundary>
                    </div>
                </div>
            </div>

            <div className="code-footer">
                <span>
                    {t("modeling.steps")}{" "}
                    <input
                        type="number"
                        className="steps-input"
                        min={1}
                        max={MAX_STEPS}
                        step={1}
                        placeholder={String(DEFAULT_STEPS)}
                        value={steps}
                        onChange={(e) => onSteps(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onRun()}
                    />
                </span>
                {/* How the last run ended, so "nothing happened" always has an explanation */}
                {wasm === "failed" && <p className="run-status warning" role="alert">{t("modeling.wasmFailed")}</p>}
                {simulation.running && (
                    <p className="run-status" role="status">
                        {t("modeling.running", { steps: simulation.progress.toLocaleString(language) })}
                    </p>
                )}
                {run.statusText && (
                    <p className={`run-status${run.statusWarning ? " warning" : ""}`} role="status">{run.statusText}</p>
                )}
                {run.nonFiniteText && <p className="run-status warning" role="status">{run.nonFiniteText}</p>}
            </div>
        </div>
    );
}
