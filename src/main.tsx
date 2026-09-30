import React from "react";
// Fonts ship with the app rather than coming from Google, so no student data goes to a third party
import "@fontsource/figtree/300.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/figtree/800.css";
import "@fontsource/jetbrains-mono/400.css";
import ReactDOM from "react-dom/client";
import App from "./App";
import {AuthProvider} from "./lib/useAuth.tsx";
import { ProjectsProvider } from "./lib/useProjects";
import { PreferencesProvider } from "./lib/preferences";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <PreferencesProvider>
            <AuthProvider>
                <ProjectsProvider>
                    <App />
                </ProjectsProvider>
            </AuthProvider>
        </PreferencesProvider>
    </React.StrictMode>
);