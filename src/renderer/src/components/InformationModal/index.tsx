import ReactDOM from 'react-dom'
import Logo from '@components/Logo'

interface ModalProps {
  title: string
  message: string
  onClose: () => void
}

const InformationModal: React.FC<ModalProps> = ({ title, message, onClose }): JSX.Element => {
  const handleOutsideClick = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).id === 'modal-overlay') {
      onClose()
    }
  }

  return ReactDOM.createPortal(
    <div
      id="modal-overlay"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleOutsideClick}
    >
      <div
        className="bg-white rounded-xl shadow-elevated max-w-lg w-full p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-neutral-bdr pb-3 mb-4">
          <Logo size={28} />
          <h2 className="text-lg font-semibold text-neutral-dark">{title}</h2>
        </div>

        <div className="mb-4">
          <p className="text-neutral-dk whitespace-pre-wrap">{message}</p>
        </div>
        <button
          className="absolute top-3 right-4 text-neutral-mid hover:text-neutral-dark transition-colors"
          onClick={onClose}
          aria-label="Close"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>,
    document.getElementById('root')!
  )
}

export default InformationModal
