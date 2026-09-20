export function formatRelativeDate(date: Date): string {
    // 1. Guard against invalid Date objects
    if (isNaN(date.getTime())) {
        return "Invalid date";
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // 2. Handle future dates
    if (diffMs < 0) {
        return "in the future";
    }

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) {
        return "just now";
    }

    if (minutes < 60) {
        return `${minutes} min ago`;
    }

    if (hours < 24) {
        return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    }

    // 3. Calculate actual calendar days (handles month/year boundaries & DST)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
        return "yesterday";
    }

    if (diffDays < 7) {
        return `${diffDays} days ago`;
    }

    // 4. Fallback formatted date (DD-MM-YYYY)
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
}