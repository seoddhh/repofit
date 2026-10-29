'use client';
import { useEffect, type RefObject } from 'react';
import { lockPageScroll } from '@/lib/page-scroll-lock';

export function useModalDialog(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const unlock = lockPageScroll();
    try { dialog.showModal(); } catch (error) { unlock(); throw error; }
    return () => { dialog.close(); unlock(); };
  }, [ref]);
}
