import { useEffect, useRef, useState } from "react";

export const CODE_LENGTH = 12;
const DASH_AFTER = [3, 7];
const VALID_CHAR = /[A-Z0-9]/;

interface CodeInputProps {
    // Called once all slots are filled; resolve false to clear the slots for another try
    onComplete: (code: string) => Promise<boolean>;
    onEdit?: () => void;
    disabled?: boolean;
}

function CodeInput({ onComplete, onEdit, disabled }: CodeInputProps) {
    const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    const isComplete = code.every((c) => c !== "");

    useEffect(() => {
        if (!isComplete) return;

        // Ignore the response if the code changed or the page was left while waiting
        let cancelled = false;
        onCompleteRef.current(code.join("")).then((accepted) => {
            if (cancelled || accepted) return;
            setCode(Array(CODE_LENGTH).fill(""));
            inputRefs.current[0]?.focus();
        });

        return () => {
            cancelled = true;
        };
    }, [code, isComplete]);

    const fillFrom = (index: number, text: string) => {
        const chars = text.toUpperCase().split("").filter((c) => VALID_CHAR.test(c));
        if (chars.length === 0) return;
        onEdit?.();
        setCode((prev) => {
            const next = [...prev];
            chars.slice(0, CODE_LENGTH - index).forEach((c, i) => (next[index + i] = c));
            return next;
        });
        inputRefs.current[Math.min(index + chars.length, CODE_LENGTH - 1)]?.focus();
    };

    const handleChange = (index: number, value: string) => {
        // Typing into a filled slot appends to its character; keep only what was added
        const prev = code[index];
        const added = value.startsWith(prev) ? value.slice(prev.length) : value;
        // More than one new character comes from autofill or dictation: spread it like a paste
        if (added.length > 1) return fillFrom(index, added);

        const char = added.toUpperCase();
        if (char && !VALID_CHAR.test(char)) return;
        onEdit?.();
        setCode((prev) => {
            const next = [...prev];
            next[index] = char;
            return next;
        });
        if (char && index < CODE_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    // Codes are usually shared as text ("ABCD-EFGH-JKLM"), so pasting fills every slot
    const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        fillFrom(index, e.clipboardData.getData("text"));
    };

    return (
        <div className="access-code">
            {code.map((char, index) => (
                <div key={index} style={{ display: "contents" }}>
                    <div className="char-slot">
                        <input
                            type="text"
                            id={`char-${index}`}
                            value={char}
                            disabled={disabled}
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            aria-label={`${index + 1} / ${CODE_LENGTH}`}
                            ref={(el) => { inputRefs.current[index] = el; }}
                            onChange={(e) => handleChange(index, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(index, e)}
                            onPaste={(e) => handlePaste(index, e)}
                        />
                    </div>
                    {DASH_AFTER.includes(index) && <div className="dash"></div>}
                </div>
            ))}
        </div>
    );
}

export default CodeInput;
