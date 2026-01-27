'use client'

import { X } from 'lucide-react'
import { ReactNode } from 'react'

export default function ModalWrapper({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close modal"><X className="w-5 h-5 hover:text-slate-300" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
