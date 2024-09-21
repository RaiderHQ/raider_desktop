interface ContentAreaProps {
  children: React.ReactNode
}

const ContentArea: React.FC<ContentAreaProps> = ({ children }): JSX.Element => {
  return (
    <div className="relative flex flex-col items-center justify-center w-3/4">
      <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
      <div className="relative flex flex-col border border-black p-8 rounded-lg bg-white z-10 w-full">
        {children}
      </div>
    </div>
  )
}

export default ContentArea
