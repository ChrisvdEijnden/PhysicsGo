import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {AuthProvider} from "./lib/useAuth.tsx";
import { ProjectsProvider } from "./lib/useProjects";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AuthProvider>
            <ProjectsProvider>
                <App />
            </ProjectsProvider>
        </AuthProvider>
    </React.StrictMode>
);