import { useNavigate, useLocation } from "react-router-dom";
import { curriculumPresets } from "../data/curriculumPresets";

import "../styles/global.css";
import "./modeling.css";

import SettingsIcon21px from "../assets/icons/settings-21px.svg";
import HelpIcon21px from "../assets/icons/help-21px.svg";
import LogoIcon26px from "../assets/icons/logo-26px.svg";
import arrowIcon14px from "../assets/icons/arrow-14px.svg";
import PlayIcon20px from "../assets/icons/play-20px.svg";
import PlusIcon14px from "../assets/icons/plus-14px.svg";

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

function Modeling() {
    const navigate = useNavigate();
    const location = useLocation();
    const presetId = (location.state as { presetId?: string } | null)?.presetId;
    const preset = curriculumPresets.find((p) => p.id === presetId);
    return (
        <div>
            <div className="nav">
                <div className="brand-and-breadcrumb">
                    <div className="brand">
                        <img src={LogoIcon26px} alt="LogoIcon26px"/>
                    </div>
                    <h1>PhysicsGo</h1>
                    <div className="spacer"></div>
                    <h2>{ preset?.title }</h2>
                </div>

                <div className="system-actions">
                    <button onClick={() => navigate("/dashboard")}>
                        <div className="hand-in-btn">
                            <img src={arrowIcon14px} alt="ArrowIcon14px"/>
                            <p>Hand in Assignment</p>
                        </div>
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

            <div className="content">
                <div className="explanation-panel">
                    <div className="explanation">
                        <p>{ preset?.explanation }</p>
                    </div>
                    <div className="code-footer">
                        <span>Estimated Time: <strong>45 min</strong></span>
                        <span className="code-footer-dot">·</span>
                        <span>Equipment: <strong>None</strong></span>
                    </div>
                </div>
                <div className="code-panel">
                    <div className="code">
                        <div className="code-panel-actions">
                            <button className="play-btn" aria-label="Run simulation">
                                <img src={PlayIcon20px} alt="PlayIcon20px"/>
                            </button>
                            <button className="insert-media-btn">
                                <img src={PlusIcon14px} alt="PlusIcon14px"/>
                                <p>Insert Media &amp; Embeds</p>
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
                        <span>Step: <strong>420</strong></span>
                        <span className="code-footer-dot">·</span>
                        <span>Time: <strong>4.20 s</strong></span>
                    </div>
                </div>
                <div className="analysis-panel">
                </div>
            </div>
        </div>
    );
}

export default Modeling;