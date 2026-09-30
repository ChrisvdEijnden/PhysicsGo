import { useEffect, useState } from "react";

import DownloadIcon18px from "../assets/icons/download-18px.svg";
import { EMBED_ALLOW, EMBED_SANDBOX, isPdf, safeEmbedSrc } from "../lib/embeds";
import { useTranslation } from "../lib/useTranslations";

export function DocumentGlyph() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 1.5H9L12.5 5V13.5C12.5 14.05 12.05 14.5 11.5 14.5H4.5C3.95 14.5 3.5 14.05 3.5 13.5V2.5C3.5 1.95 3.95 1.5 4 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M9 1.5V5H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M5.5 8.5H10.5M5.5 10.5H10.5M5.5 12H8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        </svg>
    );
}

export const isPdfMime = (mime: string) => mime === "application/pdf";

// A PDF in the browser's own viewer. The file is read here first and only shown when it really is a
// PDF; the copy the frame loads is this page's own, so the viewer isn't blocked by the server's
// sandbox header on media files.
export function PdfView({ url, name }: { url: string; name: string }) {
    const { t } = useTranslation();
    const [src, setSrc] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let own: string | null = null;
        setSrc(null);
        setFailed(false);
        fetch(url)
            .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
            .then(async (blob) => {
                if (!(await isPdf(blob))) throw new Error("not a PDF");
                if (cancelled) return;
                own = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
                setSrc(own);
            })
            .catch(() => !cancelled && setFailed(true));
        return () => {
            cancelled = true;
            if (own) URL.revokeObjectURL(own);
        };
    }, [url]);

    if (failed) {
        return (
            <div className="analysis-media-file">
                <DocumentGlyph/>
                <span>{t("modeling.pdfFailed", { name })}</span>
            </div>
        );
    }
    return src
        ? <iframe className="analysis-media-content media-frame" src={`${src}#view=FitH`} title={name}/>
        : <div className="analysis-media-file"><span>{t("modeling.loading")}</span></div>;
}

// Word and other documents a browser can't show: their name and a download
export function DownloadView({ url, name }: { url: string; name: string }) {
    const { t } = useTranslation();
    return (
        <div className="analysis-media-file">
            <DocumentGlyph/>
            <span>{name}</span>
            <a className="class-button media-download" href={url} download={name}>
                <img src={DownloadIcon18px} alt=""/>
                {t("modeling.downloadFile")}
            </a>
        </div>
    );
}

// A website in a sandboxed frame. Sites that don't allow being shown inside another page stay
// blank, which can't be detected from here, so the new-tab link is always there.
export function EmbedView({ href, name }: { href: string; name: string }) {
    const { t } = useTranslation();
    const src = safeEmbedSrc(href, window.location.origin);
    if (!src) {
        return (
            <div className="analysis-media-file">
                <span>{t("modeling.embedInvalid")}</span>
            </div>
        );
    }
    return (
        <>
            <iframe
                className="analysis-media-content media-frame"
                src={src}
                title={name}
                sandbox={EMBED_SANDBOX}
                allow={EMBED_ALLOW}
                referrerPolicy="strict-origin-when-cross-origin"
                loading="lazy"
            />
            <p className="analysis-footer media-footer embed-footer">
                <span>{new URL(src).hostname}</span>
                <span className="code-footer-dot">·</span>
                <a href={src} target="_blank" rel="noopener noreferrer">{t("modeling.embedNewTab")}</a>
            </p>
        </>
    );
}
