// Saves `contents` to the user's downloads as `fileName`
export function downloadFile(fileName: string, contents: Blob) {
    const url = URL.createObjectURL(contents);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // The download has started by now; the URL isn't needed after that
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// A file name made from a title (letters, digits, spaces and dashes), e.g. "Standard-Freefall.csv"
export function fileNameFor(title: string, extension: string) {
    const base = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-");
    return `${base || "physicsgo"}.${extension}`;
}
