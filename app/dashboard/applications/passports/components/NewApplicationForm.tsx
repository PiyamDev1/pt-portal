import React from 'react'
import { PakApplicationFormData } from './types'
import type { PakApplicationFormErrors } from './schemas'

type Props = {
  formData: PakApplicationFormData
  isSubmitting: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  onSubmit: () => void
  errors?: PakApplicationFormErrors
}

export default function NewApplicationForm({ formData, isSubmitting, onChange, onBlur, onSubmit, errors = {} }: Props) {
  return (
    <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-md animate-fade-in-down">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-5">
           <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-2">Applicant Information</h4>
           <div>
             <input 
               name="applicantName" 
               onChange={onChange} 
               onBlur={onBlur} 
               value={formData.applicantName} 
               placeholder="Full Legal Name" 
               className="w-full p-2 bg-white border border-green-100 rounded-lg text-sm focus:ring-2 focus:ring-green-500" 
               aria-invalid={!!errors.applicantName}
               aria-describedby={errors.applicantName ? "applicantName-error" : undefined}
             />
             {errors.applicantName && (<p id="applicantName-error" className="text-red-600 text-xs mt-1" role="alert">{errors.applicantName}</p>)}
           </div>
           <div>
             <input 
               name="applicantCnic" 
               onChange={onChange} 
               onBlur={onBlur} 
               value={formData.applicantCnic} 
               placeholder="CNIC (Auto-formatted)" 
               className="w-full p-2 bg-white border border-green-100 rounded-lg text-sm font-mono focus:ring-2 focus:ring-green-500" 
               aria-invalid={!!errors.applicantCnic}
               aria-describedby={errors.applicantCnic ? "applicantCnic-error" : undefined}
             />
             {errors.applicantCnic && (<p id="applicantCnic-error" className="text-red-600 text-xs mt-1" role="alert">{errors.applicantCnic}</p>)}
           </div>
           <div>
             <input 
               name="applicantEmail" 
               onChange={onChange} 
               onBlur={onBlur} 
               value={formData.applicantEmail} 
               placeholder="Email Address" 
               className="w-full p-2 bg-white border border-green-100 rounded-lg text-sm focus:ring-2 focus:ring-green-500" 
               aria-invalid={!!errors.applicantEmail}
               aria-describedby={errors.applicantEmail ? "applicantEmail-error" : undefined}
             />
             {errors.applicantEmail && (<p id="applicantEmail-error" className="text-red-600 text-xs mt-1" role="alert">{errors.applicantEmail}</p>)}
           </div>
           <div>
             <input 
               name="familyHeadEmail" 
               onChange={onChange} 
               onBlur={onBlur} 
               value={formData.familyHeadEmail} 
               placeholder="Family Head Email (NADRA account)" 
               className="w-full p-2 bg-white border border-green-100 rounded-lg text-sm focus:ring-2 focus:ring-green-500" 
               aria-invalid={!!errors.familyHeadEmail}
               aria-describedby={errors.familyHeadEmail ? "familyHeadEmail-error" : undefined}
             />
             {errors.familyHeadEmail && (<p id="familyHeadEmail-error" className="text-red-600 text-xs mt-1" role="alert">{errors.familyHeadEmail}</p>)}
           </div>
           
           <div className="flex items-center gap-3 bg-green-50 p-3 rounded-lg border border-green-100 mt-2">
             <input type="checkbox" name="fingerprintsCompleted" checked={formData.fingerprintsCompleted} onChange={onChange} className="h-5 w-5 text-green-600 rounded focus:ring-green-500 cursor-pointer" id="fp_check" />
             <label htmlFor="fp_check" className="text-sm font-bold text-green-800 cursor-pointer">Biometrics Completed?</label>
           </div>
        </div>
        
        <div className="space-y-5">
           <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-2">Passport Specs</h4>
           <div className="grid grid-cols-2 gap-3">
             <select name="applicationType" onChange={onChange} className="p-2 bg-white border border-green-100 rounded-lg text-sm" value={formData.applicationType}><option value="First Time">First Time</option><option value="Renewal">Renewal</option><option value="Modification">Modification</option><option value="Lost">Lost</option></select>
             <select name="speed" onChange={onChange} className="p-2 bg-white border border-green-100 rounded-lg text-sm font-bold text-slate-700" value={formData.speed}><option value="Normal">Normal</option><option value="Executive">Executive</option></select>
             <select name="category" onChange={onChange} className="p-2 bg-white border border-green-100 rounded-lg text-sm" value={formData.category}><option value="Adult 10 Year">Adult 10 Year</option><option value="Adult 5 Year">Adult 5 Year</option><option value="Child 5 Year">Child 5 Year</option></select>
             <select name="pageCount" onChange={onChange} className="p-2 bg-white border border-green-100 rounded-lg text-sm" value={formData.pageCount}><option value="34 pages">34 pages</option><option value="54 pages">54 pages</option><option value="72 pages">72 pages</option><option value="100 pages">100 pages</option></select>
           </div>
           <input name="oldPassportNumber" onChange={onChange} onBlur={onBlur} value={formData.oldPassportNumber} placeholder="Old Passport #" className="w-full p-2 bg-white border border-green-100 rounded-lg text-sm font-mono uppercase" />
           <div>
             <input name="trackingNumber" onChange={onChange} onBlur={onBlur} value={formData.trackingNumber} placeholder="Tracking ID (Required)" className="w-full p-2 bg-white border border-green-100 rounded-lg text-sm font-mono uppercase font-bold text-slate-700" />
             {errors.trackingNumber && (<p className="text-red-600 text-xs mt-1">{errors.trackingNumber}</p>)}
           </div>
        </div>
      </div>
      <button type="button" onClick={onSubmit} disabled={isSubmitting} className="w-full mt-6 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition shadow">
         {isSubmitting ? 'Saving Application...' : 'Save Application to Ledger'}
      </button>
    </div>
  )
}
