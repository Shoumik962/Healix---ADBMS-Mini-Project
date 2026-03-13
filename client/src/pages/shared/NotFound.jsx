// src/pages/shared/NotFound.jsx
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function NotFoundPage() {
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const home = isAuthenticated ? `/${user?.role}` : '/login';

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
                <p className="text-8xl font-bold text-gray-200 select-none">404</p>
                <h1 className="text-2xl font-bold text-gray-800 mt-4">Page not found</h1>
                <p className="text-gray-500 mt-2">
                    The page you're looking for doesn't exist or you don't have access to it.
                </p>
                <div className="flex gap-3 justify-center mt-6">
                    <button className="btn-secondary" onClick={() => navigate(-1)}>← Go back</button>
                    <Link to={home} className="btn-primary">Go home</Link>
                </div>
            </div>
        </div>
    );
}