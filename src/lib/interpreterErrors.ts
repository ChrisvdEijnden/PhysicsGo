import type { InterpreterError } from "./simulation";
import type { TranslationKey } from "./Translations";

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

// Parts of the language named in "expected ..." messages
const TOKENS: Record<string, TranslationKey> = {
    value: "interp.tokenValue",
    number: "interp.tokenNumber",
    name: "interp.tokenName",
    function: "interp.tokenFunction",
    assign: "interp.tokenAssign",
    comparison: "interp.tokenComparison",
    statement: "interp.tokenStatement",
    if: "interp.tokenIf",
    stop: "interp.tokenStop",
    else: "interp.tokenElse",
    condition: "interp.tokenCondition",
    logic: "interp.tokenLogic",
    operator: "interp.tokenOperator",
    block: "interp.tokenBlock",
    end: "interp.tokenEnd",
    other: "interp.tokenOther",
};

const MESSAGES: Record<string, TranslationKey> = {
    expected: "interp.expected",
    unexpected: "interp.unexpected",
    syntax: "interp.syntax",
    expected_indent: "interp.expectedIndent",
    unexpected_indent: "interp.unexpectedIndent",
    indent_mismatch: "interp.indentMismatch",
    no_value: "interp.noValue",
    no_value_update: "interp.noValueUpdate",
    unknown_function: "interp.unknownFunction",
    wrong_arguments: "interp.wrongArguments",
    invalid_data: "interp.invalidData",
};

// An interpreter error in the interface's language; codes this version doesn't know fall back to English
export function describeError(error: InterpreterError, t: T): string {
    const key = MESSAGES[error.code];
    if (!key) return error.message;
    const tokens = (list: string | undefined) =>
        (list ?? "").split(",").filter(Boolean).map((code) => t(TOKENS[code] ?? "interp.tokenOther"));
    const or = (items: string[]) =>
        items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${t("interp.or")} ${items[items.length - 1]}`;
    // "expected" / "unexpected" list parts of the language by code; other params are shown as they are
    if (error.code === "expected") return t(key, { expected: or(tokens(error.params.expected)) });
    if (error.code === "unexpected") return t(key, { unexpected: or(tokens(error.params.unexpected)) });
    return t(key, error.params);
}
