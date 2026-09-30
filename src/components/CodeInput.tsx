import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useTranslation } from "../lib/useTranslations";

export const CODE_LENGTH = 12;
// Codes never contain these (they're easily confused when read from a projector)
const AMBIGUOUS = /[01OI]/g;

// Letters and digits only, upper case
const clean = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
// "ABCDEFGHJKLM" → "ABCD-EFGH-JKLM"
export const formatCode = (raw: string) => raw.match(/.{1,4}/g)?.join("-") ?? "";
// Where the caret goes in the formatted text after `count` characters
const caretAt = (count: number) => count + (count > 4 ? 1 : 0) + (count > 8 ? 1 : 0);

interface CodeInputProps {
    // Called once the code is complete; resolve false when it isn't accepted (it stays, marked wrong)
    onComplete: (code: string) => Promise<boolean>;
    onEdit?: () => void;
    disabled?: boolean;
    // A code from a join link, checked right away
    initial?: string;
    // Id of the error message, read out with the field
    errorId?: string;
}

// One field for a 12-character class code or teacher invitation, grouped as XXXX-XXXX-XXXX while
// typing. Pasting or typing with or without dashes works; O, 0, I and 1 are refused with a hint.
function CodeInput({ onComplete, onEdit, disabled, initial = "", errorId }: CodeInputProps) {
    const { t } = useTranslation();
    const [raw, setRaw] = useState(() => clean(initial).replace(AMBIGUOUS, "").slice(0, CODE_LENGTH));
    const [invalid, setInvalid] = useState(false);
    const [ambiguous, setAmbiguous] = useState(false);
    const [checking, setChecking] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const caret = useRef<number | null>(null);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    // Keep the caret where the user was typing, even though dashes come and go
    useLayoutEffect(() => {
        if (caret.current === null || !inputRef.current) return;
        inputRef.current.setSelectionRange(caret.current, caret.current);
        caret.current = null;
    });

    useEffect(() => {
        if (raw.length !== CODE_LENGTH) return;
        // Ignore the answer if the code changed or the page was left while waiting
        let cancelled = false;
        setChecking(true);
        onCompleteRef.current(raw).then((accepted) => {
            if (cancelled) return;
            setChecking(false);
            if (accepted) return;
            // Keep the code so one wrong character can be fixed; selected, so typing replaces it all
            setInvalid(true);
            inputRef.current?.focus();
            inputRef.current?.select();
        });
        return () => {
            cancelled = true;
        };
    }, [raw]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const typed = e.target.value;
        const before = clean(typed.slice(0, e.target.selectionStart ?? typed.length));
        const next = clean(typed).replace(AMBIGUOUS, "").slice(0, CODE_LENGTH);
        setAmbiguous(/[01OI]/.test(clean(typed)));
        caret.current = caretAt(Math.min(before.replace(AMBIGUOUS, "").length, next.length));
        if (next === raw) return;
        setInvalid(false);
        onEdit?.();
        setRaw(next);
    }

    return (
        <div className="code-input">
            <input
                ref={inputRef}
                type="text"
                className={`code-field${invalid ? " invalid" : ""}`}
                value={formatCode(raw)}
                disabled={disabled}
                autoFocus={!initial}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                placeholder="XXXX-XXXX-XXXX"
                aria-label={t("code.label")}
                aria-invalid={invalid}
                aria-describedby={[invalid && errorId, "code-hint"].filter(Boolean).join(" ")}
                aria-busy={checking}
                onChange={handleChange}
            />
            <p id="code-hint" className={`code-hint${ambiguous ? " warn" : ""}`} aria-live="polite">
                {ambiguous ? t("code.ambiguous") : t("code.hint")}
            </p>
        </div>
    );
}

export default CodeInput;
