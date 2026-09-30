import type { TranslationKey } from "./Translations";
import type { InterpreterMessage } from "./simulation";

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

// What the parser expected, per key the interpreter reports (see describe_rule in InterpreterGo)
const EXPECTED: Record<string, TranslationKey> = {
    value: "interp.expValue",
    number: "interp.expNumber",
    variable: "interp.expVariable",
    function: "interp.expFunction",
    assign: "interp.expAssign",
    comparison: "interp.expComparison",
    statement: "interp.expStatement",
    if: "interp.expIf",
    else: "interp.expElse",
    stop: "interp.expStop",
    condition: "interp.expCondition",
    logic: "interp.expLogic",
    operator: "interp.expOperator",
    minus: "interp.expMinus",
    block: "interp.expBlock",
    end: "interp.expEnd",
};

// A message from the interpreter in the app's language; unknown codes fall back to its English text
export function interpreterMessage(t: T, m: InterpreterMessage): string {
    const p = m.params ?? {};
    switch (m.code) {
        case "undefined_variable": return t("interp.undefinedVariable", { name: p.name });
        case "compound_undefined": return t("interp.compoundUndefined", { name: p.name, op: p.op });
        case "unknown_function": return t("interp.unknownFunction", { name: p.name, available: p.available });
        case "wrong_arguments": return t("interp.wrongArguments", { name: p.name, expected: p.expected, given: p.given });
        case "indent_expected": return t("interp.indentExpected");
        case "indent_unexpected": return t("interp.indentUnexpected");
        case "indent_mismatch": return t("interp.indentMismatch");
        case "not_finite": return t("interp.notFinite", { name: p.name, value: p.value, step: p.step });
        case "syntax": {
            const expected = (p.expected ?? "").split(",").filter((k) => EXPECTED[k]).map((k) => t(EXPECTED[k]));
            return expected.length ? t("interp.syntaxExpected", { expected: expected.join(t("interp.or")) }) : t("interp.syntax");
        }
        default: return m.message;
    }
}
