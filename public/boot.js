// The saved theme and language apply before the first paint, so a dark-mode user doesn't see a flash
// of the light theme. The app keeps them up to date after this (useTheme, useLanguage). A file rather
// than an inline script, so the server's Content Security Policy can forbid inline scripts.
try {
    var theme = localStorage.getItem("physicsgo_theme");
    if (theme !== "light" && theme !== "dark") {
        theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
    var language = localStorage.getItem("physicsgo_language");
    if (language === "nl" || language === "en") document.documentElement.lang = language;
} catch (e) {
    // Storage can be blocked; the app then starts with the defaults
}
