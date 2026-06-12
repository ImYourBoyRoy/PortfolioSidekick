// ./sidekick/src/app/hooks/domains/useSidekickShell.js
/**
 * Shell / navigation domain — tabs, toasts, accessibility zoom, global loading flag.
 * Created by: Roy Dawson IV
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { localDb } from '../../../serverless';

export function useSidekickShell() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef(new Map());

  const [isCoachMode, setIsCoachMode] = useState(true);
  const [showManualAdjust, setShowManualAdjust] = useState(false);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [modalProfileName, setModalProfileName] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [catalystModalOpen, setCatalystModalOpen] = useState(false);
  const [predictionTab, setPredictionTab] = useState('viability');
  const [isDnaOpen, setIsDnaOpen] = useState(false);
  const [coachTimeFilter, setCoachTimeFilter] = useState('all');

  const [fontSizeOffset, setFontSizeOffset] = useState(() => {
    const saved = localDb.getSettings();
    return saved.fontSize || 0;
  });
  const highContrast = true;
  const fontSizeOffsetRef = useRef(fontSizeOffset);

  useEffect(() => {
    fontSizeOffsetRef.current = fontSizeOffset;
  }, [fontSizeOffset]);

  useEffect(() => {
    const root = document.documentElement;
    const scale = 1 + fontSizeOffset * 0.05;
    root.style.setProperty('--font-size-offset', `${fontSizeOffset}px`);
    root.style.setProperty('--font-size-scale', `${scale}`);
    root.style.zoom = scale;
    if (highContrast) root.classList.add('high-contrast');
    else root.classList.remove('high-contrast');
    localDb.saveSettings({ fontSize: fontSizeOffset, highContrast: true });
  }, [fontSizeOffset, highContrast]);

  const adjustFontSize = useCallback((direction) => {
    setFontSizeOffset((prev) => {
      const next = prev + direction;
      return Math.max(-3, Math.min(5, next));
    });
  }, []);

  const zoomScale = useMemo(() => 1 + fontSizeOffset * 0.05, [fontSizeOffset]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      const hasCtrl = e.ctrlKey || e.metaKey;

      if (hasCtrl) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          adjustFontSize(1);
        } else if (e.key === '-') {
          e.preventDefault();
          adjustFontSize(-1);
        } else if (e.key === '0') {
          e.preventDefault();
          setFontSizeOffset(0);
        }
      } else if (!isInput) {
        if (e.key === '+') adjustFontSize(1);
        else if (e.key === '-') adjustFontSize(-1);
        else if (e.key === '0' || e.key.toLowerCase() === 'r') setFontSizeOffset(0);
      }
    };

    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        adjustFontSize(e.deltaY < 0 ? 1 : -1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });

    let pinchStart = null;
    const pinchDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchStart = { dist: pinchDist(e.touches), offset: fontSizeOffsetRef.current };
      }
    };
    const onTouchMove = (e) => {
      if (!pinchStart || e.touches.length !== 2) return;
      const ratio = pinchDist(e.touches) / pinchStart.dist;
      const delta = Math.round((ratio - 1) * 8);
      const next = Math.max(-3, Math.min(5, pinchStart.offset + delta));
      if (next !== fontSizeOffsetRef.current) {
        e.preventDefault();
        setFontSizeOffset(next);
      }
    };
    const onTouchEnd = () => { pinchStart = null; };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [adjustFontSize]);

  const showToast = useCallback((message, type = 'info', duration = 4500) => {
    const toastTypes = new Set(['info', 'success', 'warning', 'error']);
    let resolvedMessage = message;
    let resolvedType = type;
    let resolvedDuration = duration;
    if (toastTypes.has(String(message)) && typeof type === 'string' && !toastTypes.has(String(type))) {
      resolvedType = message;
      resolvedMessage = type;
      resolvedDuration = typeof duration === 'number' ? duration : 4500;
    }
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message: resolvedMessage, type: resolvedType, duration: resolvedDuration }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimersRef.current.delete(id);
    }, resolvedDuration);
    toastTimersRef.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => () => {
    for (const timer of toastTimersRef.current.values()) clearTimeout(timer);
    toastTimersRef.current.clear();
  }, []);

  return useMemo(() => ({
    activeTab,
    setActiveTab,
    loading,
    setLoading,
    toasts,
    showToast,
    dismissToast,
    isCoachMode,
    setIsCoachMode,
    showManualAdjust,
    setShowManualAdjust,
    isProfileModalOpen,
    setIsProfileModalOpen,
    modalProfileName,
    setModalProfileName,
    isImportOpen,
    setIsImportOpen,
    catalystModalOpen,
    setCatalystModalOpen,
    predictionTab,
    setPredictionTab,
    isDnaOpen,
    setIsDnaOpen,
    coachTimeFilter,
    setCoachTimeFilter,
    fontSizeOffset,
    setFontSizeOffset,
    adjustFontSize,
    zoomScale,
    highContrast,
    toastTimersRef,
  }), [
    activeTab, loading, toasts, isCoachMode, showManualAdjust,
    isProfileModalOpen, modalProfileName, isImportOpen, catalystModalOpen,
    predictionTab, isDnaOpen, coachTimeFilter, fontSizeOffset,
    showToast, dismissToast, adjustFontSize, zoomScale, highContrast,
  ]);
}
