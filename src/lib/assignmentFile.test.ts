import { describe, expect, it } from "vitest";

import { assignmentFileContents, parseAssignmentFile } from "./assignmentFile";
import type { ProjectWork } from "../data/Projects";

const work: ProjectWork = {
    start: "t = 0\ndt = 0.01\n",
    model: "stop als t >= 1\n",
    steps: "500",
    graphs: [{ id: "graph-1", x: "t", ys: [{ name: "x", color: 0 }] }],
    media: [],
};

describe("assignment files", () => {
    it("open again as the same work", () => {
        const opened = parseAssignmentFile(assignmentFileContents("Freefall", "# Drop a ball", work));
        expect(opened).toEqual({ title: "Freefall", explanation: "# Drop a ball", work });
    });

    it("aren't accepted when they're something else", () => {
        expect(parseAssignmentFile("not json")).toBeNull();
        expect(parseAssignmentFile(JSON.stringify({ title: "x", work }))).toBeNull();
        expect(parseAssignmentFile(JSON.stringify({ format: "physicsgo-assignment", version: 1, work: { steps: "1" } }))).toBeNull();
    });

    it("from a newer version of PhysicsGo aren't guessed at", () => {
        const newer = JSON.parse(assignmentFileContents("Freefall", "", work));
        newer.version = 99;
        expect(parseAssignmentFile(JSON.stringify(newer))).toBeNull();
    });

    it("without a title leave the name to the file name", () => {
        const untitled = JSON.parse(assignmentFileContents("", "", work));
        expect(parseAssignmentFile(JSON.stringify(untitled))?.title).toBeNull();
    });
});
