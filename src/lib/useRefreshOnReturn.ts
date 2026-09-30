import { useEffect, useRef } from "react";

// What a page shows can change elsewhere while it's in the background: a student hands in, a
// co-teacher publishes, an administrator changes an account. Coming back to the tab or window loads
// it again, at most once per `minIntervalMs` (switching back and forth doesn't flood the server).
export function useRefreshOnReturn(reload: () => void, minIntervalMs = 30_000) {
    const reloadRef = useRef(reload);
    useEffect(() => {
        reloadRef.current = reload;
    }, [reload]);

    useEffect(() => {
        let last = Date.now();
        const onReturn = () => {
            if (document.visibilityState !== "visible" || Date.now() - last < minIntervalMs) return;
            last = Date.now();
            reloadRef.current();
        };
        document.addEventListener("visibilitychange", onReturn);
        window.addEventListener("focus", onReturn);
        return () => {
            document.removeEventListener("visibilitychange", onReturn);
            window.removeEventListener("focus", onReturn);
        };
    }, [minIntervalMs]);
}
