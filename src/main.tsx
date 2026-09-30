import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {AuthProvider} from "./lib/useAuth.tsx";
import { ProjectsProvider } from "./lib/useProjects";
import { LanguageProvider } from "./lib/useLanguage";
import { ThemeProvider } from "./lib/useTheme";
import "./styles/fonts.css";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ThemeProvider>
            <LanguageProvider>
                <AuthProvider>
                    <ProjectsProvider>
                        <App />
                    </ProjectsProvider>
                </AuthProvider>
            </LanguageProvider>
        </ThemeProvider>
    </React.StrictMode>
);
