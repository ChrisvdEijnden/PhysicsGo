import { useCallback, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import "./modeling.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";
import arrowIcon14px from "../assets/icons/arrow-14px.svg";
import PlayIcon20px from "../assets/icons/play-20px.svg";
import PlusIcon14px from "../assets/icons/plus-14px.svg";

import LineChart from "../components/lineChart.tsx";
import {Projects} from "../data/Projects.tsx";
import {minRangeLineData, maxRangeLineData, minDomainLineData, maxDomainLineData} from "../data/chartData.tsx";

interface CodeLine {
    number: number;
    text?: string;
}

const codeLines: CodeLine[] = [
    { number: 1, text: "// Initialize Parameters" },
    { number: 2, text: "dt = 0.01" },
    { number: 3, text: "g = 9.81" },
    { number: 4, text: "L = 1.25" },
    { number: 5, text: "theta = 0.52" },
    { number: 6, text: "omega = 0.00" },
    { number: 7 },
    { number: 8, text: "// Euler Integration Loop (dt = 0.01s)" },
    { number: 9, text: "alpha = -(g / L) * sin(theta)" },
    { number: 10, text: "omega = omega + alpha * dt" },
    { number: 11, text: "theta = theta + omega * dt // crazy comment" },
    { number: 12 },
];

// Splits a line on its first "//" and highlights everything from there to the
// end as a comment, whether the line is comment-only or the comment trails
// some code on the same line (e.g. "x = 1 // note").
function renderLineContent(text?: string) {
    if (!text) return null;
    return text.split(/(\/\/.*$)/).map((part, i) =>
        part.startsWith("//")
            ? <span key={i} className="comment-line">{part}</span>
            : <span key={i}>{part}</span>
    );
}

// Panels can't be dragged smaller than this share of the row.
const MIN_PANEL_WIDTH_PERCENT = 15;

type DragState = {
    dividerIndex: number; // 0 = between panel 0/1, 1 = between panel 1/2
    startX: number;
    startWidths: [number, number, number];
};

function Modeling() {
    const navigate = useNavigate();
    const location = useLocation();
    const presetId = (location.state as { presetId?: string } | null)?.presetId;
    const project = Projects.find((p) => p.id === presetId);

    const contentRef = useRef<HTMLDivElement | null>(null);
    const dragState = useRef<DragState | null>(null);
    const [panelWidths, setPanelWidths] = useState<[number, number, number]>([
        100 / 3,
        100 / 3,
        100 / 3,
    ]);
    const [draggingDivider, setDraggingDivider] = useState<number | null>(null);

    const handlePointerMove = useCallback((e: PointerEvent) => {
        const drag = dragState.current;
        const container = contentRef.current;
        if (!drag || !container) return;

        const containerWidth = container.getBoundingClientRect().width;
        const deltaPercent = ((e.clientX - drag.startX) / containerWidth) * 100;

        const { dividerIndex, startWidths } = drag;
        const pairTotal = startWidths[dividerIndex] + startWidths[dividerIndex + 1];

        let left = startWidths[dividerIndex] + deltaPercent;
        let right = pairTotal - left;

        if (left < MIN_PANEL_WIDTH_PERCENT) {
            left = MIN_PANEL_WIDTH_PERCENT;
            right = pairTotal - left;
        } else if (right < MIN_PANEL_WIDTH_PERCENT) {
            right = MIN_PANEL_WIDTH_PERCENT;
            left = pairTotal - right;
        }

        const next: [number, number, number] = [...startWidths];
        next[dividerIndex] = left;
        next[dividerIndex + 1] = right;
        setPanelWidths(next);
    }, []);

    const handlePointerUp = useCallback(() => {
        dragState.current = null;
        setDraggingDivider(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
    }, [handlePointerMove]);

    const handleDividerPointerDown = useCallback(
        (dividerIndex: number) => (e: React.PointerEvent) => {
            e.preventDefault();
            dragState.current = { dividerIndex, startX: e.clientX, startWidths: panelWidths };
            setDraggingDivider(dividerIndex);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            window.addEventListener("pointermove", handlePointerMove);
            window.addEventListener("pointerup", handlePointerUp);
        },
        [panelWidths, handlePointerMove, handlePointerUp]
    );

    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <div className="brand">
                        <img src={LogoIcon26px} alt="LogoIcon26px"/>
                    </div>
                    <h1>PhysicsGo</h1>
                    <div className="spacer"></div>
                    <h2>{ project?.title }</h2>
                </div>

                <div className="system-actions">
                    <button className="insert-media-btn">
                        <img src={PlusIcon14px} alt="PlusIcon14px"/>
                        <p>Insert Media &amp; Embeds</p>
                    </button>
                    <button className="hand-in-btn" onClick={() => navigate("/dashboard")}>
                        <img src={arrowIcon14px} alt="ArrowIcon14px"/>
                        <p>Hand in Assignment</p>
                    </button>
                    <div className="right-system-actions">
                        <button onClick={() => navigate("/settings")}>
                            <img src={SettingsIcon21px} alt="SettingsIcon21px"/>
                        </button>
                        <button onClick={() => navigate("/")}>
                            <img src={HelpIcon21px} alt="HelpIcon21px"/>
                        </button>
                    </div>
                </div>
            </div>

            <div className="content-modeling" ref={contentRef}>
                <div className="explanation-panel" style={{ flex: `0 0 ${panelWidths[0]}%` }}>
                    <div className="explanation">
                        <p>{ project?.explanation }</p>
                    </div>
                    <div className="explanation-footer">
                        <span>Estimated Time: <strong>{project?.estimatedTime} m</strong></span>
                        <span className="code-footer-dot">·</span>
                        <span>Equipment: <strong>{project?.equipment ?? "None"}</strong></span>
                    </div>
                </div>

                <div
                    className={`panel-divider${draggingDivider === 0 ? " dragging" : ""}`}
                    onPointerDown={handleDividerPointerDown(0)}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize explanation and code panels"
                />

                <div className="code-panel" style={{ flex: `0 0 ${panelWidths[1]}%` }}>
                    <div className="code">
                        <div className="code-panel-actions">
                            <button className="play-btn" aria-label="Run simulation">
                                <img src={PlayIcon20px} alt="PlayIcon20px"/>
                            </button>
                        </div>
                        {codeLines.map((line) => (
                            <div className="code-line" key={line.number}>
                                <span className="line-number">{line.number}</span>
                                <span className="line-content">
                                    {renderLineContent(line.text)}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="code-footer">
                        <span>Steps: <input type='number' className="steps-input" placeholder="100000"></input></span>
                    </div>
                </div>
                <div
                    className={`panel-divider${draggingDivider === 1 ? " dragging" : ""}`}
                    onPointerDown={handleDividerPointerDown(1)}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize code and analysis panels"
                />

                <div className="analysis-panel" style={{ flex: `0 0 ${panelWidths[2]}%` }}>
                    <div className="analysis">
                        <div className="analysis-panel-actions">
                            <button className="insert-points-btn">
                                <img src={PlusIcon14px} alt="PlusIcon14px"/>
                                <p>Insert Points</p>
                            </button>
                        </div>
                        <LineChart/>
                    </div>
                    <div className="analysis-footer">
                        <span>Domain: <strong> [{minDomainLineData}, {maxDomainLineData}]</strong></span>
                        <span className="code-footer-dot">·</span>
                        <span>Range: <strong>[{minRangeLineData}, {maxRangeLineData}]</strong></span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Modeling;