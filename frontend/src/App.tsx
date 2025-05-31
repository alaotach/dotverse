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
import Gallery from '../components/Gallery';
import { useEffect } from 'react';
import { EconomyProvider } from './context/EconomyContext';
import EconomyDashboard from '../components/economy/EconomyDashboard';
import AuctionDashboard from '../components/auction/AuctionDashboard';
import NotificationCenter from '../components/notifications/NotificationCenter';
import { NotificationProvider } from './context/NotificationContext';
import { ChatProvider } from './context/ChatContext';
import ChatPanel from '../components/chat/ChatPanel';
import { MusicProvider, useMusic } from './context/MusicContext';
import Controls from '../components/music/Controls';

const ProtectedRoute: React.FC<{
  element: React.ReactNode;
}> = ({ element }) => {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }
  
  return currentUser ? <>{element}</> : <Navigate to="/login" replace />;
};

const MusicPlayerGlobalRenderer: React.FC = () => {
  const { currentUser } = useAuth();
  const { isPlayerVisible } = useMusic(); // Use context to decide if player UI should be rendered
  if (!currentUser || !isPlayerVisible) return null; // Only render if user logged in AND player is set to be visible
  return <Controls />;
}


function AppContent() {
  const location = useLocation();
  const isCanvasPage = location.pathname === '/canvas';
  const { currentUser } = useAuth();

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
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/canvas" element={<Canvas />} />
          </Routes>
        </main>
        {currentUser && <ChatPanel />}
      </div>
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
          <Route path="/gallery" element={<ProtectedRoute element={<Gallery />} />} />
          <Route path="/economy" element={<ProtectedRoute element={<EconomyDashboard />} />} />
          <Route path="/auction" element={<ProtectedRoute element={<AuctionDashboard />} />} />
          <Route path="/notifications" element={<ProtectedRoute element={<NotificationCenter />} />} />
          <Route 
            path="/admin/analytics" 
            element={<ProtectedRoute element={<AdminAnalytics />} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
       {currentUser && <ChatPanel />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <EconomyProvider>
          <NotificationProvider>
            <ChatProvider>
              <MusicProvider>
                <AppContent />
                <MusicPlayerGlobalRenderer />
              </MusicProvider>
            </ChatProvider>
          </NotificationProvider>
        </EconomyProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
