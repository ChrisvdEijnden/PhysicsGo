import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";

import { LoadingScreen, PublicOnly, RequireAuth, WaitForSession } from "./components/RouteGuards";
import ErrorBoundary, { NotFound } from "./components/ErrorBoundary";
import SessionEndedDialog from "./components/SessionEndedDialog";

// Each page loads when it's first opened, so the sign-in page doesn't wait for the code editor,
// the charts and the interpreter that only the modeling pages use
const Login = lazy(() => import("./pages/Login"));
const User = lazy(() => import("./pages/User"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Modeling = lazy(() => import("./pages/Modeling"));
const PreviewProject = lazy(() => import("./pages/Modeling").then((m) => ({ default: m.PreviewProject })));
const ReviewWork = lazy(() => import("./pages/Modeling").then((m) => ({ default: m.ReviewWork })));
const Settings = lazy(() => import("./pages/Settings"));
const AllModels = lazy(() => import("./pages/AllModels"));
const SignIn = lazy(() => import("./pages/SignIn"));
const Register = lazy(() => import("./pages/Register"));
const Classes = lazy(() => import("./pages/Classes"));
const JoinClass = lazy(() => import("./pages/JoinClass"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ProjectEditor = lazy(() => import("./pages/ProjectEditor"));
const Admin = lazy(() => import("./pages/Admin"));
const Privacy = lazy(() => import("./pages/Privacy"));

// Who may open which page is decided here, once, instead of by each page
function AppRoutes() {
    const location = useLocation();
    return (
        <ErrorBoundary resetKey={location.pathname}>
            {/* A page that can't load (offline, or a new version was deployed) ends up in the boundary */}
            <Suspense fallback={<LoadingScreen/>}>
            <Routes>
                <Route element={<PublicOnly/>}>
                    <Route path="/" element={<SignIn />} />
                    <Route path="/login" element={<SignIn />} />
                    <Route path="/join" element={<Login />} />   {/* class code or teacher invitation, before signing up */}
                    <Route path="/register" element={<Register />} />
                    <Route path="/reset" element={<ResetPassword />} />
                </Route>
                {/* Language and theme can be changed before signing in too */}
                <Route element={<WaitForSession/>}>
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/privacy" element={<Privacy />} />
                </Route>
                <Route element={<RequireAuth/>}>
                    <Route path="/user" element={<User />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/modeling" element={<Modeling />} />
                    <Route path="/modeling/:projectId" element={<Modeling />} />
                    <Route path="/all-models" element={<AllModels />} />
                </Route>
                <Route element={<RequireAuth role="student"/>}>
                    <Route path="/join-class" element={<JoinClass />} />
                </Route>
                <Route element={<RequireAuth role="teacher"/>}>
                    <Route path="/review/:classId/:userId/:projectId" element={<ReviewWork />} />
                    <Route path="/projects/new" element={<ProjectEditor />} />
                    <Route path="/projects/:projectId/edit" element={<ProjectEditor />} />
                    <Route path="/projects/:projectId/preview" element={<PreviewProject />} />
                    <Route path="/classes" element={<Classes />} />
                </Route>
                <Route element={<RequireAuth admin/>}>
                    <Route path="/admin" element={<Admin />} />
                </Route>
                <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            {/* Over whatever page is open, so an ended session doesn't take the page away */}
            <SessionEndedDialog/>
        </ErrorBoundary>
    );
}

function App() {
    return (
        <HashRouter>
            <AppRoutes/>
        </HashRouter>
    );
}

export default App;
