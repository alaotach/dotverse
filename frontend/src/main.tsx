import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
) 
// import React from 'react';
// import ReactDOM from 'react-dom/client';
// import App from './App';
//import './index.css';
// import {BrowserRouter} from 'react-router-dom';
// import { AuthProvider } from './context/AuthContext';
// import { WebSocketProvider } from './context/WebSocketContext';
// import { FirebaseProvider } from './context/FirebaseContext';
// import { ThemeProvider } from './context/ThemeContext';
// import { ToastContainer } from 'react-toastify';
// import 'react-toastify/dist/ReactToastify.css';
// import { QueryClient, QueryClientProvider } from 'react-query';
// import { RecoilRoot } from 'recoil';
// import { HelmetProvider } from 'react-helmet-async';
// import { supabase } from './supabaseClient';
// import { useAuth } from './hooks/useAuth';
// import { useFirebase } from './hooks/useFirebase';
// import { useWebSocket } from './hooks/useWebSocket';
// import { useTheme } from './hooks/useTheme';
// import { useToast } from './hooks/useToast';
// import { useQueryClient } from './hooks/useQueryClient';
// import { useRecoilState } from 'recoil';
// import { useHelmet } from './hooks/useHelmet';
// import { useHistory } from 'react-router-dom';
// import { useLocation } from 'react-router-dom';
// import { useParams } from 'react-router-dom';
// import { useNavigate } from 'react-router-dom';
// import { useMatch } from 'react-router-dom';
// import { useOutlet } from 'react-router-dom';
// import { useOutletContext } from 'react-router-dom';
// import { useSearchParams } from 'react-router-dom';
// import { useResolvedPath } from 'react-router-dom';
// import { useLinkClickHandler } from 'react-router-dom';