import React, { useState, useEffect } from 'react';
import { AudioPresets } from '../services/audioService';
import { loanApi } from '../services/apiService';
import { LoanTransaction } from '../types/index.ts';

interface ReturnSystemProps {
  onClose?: () => void;
}

const ReturnSystem: React.FC<ReturnSystemProps> = ({ onClose }) => {
  const [activeLoans, setActiveLoans] = useState<LoanTransaction[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<LoanTransaction | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [returnHistory, setReturnHistory] = useState<any[]>([]);

  // Load data
  useEffect(() => {
    loadActiveLoans();
    loadReturnHistory();
  }, []);

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

  const loadReturnHistory = async () => {
    try {
      const response = await loanApi.getHistory();
      if (response.success) {
        // Filter only completed returns
        const returns = response.data.filter((loan: LoanTransaction) => 
          loan.status === 'Completed'
        );
        setReturnHistory(returns.slice(0, 10)); // Last 10 returns
      }
    } catch (error) {
      console.error('Failed to load return history:', error);
    }
  };

  const handleSelectLoan = (loan: LoanTransaction) => {
    setSelectedLoan(loan);
    AudioPresets.BUTTON_CLICK();
  };

  const handleReturnByBarcode = async () => {
    if (!barcodeInput.trim()) {
      alert('Please enter a barcode');
      return;
    }

    const confirmReturn = window.confirm(`Return item with barcode: ${barcodeInput}?`);
    if (!confirmReturn) return;

    setIsLoading(true);

    try {
      const response = await loanApi.returnItem(barcodeInput, 'Admin');
      
      if (response.success) {
        AudioPresets.ITEM_FOUND();
        setBarcodeInput('');
        
        // Reload data
        await loadActiveLoans();
        await loadReturnHistory();
        
        alert('Item returned successfully!');
      }
    } catch (error: any) {
      console.error('Return failed:', error);
      AudioPresets.ITEM_NOT_FOUND();
      alert(error.message || 'Failed to return item. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkReturn = async (loan: LoanTransaction) => {
    if (!loan.items || loan.items.length === 0) {
      alert('No items to return');
      return;
    }

    const confirmBulk = window.confirm(
      `Return ALL ${loan.items.length} items for ${loan.borrower_name}?\n\nInvoice: ${loan.invoice_no}`
    );

    if (!confirmBulk) return;

    setIsLoading(true);

    try {
      const barcodes = loan.items.map(item => item.barcode);
      const response = await fetch('http://10.5.28.10:5000/api/return/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcodes,
          user: 'Admin'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        AudioPresets.UPLOAD_COMPLETE();
        
        // Reload data
        await loadActiveLoans();
        await loadReturnHistory();
        
        alert(`Bulk return completed!\n\nReturned: ${result.stats.returned} items\nNot found: ${result.stats.not_found} items`);
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error('Bulk return failed:', error);
      AudioPresets.ITEM_NOT_FOUND();
      alert('Bulk return failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleIndividualReturn = async (barcode: string) => {
    const confirm = window.confirm(`Return item ${barcode}?`);
    if (!confirm) return;

    try {
      const response = await loanApi.returnItem(barcode, 'Admin');
      
      if (response.success) {
        AudioPresets.ITEM_FOUND();
        
        // Reload data
        await loadActiveLoans();
        await loadReturnHistory();
        
        alert('Item returned successfully!');
      }
    } catch (error: any) {
      console.error('Return failed:', error);
      AudioPresets.ITEM_NOT_FOUND();
      alert(error.message || 'Failed to return item.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-green-800 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Return Management System</h2>
              <p className="text-green-100">Return loaned items to inventory</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-green-700 rounded-full transition-colors"
            >
              <i className="fa-solid fa-times text-xl"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Quick Return */}
            <div className="space-y-6">
              {/* Quick Return by Barcode */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-lg font-bold text-blue-800 mb-4">Quick Return by Barcode</h3>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Scan or enter barcode..."
                    className="flex-1 p-3 border border-blue-300 rounded-lg"
                    onKeyPress={(e) => e.key === 'Enter' && handleReturnByBarcode()}
                  />
                  <button
                    onClick={handleReturnByBarcode}
                    disabled={isLoading || !barcodeInput.trim()}
                    className={`px-6 py-3 rounded-lg font-bold ${
                      isLoading || !barcodeInput.trim()
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isLoading ? (
                      <i className="fa-solid fa-spinner fa-spin"></i>
                    ) : (
                      'Return'
                    )}
                  </button>
                </div>
                
                <p className="text-sm text-blue-600 mt-2">
                  Scan barcode or enter manually, then press Enter or click Return
                </p>
              </div>

              {/* Active Loans */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <h3 className="text-lg font-bold text-yellow-800 mb-4">Active Loans</h3>
                
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {activeLoans.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No active loans</p>
                  ) : (
                    activeLoans.map(loan => (
                      <div
                        key={loan.id}
                        onClick={() => handleSelectLoan(loan)}
                        className={`p-4 border rounded-lg cursor-pointer transition-all ${
                          selectedLoan?.id === loan.id
                            ? 'border-green-500 bg-green-50'
                            : 'border-yellow-300 hover:border-yellow-400 hover:bg-yellow-100'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-gray-800">{loan.borrower_name}</h4>
                            <p className="text-sm text-gray-600">{loan.invoice_no}</p>
                            <p className="text-sm text-gray-600">
                              Due: {new Date(loan.due_date).toLocaleDateString('id-ID')}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded">
                              {loan.item_count || 0} items
                            </span>
                            <p className="text-sm text-gray-600 mt-1">{loan.program_name}</p>
                          </div>
                        </div>
                        
                        {/* Bulk Return Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBulkReturn(loan);
                          }}
                          className="w-full mt-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                        >
                          Return All Items
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Selected Loan Details */}
            <div className="space-y-6">
              {/* Selected Loan Details */}
              {selectedLoan ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <h3 className="text-lg font-bold text-green-800 mb-4">
                    Loan Details: {selectedLoan.borrower_name}
                  </h3>
                  
                  <div className="mb-4">
                    <p><strong>Invoice:</strong> {selectedLoan.invoice_no}</p>
                    <p><strong>Borrower:</strong> {selectedLoan.borrower_name}</p>
                    <p><strong>Program:</strong> {selectedLoan.program_name}</p>
                    <p><strong>Loan Date:</strong> {new Date(selectedLoan.created_at).toLocaleDateString('id-ID')}</p>
                    <p><strong>Due Date:</strong> {new Date(selectedLoan.due_date).toLocaleDateString('id-ID')}</p>
                    <p><strong>Reason:</strong> {selectedLoan.loan_reason || '-'}</p>
                  </div>
                  
                  {/* Items in Loan */}
                  <h4 className="font-bold text-gray-800 mb-3">Items to Return</h4>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedLoan.items && selectedLoan.items.length > 0 ? (
                      selectedLoan.items.map(item => (
                        <div key={item.id} className="bg-white p-3 rounded-lg border">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium">{item.item_name}</p>
                              <p className="text-sm text-gray-600">
                                {item.barcode} • {item.brand || '-'} • {item.color} • {item.size}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-green-600">
                                {new Intl.NumberFormat('id-ID', {
                                  style: 'currency',
                                  currency: 'IDR',
                                  minimumFractionDigits: 0
                                }).format(item.price)}
                              </p>
                              <button
                                onClick={() => handleIndividualReturn(item.barcode)}
                                className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                              >
                                Return
                              </button>
                            </div>
                          </div>
                          
                          {/* Status */}
                          <div className="mt-2">
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                              item.status === 'On Loan'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {item.status}
                            </span>
                            {item.returned_at && (
                              <span className="text-xs text-gray-600 ml-2">
                                Returned: {new Date(item.returned_at).toLocaleString('id-ID')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-gray-500 py-4">No items found</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-100 border border-gray-300 rounded-xl p-8 text-center">
                  <i className="fa-solid fa-handshake text-4xl text-gray-400 mb-4"></i>
                  <h3 className="text-lg font-bold text-gray-600 mb-2">Select a Loan</h3>
                  <p className="text-gray-500">
                    Select a loan from the list to view details and return items
                  </p>
                </div>
              )}

              {/* Return History */}
              <div className="bg-gray-50 border border-gray-300 rounded-xl p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Recent Returns</h3>
                
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {returnHistory.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No return history</p>
                  ) : (
                    returnHistory.map(loan => (
                      <div key={loan.id} className="bg-white p-3 rounded border">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-medium">{loan.borrower_name}</p>
                            <p className="text-sm text-gray-600">{loan.invoice_no}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">
                              {new Date(loan.created_at).toLocaleDateString('id-ID')}
                            </p>
                            <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">
                              Completed
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 p-4 border-t border-gray-300">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Return System • Active Loans: {activeLoans.length} • Recent Returns: {returnHistory.length}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnSystem;