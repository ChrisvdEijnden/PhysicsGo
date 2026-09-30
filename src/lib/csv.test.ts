import { describe, expect, it } from "vitest";

import { runCsv, toCsv } from "./csv";
import { tableFromRows } from "./samples";

describe("toCsv", () => {
    it("uses commas and decimal points in English", () => {
        expect(toCsv(["t", "x"], [[0, 1.5], [0.1, -2]], "en")).toBe("﻿t,x\r\n0,1.5\r\n0.1,-2\r\n");
    });

    it("uses semicolons and decimal commas in Dutch, as Dutch Excel expects", () => {
        expect(toCsv(["t", "x"], [[0.25, 3]], "nl")).toBe("﻿t;x\r\n0,25;3\r\n");
    });

    it("leaves cells without a number empty", () => {
        expect(toCsv(["a", "b", "c"], [[NaN, Infinity, undefined]], "en")).toBe("﻿a,b,c\r\n,,\r\n");
    });

    it("quotes text containing the separator, quotes or line breaks", () => {
        expect(toCsv(["name"], [['say "hi", ok']], "en")).toBe('﻿name\r\n"say ""hi"", ok"\r\n');
    });
});

describe("runCsv", () => {
    it("puts the code's variables first and adds the others the run produced", () => {
        const history = tableFromRows([
            new Map([["x", 1], ["t", 0], ["x_video1", NaN]]),
            new Map([["x", 2], ["t", 1], ["x_video1", 5]]),
        ]);
        expect(runCsv(history, ["t", "x"], "en")).toBe("﻿t,x,x_video1\r\n0,1,\r\n1,2,5\r\n");
    });
});
