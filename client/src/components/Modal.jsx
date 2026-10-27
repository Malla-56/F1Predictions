import useDialog from './useDialog';

// Accessible modal shell: role="dialog", aria-modal, Escape to close,
// focus moved in on open and restored on close. Pass `labelledBy` with the
// id of the element that titles the dialog.
export default function Modal({ onClose, labelledBy, className = 'modal', style, bgClassName = 'modal-bg', children }) {
  const dlg = useDialog(onClose);
  return (
    <div className={bgClassName} onClick={onClose}>
      <div
        className={className}
        style={style}
        onClick={e => e.stopPropagation()}
        {...dlg.props}
        aria-labelledby={labelledBy || undefined}
      >
        {children}
      </div>
    </div>
  );
}
