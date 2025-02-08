import { createPortal } from "react-dom";

interface AlertProps {
  message: string
  onClose: () => void
}

const Alert: React.FC<AlertProps> = ({ message, onClose }) => {
  const handleOutsideClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).id === 'alert-modal-overlay') {
      onClose()
    }
  }

  return createPortal(
    <div
      id="alert-modal-overlay"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleOutsideClick}
    >
      <div
        className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6 relative border-2 border-[#c14420]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <p className="text-black">{message}</p>
        </div>
        <button
          className="absolute top-1 right-3 text-black hover:text-black text-3xl"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>,
    document.getElementById('root')!
  )
}

export default Alert
