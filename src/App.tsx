import { HashRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Modeling from "./pages/Modeling";
import Settings from "./pages/Settings";
import AllModels from "./pages/AllModels";

function App() {
    return (
        <HashRouter>
            <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/modeling" element={<Modeling />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/all-models" element={<AllModels />} />
            </Routes>
        </HashRouter>
    );

}

export default App;