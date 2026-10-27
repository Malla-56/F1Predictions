import { useEffect, useId, useRef } from 'react';

// Shared modal behaviour: Escape closes, focus moves into the dialog on open
// and returns to the previously focused element on close.
// Usage: const dlg = useDialog(onClose);
//   <div className="modal" {...dlg.props}> <h3 id={dlg.titleId}>…</h3>
export default function useDialog(onClose) {
  const ref = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Captured during the first render, before any autoFocus inside the dialog runs.
  const openerRef = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  useEffect(() => {
    const prev = openerRef.current;
    // Respect autoFocus on an inner field; otherwise focus the dialog itself.
    if (ref.current && !ref.current.contains(document.activeElement)) {
      ref.current.focus({ preventScroll: true });
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current?.();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus({ preventScroll: true });
      }
    };
  }, []);

  return {
    titleId,
    props: {
      ref,
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': titleId,
      tabIndex: -1,
    },
  };
}

// Keyboard activation for non-button clickable elements (role="button").
export function onActivate(fn) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn(e);
    }
  };
}
