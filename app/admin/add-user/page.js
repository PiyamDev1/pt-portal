'use client'; // <--- THIS IS MANDATORY IN APP ROUTER

import { useState } from 'react';

export default function AddEmployeePage() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role_id: '',
    department_id: '',
    location_id: ''
  });

  // ROLES (Your UUIDs)
  const ROLES = [
    { name: 'Master Admin', id: 'd7e3d962-04f2-43b7-bd8d-ded251965722' },
    { name: 'Manager',      id: '97184214-c91f-484c-8fc2-33d052dd9587' },
    { name: 'Agent',        id: '6e19605f-51d8-47a6-a79d-2b5e50340560' },
  ];

  // DEPARTMENTS (Your UUIDs)
  const DEPARTMENTS = [
    { name: 'Admin',        id: '223d035e-a118-43b3-9f57-a349fb3d8a24' },
    { name: 'Accounts',     id: 'df79e53b-5b62-49ed-9e4c-fdbb18903e2a' },
    { name: 'Ticketing',    id: 'e0457bda-8cf5-46db-9fc8-ef3c9da16cab' },
    { name: 'Applications', id: 'b3416116-7ab1-419b-baf1-613384b8e716' },
    { name: 'HR',           id: '52468e52-ebc6-4967-9c5d-3584ff88693d' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/admin/add-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      setLoading(false);

      if (res.ok) {
        alert('Success! User has been created.');
        setFormData({ firstName: '', lastName: '', email: '', role_id: '', department_id: '', location_id: '' });
      } else {
        alert('Error: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      setLoading(false);
      alert('Network Error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">Add New Employee</h1>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input 
                value={formData.firstName}
                onChange={e => setFormData({...formData, firstName: e.target.value})}
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input 
                value={formData.lastName}
                onChange={e => setFormData({...formData, lastName: e.target.value})}
                className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input 
              type="email" 
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select 
                value={formData.role_id}
                onChange={e => setFormData({...formData, role_id: e.target.value})}
                className="w-full border border-gray-300 p-2 rounded bg-white"
                required
              >
                <option value="">Select Role...</option>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select 
                value={formData.department_id}
                onChange={e => setFormData({...formData, department_id: e.target.value})}
                className="w-full border border-gray-300 p-2 rounded bg-white"
                required
              >
                <option value="">Select Department...</option>
                {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className={`w-full text-white p-3 rounded font-medium transition-colors ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Processing...' : 'Create User'}
          </button>
        </form>
      </div>
    </div>
  );
}