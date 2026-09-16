import { useNavigate } from "react-router-dom";
const navigate = useNavigate();

function Dashboard() {
    return (
        <div>
            <h1>Login</h1>
            <button onClick={() => navigate("/modeling")}>
                Go to Modeling
            </button>
        </div>
    );
}

export default Dashboard;