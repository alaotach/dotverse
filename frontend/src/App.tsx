import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './context/AuthContext';
import Canvas from '../components/Canvas';
import Login from '../components/auth/Login';
import Register from '../components/auth/Register';
import UserProfile from '../components/profile/UserProfile';
import Navbar from '../components/layout/Navbar';
import Home from '../components/Home';
import { useAuth } from './context/AuthContext';

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
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/canvas" element={<Canvas />} /> 
          <Route 
            path="/profile" 
            element={<ProtectedRoute element={<UserProfile />} />} 
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
