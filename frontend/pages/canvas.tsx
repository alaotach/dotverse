import { useEffect } from 'react';
import Canvas from '../components/Canvas';
import Head from 'next/head';
import { useAuth } from '../src/context/AuthContext';
import '../src/services/debugTools';

export default function CanvasPage() {
  const { currentUser } = useAuth();
  
  useEffect(() => {
    const checkCanvasLoading = () => {
      const loadingStartTime = parseInt(sessionStorage.getItem('canvas_loading_start') || '0', 10);
      const now = Date.now();
      
      if (loadingStartTime > 0 && now - loadingStartTime > 10000) {
        console.warn("Canvas loading timeout detected");
        
        const recoveryDiv = document.createElement('div');
        recoveryDiv.style.position = 'fixed';
        recoveryDiv.style.bottom = '20px';
        recoveryDiv.style.right = '20px';
        recoveryDiv.style.background = 'white';
        recoveryDiv.style.padding = '10px';
        recoveryDiv.style.borderRadius = '5px';
        recoveryDiv.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
        recoveryDiv.style.zIndex = '9999';
        
        recoveryDiv.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 8px;">Canvas taking too long to load</div>
          <button id="forceInitBtn" style="background: #3b82f6; color: white; padding: 5px 10px; border-radius: 4px; margin-right: 10px;">
            Force Load Empty Canvas
          </button>
          <button id="diagBtn" style="background: #9ca3af; color: white; padding: 5px 10px; border-radius: 4px;">
            Run Diagnostics
          </button>
        `;
        
        document.body.appendChild(recoveryDiv);
        
        document.getElementById('forceInitBtn')?.addEventListener('click', () => {
          if ((window as any).dotVerseDebug) {
            (window as any).dotVerseDebug.forceInitializeCanvas();
          } else {
            window.location.reload();
          }
        });
        
        document.getElementById('diagBtn')?.addEventListener('click', () => {
          if ((window as any).dotVerseDebug) {
            (window as any).dotVerseDebug.diagnoseCanvasIssues();
          } else {
            console.log("Debug tools not available");
          }
        });
      }
    };
    
    if (!sessionStorage.getItem('canvas_loading_start')) {
      sessionStorage.setItem('canvas_loading_start', Date.now().toString());
    }
    
    const timer = setTimeout(checkCanvasLoading, 10000);
    
    return () => {
      clearTimeout(timer);
      sessionStorage.removeItem('canvas_loading_start');
    };
  }, []);

  return (
    <>
      <Head>
        <title>dotVerse Canvas</title>
        <meta name="description" content="Interactive canvas for the dotVerse platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
      </Head>
      <Canvas />
    </>
  );
}
