import ReactDOM from 'react-dom'

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
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleOutsideClick}
    >
      <div
        className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b pb-2 mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>

        <div className="mb-4">
          <p className="text-gray-700">{message}</p>
        </div>
        <button
          className="absolute top-2 right-3 text-gray-600 hover:text-black text-3xl"
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

export default InformationModal
