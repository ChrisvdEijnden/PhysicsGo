// Websites shown in a media panel: any https address, in a sandboxed frame. Links to a YouTube or
// Vimeo video become their players (YouTube's without cookies, Vimeo's without tracking), and a PhET
// simulation's page becomes the simulation itself.

export interface Embed {
    // What the frame loads
    href: string;
    // Shown on the panel, e.g. "YouTube" or the website's name
    name: string;
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const YOUTUBE_ID = /^[\w-]{11}$/;

// "90", "90s", "1m30s" or "1h2m3s" as seconds
function seconds(value: string | null): number | null {
    if (!value) return null;
    if (/^\d+s?$/.test(value)) return parseInt(value, 10);
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
    if (!match || !match[0]) return null;
    return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function youtube(url: URL): Embed | null {
    if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const id = url.hostname === "youtu.be"
        ? parts[0]
        : parts[0] === "watch" ? url.searchParams.get("v")
            : ["embed", "shorts", "live", "v"].includes(parts[0]) ? parts[1] : null;
    if (!id || !YOUTUBE_ID.test(id)) return null;
    const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
    return {
        href: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`,
        name: "YouTube",
    };
}

function vimeo(url: URL): Embed | null {
    if (url.hostname !== "vimeo.com" && url.hostname !== "www.vimeo.com" && url.hostname !== "player.vimeo.com") return null;
    const id = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
    return id ? { href: `https://player.vimeo.com/video/${id}?dnt=1`, name: "Vimeo" } : null;
}

// phet.colorado.edu/en/simulations/projectile-motion → the simulation in that language
function phet(url: URL): Embed | null {
    if (url.hostname !== "phet.colorado.edu") return null;
    const sim = /^\/(?:([a-z]{2}(?:_[A-Z]{2})?)\/)?simulations?\/([a-z0-9-]+)\/?$/.exec(url.pathname);
    if (sim) {
        const [, locale, name] = sim;
        return {
            href: `https://phet.colorado.edu/sims/html/${name}/latest/${name}_all.html${locale ? `?locale=${locale}` : ""}`,
            name: `PhET: ${name.replace(/-/g, " ")}`,
        };
    }
    const html = /^\/sims\/html\/([a-z0-9-]+)\//.exec(url.pathname);
    return html ? { href: url.href, name: `PhET: ${html[1].replace(/-/g, " ")}` } : null;
}

/**
 * The embed for what someone typed or pasted, or null when it isn't an https address (or is
 * PhysicsGo itself). An address without a scheme gets https://.
 */
export function toEmbed(input: string, ownOrigin: string): Embed | null {
    const text = input.trim();
    if (!text || text.length > 2000) return null;
    let url: URL;
    try {
        url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) return null;
    if (url.origin === ownOrigin) return null;
    return youtube(url) ?? vimeo(url) ?? phet(url) ?? { href: url.href, name: url.hostname.replace(/^www\./, "") };
}

// The address a frame may load: only https pages of other websites. Checked again when showing
// saved work, since that could have been changed by hand.
export function safeEmbedSrc(href: unknown, ownOrigin: string): string | null {
    if (typeof href !== "string" || href.length > 2000) return null;
    try {
        const url = new URL(href);
        return url.protocol === "https:" && url.origin !== ownOrigin && !url.username && !url.password ? url.href : null;
    } catch {
        return null;
    }
}

// The frame's sandbox: scripts and the site's own storage (players need them), popups (so "watch on
// YouTube" opens a tab) and fullscreen, but it can't navigate or reach this app, and it can't submit
// forms, so a page made to look like a sign-in form can't post what's typed into it
export const EMBED_SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation";
export const EMBED_ALLOW = "fullscreen; picture-in-picture; encrypted-media";

// A file's first bytes say whether it really is a PDF, whatever its name or type claims
export async function isPdf(blob: Blob): Promise<boolean> {
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...head) === "%PDF-";
}
