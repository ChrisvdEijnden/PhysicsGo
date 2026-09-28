import { HashRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import User from "./pages/User";
import Dashboard from "./pages/Dashboard";
import Modeling from "./pages/Modeling";
import Settings from "./pages/Settings";
import AllModels from "./pages/AllModels";
import SignIn from "./pages/SignIn";
import Register from "./pages/Register.tsx";

function App() {
    return (
        <HashRouter>
            <Routes>
                <Route path="/" element={<SignIn />} />
                <Route path="/login" element={<SignIn />} />
                <Route path="/join" element={<Login />} />   {/* your existing code page */}
                <Route path="/register" element={<Register />} />
                <Route path="/user" element={<User />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/modeling" element={<Modeling />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/all-models" element={<AllModels />} />
            </Routes>
        </HashRouter>
    );

}

export default App;