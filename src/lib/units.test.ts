import { expect, test } from "vitest";
import { codeUnits, unitOf } from "./units";

test("a unit is a short symbol at the start of the comment", () => {
    expect(unitOf(" m")).toBe("m");
    expect(unitOf(" m/s, upwards is positive")).toBe("m/s");
    expect(unitOf(" N·m²/kg²")).toBe("N·m²/kg²");
    expect(unitOf(" [kg]")).toBe("kg");
    expect(unitOf(" rad")).toBe("rad");
    expect(unitOf(" °C")).toBe("°C");
    expect(unitOf(" height")).toBeNull();
    expect(unitOf(" intensity")).toBeNull();
    expect(unitOf(" in seconds")).toBeNull();
    expect(unitOf(" elastic: it bounces back")).toBeNull();
    expect(unitOf("")).toBeNull();
});

test("units of the quantities in the code", () => {
    const code = [
        "// Start values",
        "dt = 0.01    // s",
        "h = 10       // m, height above the floor",
        "v = 0        // m/s",
        "a = F / m    // m/s²",
        "k = 2        // spring",
        "h = h + v * dt  // m but later",
        "x == 1 // m",
    ].join("\n");
    expect(Object.fromEntries(codeUnits(code))).toEqual({ dt: "s", h: "m", v: "m/s", a: "m/s²", t: "s" });
    expect(codeUnits("t = 0 // min\ndt = 1 // s").get("t")).toBe("min");
});
