import { HashRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import User from "./pages/User";
import Dashboard from "./pages/Dashboard";
import Modeling, { PreviewProject, ReviewWork } from "./pages/Modeling";
import Settings from "./pages/Settings";
import AllModels from "./pages/AllModels";
import SignIn from "./pages/SignIn";
import Register from "./pages/Register.tsx";
import Classes from "./pages/Classes";
import JoinClass from "./pages/JoinClass";
import ResetPassword from "./pages/ResetPassword";
import ProjectEditor from "./pages/ProjectEditor";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import { PublicOnly, RequireAuth } from "./components/RouteGuards";

function App() {
    return (
        <HashRouter>
            <ErrorBoundary>
                <Routes>
                    <Route element={<PublicOnly/>}>
                        <Route path="/" element={<SignIn />} />
                        <Route path="/login" element={<SignIn />} />
                        <Route path="/join" element={<Login />} />   {/* class code or teacher invitation, before signing up */}
                        <Route path="/register" element={<Register />} />
                        <Route path="/reset" element={<ResetPassword />} />
                    </Route>

                    {/* Language and theme can be changed before signing in */}
                    <Route path="/settings" element={<Settings />} />

                    <Route element={<RequireAuth/>}>
                        <Route path="/user" element={<User />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/modeling" element={<Modeling />} />
                        <Route path="/all-models" element={<AllModels />} />
                    </Route>
                    <Route element={<RequireAuth role="student"/>}>
                        <Route path="/join-class" element={<JoinClass />} />
                    </Route>
                    <Route element={<RequireAuth role="teacher"/>}>
                        <Route path="/classes" element={<Classes />} />
                        <Route path="/review/:classId/:userId/:projectId" element={<ReviewWork />} />
                        <Route path="/projects/new" element={<ProjectEditor />} />
                        <Route path="/projects/:projectId/edit" element={<ProjectEditor />} />
                        <Route path="/projects/:projectId/preview" element={<PreviewProject />} />
                    </Route>

                    <Route path="*" element={<NotFound />} />
                </Routes>
            </ErrorBoundary>
        </HashRouter>
    );
}

export default App;
