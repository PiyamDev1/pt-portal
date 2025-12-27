import React from 'react'

export default function MiniTracking({ steps, currentStep }: { steps: any[], currentStep: number }) {
  return (
    <div className="flex flex-col space-y-1">
      {steps.map((step: any, idx: number) => (
        <div key={idx} className="flex items-center space-x-2">
          <div className={`w-1.5 h-1.5 rounded-full ${idx <= currentStep ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
          <span className={`text-[10px] uppercase tracking-wider ${idx <= currentStep ? 'text-gray-700 font-semibold' : 'text-gray-400'}`}>
            {step.status}
          </span>
        </div>
      ))}
    </div>
  )
}
