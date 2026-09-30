import { describe, expect, test } from "vitest";
import { isPdf, safeEmbedSrc, toEmbed } from "./embeds";

const OWN = "https://physicsgo.school.nl";

describe("embedding websites", () => {
    test("YouTube links become the player without cookies, keeping the start time", () => {
        const player = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
        expect(toEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ", OWN)?.href).toBe(player);
        expect(toEmbed("youtu.be/dQw4w9WgXcQ?t=90", OWN)?.href).toBe(`${player}?start=90`);
        expect(toEmbed("https://youtube.com/shorts/dQw4w9WgXcQ", OWN)?.href).toBe(player);
        expect(toEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s", OWN)?.href).toBe(`${player}?start=90`);
        expect(toEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ", OWN)?.name).toBe("YouTube");
    });

    test("PhET simulation pages become the simulation, in their language", () => {
        const sim = toEmbed("https://phet.colorado.edu/nl/simulations/projectile-motion", OWN);
        expect(sim?.href).toBe("https://phet.colorado.edu/sims/html/projectile-motion/latest/projectile-motion_all.html?locale=nl");
        expect(sim?.name).toBe("PhET: projectile motion");
        const direct = "https://phet.colorado.edu/sims/html/forces-and-motion-basics/latest/forces-and-motion-basics_all.html";
        expect(toEmbed(direct, OWN)?.href).toBe(direct);
    });

    test("Vimeo links become the player without tracking", () => {
        expect(toEmbed("https://vimeo.com/76979871", OWN)?.href).toBe("https://player.vimeo.com/video/76979871?dnt=1");
    });

    test("any other https page is shown as it is; everything else is refused", () => {
        expect(toEmbed("https://www.geogebra.org/m/abc123", OWN)).toEqual({ href: "https://www.geogebra.org/m/abc123", name: "geogebra.org" });
        expect(toEmbed("http://example.com", OWN)).toBeNull();
        expect(toEmbed("javascript:alert(1)", OWN)).toBeNull();
        expect(toEmbed("data:text/html,<script>alert(1)</script>", OWN)).toBeNull();
        expect(toEmbed(`${OWN}/#/dashboard`, OWN)).toBeNull();
        expect(toEmbed("https://user:secret@example.com", OWN)).toBeNull();
        expect(toEmbed("not a link", OWN)).toBeNull();
    });

    test("saved addresses are checked again before a frame loads them", () => {
        expect(safeEmbedSrc("https://example.com/page", OWN)).toBe("https://example.com/page");
        expect(safeEmbedSrc("javascript:alert(1)", OWN)).toBeNull();
        expect(safeEmbedSrc(`${OWN}/api/auth/me`, OWN)).toBeNull();
        expect(safeEmbedSrc({ href: "https://example.com" }, OWN)).toBeNull();
    });

    test("only files that start like a PDF are shown as one", async () => {
        expect(await isPdf(new Blob(["%PDF-1.7\n..."]))).toBe(true);
        expect(await isPdf(new Blob(["<html><script>alert(1)</script>"], { type: "application/pdf" }))).toBe(false);
    });
});
