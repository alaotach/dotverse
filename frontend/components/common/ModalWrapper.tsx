import React, { useEffect, useRef } from 'react';

interface ModalWrapperProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  preventClose?: boolean;
}

const ModalWrapper: React.FC<ModalWrapperProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
  preventClose = false
}) => {
  const backdropRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
      const viewport = document.querySelector('meta[name=viewport]');
      const originalContent = viewport?.getAttribute('content') || '';
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      }
      
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.classList.remove('modal-open');
        document.body.style.overflow = originalOverflow;
        if (viewport) {
          viewport.setAttribute('content', originalContent);
        }
      };
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (preventClose) return;
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleBackdropTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (preventClose) return;
    if (e.target === e.currentTarget) {
      e.preventDefault();
    }
  };

  const handleBackdropTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (preventClose) return;
    if (e.target === e.currentTarget) {
      e.preventDefault();
      onClose();
    }
  };

  const handleModalContentTouch = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleModalContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={backdropRef}
      className="modal-backdrop ui-overlay modal-wrapper"
      onClick={handleBackdropClick}
      onTouchStart={handleBackdropTouchStart}
      onTouchEnd={handleBackdropTouchEnd}
      onTouchMove={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'manipulation',
        pointerEvents: 'auto'
      }}
    >
      <div 
        ref={modalContentRef}
        className={`modal-content ui-element ${className}`}
        onClick={handleModalContentClick}
        onTouchStart={handleModalContentTouch}
        onTouchEnd={handleModalContentTouch}
        onTouchMove={handleModalContentTouch}
        style={{
          touchAction: 'manipulation',
          pointerEvents: 'auto'
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ModalWrapper;