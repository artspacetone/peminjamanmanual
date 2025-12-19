import React, { useState, useEffect, useRef } from 'react';
import { AudioPresets } from '../services/audioService';
import { apiService, inventoryApi, loanApi, borrowerApi } from '../services/apiService';
import { InventoryItem, Borrower, LoanTransaction } from '../types/index.ts';

interface LoanSystemProps {
  onClose?: () => void;
}

const LoanSystem: React.FC<LoanSystemProps> = ({ onClose }) => {
  // State Management
  const [step, setStep] = useState<'select-borrower' | 'select-items' | 'confirm'>('select-borrower');
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
  const [availableItems, setAvailableItems] = useState<InventoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [programName, setProgramName] = useState('');
  const [loanReason, setLoanReason] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [signature, setSignature] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeLoans, setActiveLoans] = useState<LoanTransaction[]>([]);
  const [showNewBorrowerForm, setShowNewBorrowerForm] = useState(false);
  const [newBorrower, setNewBorrower] = useState({
    nik: '',
    name: '',
    phone: '',
    position: ''
  });

  // Refs
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Load initial data
  useEffect(() => {
    loadBorrowers();
    loadAvailableItems();
    loadActiveLoans();
  }, []);

  // Load borrowers
  const loadBorrowers = async () => {
    try {
      const response = await borrowerApi.getBorrowers();
      if (response.success) {
        setBorrowers(response.data);
      }
    } catch (error) {
      console.error('Failed to load borrowers:', error);
    }
  };

  // Load available items
  const loadAvailableItems = async () => {
    try {
      const response = await inventoryApi.getItems('', 100);
      if (response.success) {
        // Filter only available items
        const available = response.data.filter((item: InventoryItem) => 
          item.status === 'Available'
        );
        setAvailableItems(available);
      }
    } catch (error) {
      console.error('Failed to load items:', error);
    }
  };

  // Load active loans
  const loadActiveLoans = async () => {
    try {
      const response = await loanApi.getActiveLoans();
      if (response.success) {
        setActiveLoans(response.data);
      }
    } catch (error) {
      console.error('Failed to load active loans:', error);
    }
  };

  // Handle borrower selection
  const handleSelectBorrower = (borrower: Borrower) => {
    setSelectedBorrower(borrower);
    AudioPresets.BUTTON_CLICK();
  };

  // Handle item selection
  const handleSelectItem = (item: InventoryItem) => {
    const isSelected = selectedItems.some(selected => selected.barcode === item.barcode);
    
    if (isSelected) {
      setSelectedItems(selectedItems.filter(selected => selected.barcode !== item.barcode));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
    
    AudioPresets.BUTTON_CLICK();
  };

  // Handle new borrower submission
  const handleNewBorrowerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsLoading(true);
      const response = await borrowerApi.upsertBorrower(newBorrower);
      
      if (response.success) {
        await loadBorrowers();
        setShowNewBorrowerForm(false);
        setNewBorrower({ nik: '', name: '', phone: '', position: '' });
        AudioPresets.UPLOAD_COMPLETE();
        alert('Borrower added successfully!');
      }
    } catch (error) {
      console.error('Failed to add borrower:', error);
      AudioPresets.ITEM_NOT_FOUND();
      alert('Failed to add borrower. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle signature drawing
  const startDrawing = (e: React.MouseEvent) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    setSignature(canvas.toDataURL());
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature('');
  };

  // Handle loan submission
  const handleSubmitLoan = async () => {
    if (!selectedBorrower) {
      alert('Please select a borrower');
      return;
    }

    if (selectedItems.length === 0) {
      alert('Please select at least one item');
      return;
    }

    if (!programName.trim()) {
      alert('Please enter program name');
      return;
    }

    if (!dueDate) {
      alert('Please select due date');
      return;
    }

    if (!signature) {
      alert('Please provide signature');
      return;
    }

    const confirmLoan = window.confirm(
      `Create loan for ${selectedBorrower.name}?\n\nItems: ${selectedItems.length}\nDue Date: ${new Date(dueDate).toLocaleDateString('id-ID')}`
    );

    if (!confirmLoan) return;

    setIsLoading(true);

    try {
      const loanData = {
        borrower_id: selectedBorrower.id,
        borrower_name: selectedBorrower.name,
        inputter_name: 'Admin', // Change this to actual user
        program_name: programName,
        loan_reason: loanReason,
        due_date: dueDate,
        signature_base64: signature,
        items: selectedItems.map(item => item.barcode)
      };

      const response = await loanApi.createLoan(loanData);
      
      if (response.success) {
        AudioPresets.UPLOAD_COMPLETE();
        
        // Reset form
        setSelectedBorrower(null);
        setSelectedItems([]);
        setProgramName('');
        setLoanReason('');
        setDueDate('');
        setSignature('');
        clearSignature();
        setStep('select-borrower');
        
        // Reload data
        await loadAvailableItems();
        await loadActiveLoans();
        
        alert(`Loan created successfully!\nInvoice Number: ${response.invoice_no}`);
        
        if (onClose) onClose();
      }
    } catch (error) {
      console.error('Failed to create loan:', error);
      AudioPresets.ITEM_NOT_FOUND();
      alert('Failed to create loan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle return item
  const handleReturnItem = async (barcode: string) => {
    const confirmReturn = window.confirm('Return this item?');
    if (!confirmReturn) return;

    try {
      const response = await loanApi.returnItem(barcode, 'Admin');
      
      if (response.success) {
        AudioPresets.ITEM_FOUND();
        await loadAvailableItems();
        await loadActiveLoans();
        alert('Item returned successfully!');
      }
    } catch (error) {
      console.error('Failed to return item:', error);
      AudioPresets.ITEM_NOT_FOUND();
      alert('Failed to return item. Please try again.');
    }
  };

  // Filter items based on search
  const filteredItems = availableItems.filter(item =>
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.brand?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Loan Management System</h2>
              <p className="text-blue-100">Manage item loans and returns</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-blue-700 rounded-full transition-colors"
            >
              <i className="fa-solid fa-times text-xl"></i>
            </button>
          </div>
          
          {/* Steps Indicator */}
          <div className="flex mt-6">
            <div 
              className={`flex-1 text-center py-2 ${step === 'select-borrower' ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'} rounded-l-lg`}
            >
              1. Select Borrower
            </div>
            <div 
              className={`flex-1 text-center py-2 ${step === 'select-items' ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'}`}
            >
              2. Select Items
            </div>
            <div 
              className={`flex-1 text-center py-2 ${step === 'confirm' ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'} rounded-r-lg`}
            >
              3. Confirm Loan
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Step 1: Select Borrower */}
          {step === 'select-borrower' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Borrowers List */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">Select Borrower</h3>
                  
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {borrowers.map(borrower => (
                      <div
                        key={borrower.id}
                        onClick={() => handleSelectBorrower(borrower)}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          selectedBorrower?.id === borrower.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="font-bold text-gray-800">{borrower.name}</h4>
                            <p className="text-sm text-gray-600">NIK: {borrower.nik}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">{borrower.position}</p>
                            <p className="text-sm text-gray-600">{borrower.phone}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button
                    onClick={() => setShowNewBorrowerForm(true)}
                    className="w-full mt-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-plus"></i>
                    Add New Borrower
                  </button>
                </div>

                {/* Selected Borrower & New Borrower Form */}
                <div className="space-y-6">
                  {/* Selected Borrower */}
                  {selectedBorrower && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <h3 className="text-lg font-bold text-green-800 mb-2">Selected Borrower</h3>
                      <div className="space-y-2">
                        <p><strong>Name:</strong> {selectedBorrower.name}</p>
                        <p><strong>NIK:</strong> {selectedBorrower.nik}</p>
                        <p><strong>Position:</strong> {selectedBorrower.position}</p>
                        <p><strong>Phone:</strong> {selectedBorrower.phone}</p>
                      </div>
                      <button
                        onClick={() => setStep('select-items')}
                        className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
                      >
                        Next: Select Items <i className="fa-solid fa-arrow-right ml-2"></i>
                      </button>
                    </div>
                  )}

                  {/* New Borrower Form */}
                  {showNewBorrowerForm && (
                    <div className="bg-white border border-gray-300 rounded-xl p-4">
                      <h3 className="text-lg font-bold text-gray-800 mb-4">Add New Borrower</h3>
                      <form onSubmit={handleNewBorrowerSubmit}>
                        <div className="space-y-3">
                          <input
                            type="text"
                            placeholder="NIK"
                            value={newBorrower.nik}
                            onChange={(e) => setNewBorrower({...newBorrower, nik: e.target.value})}
                            className="w-full p-3 border border-gray-300 rounded-lg"
                            required
                          />
                          <input
                            type="text"
                            placeholder="Full Name"
                            value={newBorrower.name}
                            onChange={(e) => setNewBorrower({...newBorrower, name: e.target.value})}
                            className="w-full p-3 border border-gray-300 rounded-lg"
                            required
                          />
                          <input
                            type="tel"
                            placeholder="Phone Number"
                            value={newBorrower.phone}
                            onChange={(e) => setNewBorrower({...newBorrower, phone: e.target.value})}
                            className="w-full p-3 border border-gray-300 rounded-lg"
                            required
                          />
                          <input
                            type="text"
                            placeholder="Position"
                            value={newBorrower.position}
                            onChange={(e) => setNewBorrower({...newBorrower, position: e.target.value})}
                            className="w-full p-3 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                          >
                            {isLoading ? 'Saving...' : 'Save Borrower'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowNewBorrowerForm(false)}
                            className="px-4 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Loans */}
              {activeLoans.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <h3 className="text-lg font-bold text-yellow-800 mb-3">Active Loans</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {activeLoans.map(loan => (
                      <div key={loan.id} className="bg-white p-3 rounded-lg border border-yellow-300">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-bold text-gray-800">
                              {loan.borrower_name} - {loan.invoice_no}
                            </p>
                            <p className="text-sm text-gray-600">
                              Due: {new Date(loan.due_date).toLocaleDateString('id-ID')}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              // Navigate to return view
                              setSelectedBorrower({id: loan.borrower_id, name: loan.borrower_name} as Borrower);
                              setStep('select-items');
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                          >
                            View/Return
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Items */}
          {step === 'select-items' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Available Items */}
                <div className="lg:col-span-2 bg-gray-50 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800">Available Items</h3>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search items..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg w-64"
                      />
                      <span className="text-sm text-gray-600">
                        {filteredItems.length} items
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                    {filteredItems.map(item => (
                      <div
                        key={item.barcode}
                        onClick={() => handleSelectItem(item)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedItems.some(selected => selected.barcode === item.barcode)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-gray-800">{item.item_name}</h4>
                            <p className="text-sm text-gray-600">Barcode: {item.barcode}</p>
                            <p className="text-sm text-gray-600">Brand: {item.brand || '-'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-blue-600">
                              {new Intl.NumberFormat('id-ID', {
                                style: 'currency',
                                currency: 'IDR',
                                minimumFractionDigits: 0
                              }).format(item.price)}
                            </p>
                            <p className="text-sm text-gray-600">{item.size} | {item.color}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selected Items */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="text-lg font-bold text-blue-800 mb-4">
                    Selected Items ({selectedItems.length})
                  </h3>
                  
                  {selectedItems.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No items selected yet
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {selectedItems.map(item => (
                        <div key={item.barcode} className="bg-white p-3 rounded-lg border border-blue-300">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-gray-800">{item.item_name}</p>
                              <p className="text-sm text-gray-600">{item.barcode}</p>
                            </div>
                            <button
                              onClick={() => handleSelectItem(item)}
                              className="p-1 text-red-600 hover:text-red-800"
                            >
                              <i className="fa-solid fa-times"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-6 space-y-3">
                    <button
                      onClick={() => setStep('select-borrower')}
                      className="w-full py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-medium"
                    >
                      <i className="fa-solid fa-arrow-left mr-2"></i>
                      Back to Borrower
                    </button>
                    <button
                      onClick={() => setStep('confirm')}
                      disabled={selectedItems.length === 0}
                      className={`w-full py-3 rounded-lg font-bold ${
                        selectedItems.length === 0
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      Next: Confirm Loan <i className="fa-solid fa-arrow-right ml-2"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirm Loan */}
          {step === 'confirm' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Loan Details Form */}
                <div className="space-y-6">
                  <div className="bg-white border border-gray-300 rounded-xl p-4">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Loan Details</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Program / Event Name *
                        </label>
                        <input
                          type="text"
                          value={programName}
                          onChange={(e) => setProgramName(e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg"
                          placeholder="e.g., Company Anniversary, Team Building"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Loan Reason
                        </label>
                        <textarea
                          value={loanReason}
                          onChange={(e) => setLoanReason(e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg"
                          placeholder="Brief description of why items are being loaned"
                          rows={3}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Due Date *
                        </label>
                        <input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full p-3 border border-gray-300 rounded-lg"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Signature */}
                  <div className="bg-white border border-gray-300 rounded-xl p-4">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Digital Signature *</h3>
                    
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                      <canvas
                        ref={signatureCanvasRef}
                        width={500}
                        height={200}
                        className="w-full h-48 bg-gray-50 rounded border"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                      />
                    </div>
                    
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={clearSignature}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                      >
                        Clear Signature
                      </button>
                      <div className="text-sm text-gray-600 ml-auto">
                        Click and drag to sign above
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="space-y-6">
                  {/* Borrower Summary */}
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <h3 className="text-lg font-bold text-green-800 mb-3">Borrower</h3>
                    {selectedBorrower && (
                      <div className="space-y-2">
                        <p><strong>Name:</strong> {selectedBorrower.name}</p>
                        <p><strong>NIK:</strong> {selectedBorrower.nik}</p>
                        <p><strong>Position:</strong> {selectedBorrower.position}</p>
                        <p><strong>Phone:</strong> {selectedBorrower.phone}</p>
                      </div>
                    )}
                  </div>

                  {/* Items Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="text-lg font-bold text-blue-800 mb-3">
                      Selected Items ({selectedItems.length})
                    </h3>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedItems.map(item => (
                        <div key={item.barcode} className="bg-white p-3 rounded border">
                          <p className="font-medium">{item.item_name}</p>
                          <div className="flex justify-between text-sm text-gray-600">
                            <span>{item.barcode}</span>
                            <span>
                              {new Intl.NumberFormat('id-ID', {
                                style: 'currency',
                                currency: 'IDR',
                                minimumFractionDigits: 0
                              }).format(item.price)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-blue-300">
                      <div className="flex justify-between font-bold">
                        <span>Total Items:</span>
                        <span>{selectedItems.length}</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg mt-2">
                        <span>Total Value:</span>
                        <span className="text-green-600">
                          {new Intl.NumberFormat('id-ID', {
                            style: 'currency',
                            currency: 'IDR',
                            minimumFractionDigits: 0
                          }).format(selectedItems.reduce((sum, item) => sum + item.price, 0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    <button
                      onClick={() => setStep('select-items')}
                      className="w-full py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-medium"
                    >
                      <i className="fa-solid fa-arrow-left mr-2"></i>
                      Back to Items
                    </button>
                    
                    <button
                      onClick={handleSubmitLoan}
                      disabled={isLoading || !signature || !programName || !dueDate}
                      className={`w-full py-4 rounded-xl font-bold text-lg ${
                        isLoading || !signature || !programName || !dueDate
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {isLoading ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                          Processing Loan...
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-check-circle mr-2"></i>
                          CONFIRM & SUBMIT LOAN
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-100 p-4 border-t border-gray-300">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Loan System • Step {step === 'select-borrower' ? 1 : step === 'select-items' ? 2 : 3} of 3
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedBorrower(null);
                  setSelectedItems([]);
                  setStep('select-borrower');
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Start Over
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoanSystem;