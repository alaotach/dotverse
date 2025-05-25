import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './context/AuthContext';
import Canvas from '../components/Canvas';
import Login from '../components/auth/Login';
import Register from '../components/auth/Register';
import UserProfile from '../components/profile/UserProfile';
import Navbar from '../components/layout/Navbar';
import Home from '../components/Home';
import { useAuth } from './context/AuthContext';
import AdminAnalytics from '../components/admin/AdminAnalytics';
import { useEffect } from 'react';

const ProtectedRoute: React.FC<{
  element: React.ReactNode;
}> = ({ element }) => {
  const { currentUser, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }
  
  return currentUser ? <>{element}</> : <Navigate to="/login" replace />;
};

function AppContent() {
  const location = useLocation();
  const isCanvasPage = location.pathname === '/canvas';

  useEffect(() => {
    if (isCanvasPage) {
      document.body.classList.add('canvas-page');
    } else {
      document.body.classList.remove('canvas-page');
    }
    return () => {
      document.body.classList.remove('canvas-page');
    };
  }, [isCanvasPage]);

  if (isCanvasPage) {
    return (
      <Routes>
        <Route path="/canvas" element={<Canvas />} />
      </Routes>
    );
  }
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route 
            path="/profile" 
            element={<ProtectedRoute element={<UserProfile />} />} 
          />
          <Route 
            path="/admin/analytics" 
            element={<ProtectedRoute element={<AdminAnalytics />} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
