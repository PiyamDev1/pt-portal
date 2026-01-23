'use client'
import { useState, useEffect } from 'react'
import { X, Search, UserPlus, Calendar, PoundSterling, Clock, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function NewLoanModal({ isOpen, onClose, onSave, currentUserId }: any) {
  const [step, setStep] = useState(1) // 1: Customer, 2: Loan Details
  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)

  // Form State
  const [newCustomer, setNewCustomer] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '' })
  const [loanDetails, setLoanDetails] = useState({ amount: '', term: '12', startDate: '' })

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setMode('search')
      setSearchQuery('')
      setSelectedCustomer(null)
      setNewCustomer({ firstName: '', lastName: '', phone: '', email: '', address: '' })
      setLoanDetails({ amount: '', term: '12', startDate: new Date().toISOString().split('T')[0] })
    }
  }, [isOpen])

  // Live Search
  useEffect(() => {
    if (mode === 'search' && searchQuery.length > 1) {
      const timer = setTimeout(() => {
        fetch(`/api/lms/customers/search?q=${searchQuery}`)
          .then(res => res.json())
          .then(data => setSearchResults(data.results || []))
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setSearchResults([])
    }
  }, [searchQuery, mode])

  const handleNext = () => {
    if (mode === 'search' && !selectedCustomer) return toast.error("Select a customer")
    if (mode === 'create' && (!newCustomer.firstName || !newCustomer.lastName)) return toast.error("Name required")
    setStep(2)
  }

  const handleSubmit = async () => {
    if (!loanDetails.amount || !loanDetails.startDate) return toast.error("Loan details incomplete")
    
    setIsSubmitting(true)
    try {
      const payload = {
        customerId: selectedCustomer?.id || null, // Null if creating new
        customerDetails: mode === 'create' ? newCustomer : null,
        loanAmount: loanDetails.amount,
        termMonths: loanDetails.term,
        firstDueDate: loanDetails.startDate,
        currentUserId
      }

      const res = await fetch('/api/lms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error("Failed to create loan")
      
      toast.success("Loan Issued Successfully")
      onSave() // Refresh dashboard
      onClose()
    } catch (e) {
      toast.error("Error issuing loan")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">Issue New Loan</h3>
            <p className="text-slate-400 text-xs">Step {step} of 2: {step === 1 ? 'Borrower' : 'Terms'}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 hover:text-slate-300" /></button>
        </div>

        <div className="p-6 overflow-y-auto">
          
          {/* STEP 1: CUSTOMER SELECTION */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Toggle Mode */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => { setMode('search'); setSelectedCustomer(null); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'search' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                >
                  Find Existing
                </button>
                <button 
                  onClick={() => { setMode('create'); setSelectedCustomer(null); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'create' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
                >
                  Create New
                </button>
              </div>

              {mode === 'search' ? (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input 
                      placeholder="Search name or phone..."
                      className="w-full pl-10 p-3 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {searchResults.map((cust: any) => (
                      <div 
                        key={cust.id}
                        onClick={() => setSelectedCustomer(cust)}
                        className={`p-3 rounded-lg border cursor-pointer flex justify-between items-center ${selectedCustomer?.id === cust.id ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}
                      >
                        <div>
                          <div className="font-bold text-slate-700">{cust.first_name} {cust.last_name}</div>
                          <div className="text-xs text-slate-500">{cust.phone_number} • {cust.address || 'No Address'}</div>
                        </div>
                        {selectedCustomer?.id === cust.id && <Check className="w-5 h-5 text-blue-600" />}
                      </div>
                    ))}
                    {searchQuery.length > 1 && searchResults.length === 0 && (
                      <div className="text-center py-4 text-slate-400 text-sm">No customers found. Try creating new.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 animate-in slide-in-from-right-4">
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      placeholder="First Name *"
                      className="p-3 border rounded-lg text-sm bg-slate-50"
                      value={newCustomer.firstName}
                      onChange={e => setNewCustomer({...newCustomer, firstName: e.target.value})}
                    />
                    <input 
                      placeholder="Last Name *"
                      className="p-3 border rounded-lg text-sm bg-slate-50"
                      value={newCustomer.lastName}
                      onChange={e => setNewCustomer({...newCustomer, lastName: e.target.value})}
                    />
                  </div>
                  <input 
                    placeholder="Phone Number"
                    className="w-full p-3 border rounded-lg text-sm bg-slate-50"
                    value={newCustomer.phone}
                    onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  />
                  <input 
                    placeholder="Address (Optional)"
                    className="w-full p-3 border rounded-lg text-sm bg-slate-50"
                    value={newCustomer.address}
                    onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 2: LOAN TERMS */}
          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="bg-blue-50 p-4 rounded-lg flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-blue-500 font-bold uppercase">Borrower</div>
                  <div className="font-semibold text-blue-900">
                    {mode === 'search' ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : `${newCustomer.firstName} ${newCustomer.lastName}`}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Loan Amount</label>
                  <div className="relative">
                    <PoundSterling className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input 
                      type="number"
                      className="w-full pl-10 p-3 border rounded-lg text-lg font-bold text-slate-800"
                      placeholder="0.00"
                      value={loanDetails.amount}
                      onChange={e => setLoanDetails({...loanDetails, amount: e.target.value})}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Term (Months)</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input 
                        type="number"
                        className="w-full pl-10 p-3 border rounded-lg"
                        value={loanDetails.term}
                        onChange={e => setLoanDetails({...loanDetails, term: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">First Payment</label>
                    <div className="relative">
                      <input 
                        type="date"
                        className="w-full p-3 border rounded-lg text-sm"
                        value={loanDetails.startDate}
                        onChange={e => setLoanDetails({...loanDetails, startDate: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex justify-between bg-slate-50">
          {step === 2 ? (
            <button onClick={() => setStep(1)} className="text-slate-500 hover:text-slate-700 text-sm font-medium">Back</button>
          ) : (
            <div />
          )}
          
          <button 
            onClick={step === 1 ? handleNext : handleSubmit}
            disabled={isSubmitting}
            className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-black transition-colors flex items-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (step === 1 ? 'Next Step' : 'Confirm & Issue')}
          </button>
        </div>

      </div>
    </div>
  )
}
