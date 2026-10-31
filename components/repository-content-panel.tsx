'use client';
import { useEffect, useRef, type ReactNode } from 'react';

export function RepositoryContentPanel({ children }: { children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const thumb = thumbRef.current;
    if (!panel || !viewport || !content || !thumb) return;
    let frame = 0;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    function update() {
      frame = 0;
      if (!panel || !viewport || !thumb) return;
      const { clientHeight, scrollHeight, scrollTop } = viewport;
      const range = scrollHeight - clientHeight;
      const scrollable = range > 1 && getComputedStyle(viewport).overflowY === 'auto';
      panel.dataset.overflow = String(scrollable);
      panel.dataset.more = String(scrollable && range - scrollTop > 1);
      if (!scrollable) {
        delete panel.dataset.scrolling;
        return;
      }
      const trackHeight = Math.max(0, clientHeight - 28);
      const height = Math.min(trackHeight, Math.max(24, trackHeight * clientHeight / scrollHeight));
      const progress = Math.max(0, Math.min(1, scrollTop / range));
      thumb.style.height = `${height}px`;
      thumb.style.transform = `translateY(${progress * (trackHeight - height)}px)`;
    }

    function scheduleUpdate() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    function onScroll() {
      if (!panel) return;
      panel.dataset.scrolling = 'true';
      scheduleUpdate();
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { delete panel.dataset.scrolling; }, 1000);
    }

    // Observe asynchronous content, tab changes and viewport resizing without React renders.
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(viewport);
    observer.observe(content);
    viewport.addEventListener('scroll', onScroll, { passive: true });
    scheduleUpdate();
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
    };
  }, []);

  return <div ref={panelRef} className="trending-explanation-panel">
    <div ref={viewportRef} className="trending-explanation" role="region" aria-label="오픈소스 상세 설명" tabIndex={0}>
      <div ref={contentRef}>{children}</div>
    </div>
    <div className="trending-scroll-indicator" aria-hidden="true"><div ref={thumbRef} className="trending-scroll-thumb"/></div>
    <div className="trending-scroll-fade" aria-hidden="true"/>
  </div>;
}
