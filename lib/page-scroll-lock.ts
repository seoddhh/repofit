let locks = 0;
let restore: (() => void) | null = null;

export function lockPageScroll() {
  if (locks++ === 0) {
    const root = document.documentElement;
    const body = document.body;
    const x = window.scrollX;
    const y = window.scrollY;
    const previousRoot = { overflow: root.style.overflow, overscrollBehavior: root.style.overscrollBehavior };
    const previousBody = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow };
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    Object.assign(body.style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden' });
    restore = () => {
      Object.assign(body.style, previousBody);
      Object.assign(root.style, previousRoot);
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) { restore?.(); restore = null; }
  };
}
