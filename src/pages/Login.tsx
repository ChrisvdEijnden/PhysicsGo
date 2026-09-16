import { useNavigate } from "react-router-dom";
const navigate = useNavigate();

function Login() {
    return (
        <div>
            <h1>Login</h1>
            <button onClick={() => navigate("/dashboard")}>Login
                Go to Dashboard
            </button>
        </div>
    );
}

export default Login;