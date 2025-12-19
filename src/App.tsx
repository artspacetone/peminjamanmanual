import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { AudioPresets, setupAudioOnFirstInteraction } from './services/audioService';

// Components
import ScannerInput from './components/ScannerInput';
import DashboardStats from './components/DashboardStats';
import FeedbackDisplay from './components/FeedbackDisplay';
import InventoryTable from './components/InventoryTable';
import CameraScanner from './components/CameraScanner';
import LoanSystem from './components/LoanSystem';
import ReturnSystem from './components/ReturnSystem';
import BorrowerManagement from './components/BorrowerManagement';

// Types
interface InventoryItem {
  id: number;
  barcode: string;
  item_name: string;
  brand: string;
  size: string;
  color: string;
  price: number;
  status: string;
  receive_no: string;
  receive_date: string;
  updated_at: string;
  created_at: string;
}

interface ScanFeedback {
  status: 'IDLE' | 'PROCESSING' | 'FOUND' | 'NOT_FOUND' | 'DUPLICATE' | 'ERROR' | 'SUCCESS';
  message: string;
  item: InventoryItem | null;
}

// API Configuration
const API_BASE_URL = 'http://10.5.28.10:5000/api';

const App: React.FC = () => {
  // State Management
  const [tableData, setTableData] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState({ 
    total: 0, 
    scanned: 0,
    on_loan: 0,
    available: 0
  });
  const [lastScanFeedback, setLastScanFeedback] = useState<ScanFeedback>({ 
    status: 'IDLE', 
    message: 'Ready to scan',
    item: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showLoanSystem, setShowLoanSystem] = useState(false);
  const [showReturnSystem, setShowReturnSystem] = useState(false);
  const [showBorrowerManagement, setShowBorrowerManagement] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<number>(0);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [activeMenu, setActiveMenu] = useState<'inventory' | 'loans' | 'returns' | 'borrowers'>('inventory');
  const [searchQuery, setSearchQuery] = useState('');

  // Refs
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const uploadProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check server connection
  const checkServerConnection = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 5000 });
      setServerStatus('connected');
      console.log('✅ Server connected:', response.data);
      return true;
    } catch (error) {
      setServerStatus('disconnected');
      console.error('❌ Server connection failed:', error);
      return false;
    }
  };

  // Initialize audio and data
  useEffect(() => {
    // Setup audio
    setupAudioOnFirstInteraction();
    setAudioInitialized(true);
    
    // Pre-warm audio
    const handleFirstInteraction = () => {
      try {
        AudioPresets.BUTTON_CLICK();
      } catch (error) {
        console.warn('Audio warmup failed:', error);
      }
    };
    
    document.addEventListener('click', handleFirstInteraction, { once: true });
    
    // Check server and load data
    const initializeApp = async () => {
      const connected = await checkServerConnection();
      if (connected) {
        await refreshData();
      } else {
        setLastScanFeedback({
          status: 'ERROR',
          message: 'Cannot connect to server. Please check server is running.',
          item: null
        });
      }
    };
    
    initializeApp();

    // Cleanup
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      if (uploadProgressIntervalRef.current) clearInterval(uploadProgressIntervalRef.current);
      document.removeEventListener('click', handleFirstInteraction);
    };
  }, []);

  // API Functions
  const getInventoryStats = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/stats`);
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error(response.data.error);
    } catch (error) {
      console.error('Get stats error:', error);
      throw error;
    }
  };

  const fetchRecentInventory = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/items`, {
        params: { limit: 100 }
      });
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error(response.data.error);
    } catch (error) {
      console.error('Fetch inventory error:', error);
      throw error;
    }
  };

  const getItemByBarcode = async (barcode: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/items/${barcode}`);
      if (response.data.success && response.data.found) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error('Get item error:', error);
      throw error;
    }
  };

  const markItemAsScanned = async (barcode: string) => {
    try {
      // Update item status to scanned
      const response = await axios.put(`${API_BASE_URL}/items/${barcode}/status`, {
        status: 'Scanned',
        user: 'Admin'
      });
      
      if (response.data.success) {
        return response.data.data;
      }
      throw new Error('Failed to mark item as scanned');
    } catch (error) {
      console.error('Mark scanned error:', error);
      throw error;
    }
  };

  // Refresh inventory data
  const refreshData = async () => {
    try {
      const [statData, recentData] = await Promise.all([
        getInventoryStats(),
        fetchRecentInventory()
      ]);
      setStats(statData);
      setTableData(recentData);
      
    } catch (error) {
      console.error("Sync Error", error);
      setLastScanFeedback({
        status: 'ERROR',
        message: 'Failed to sync data with server',
        item: null
      });
    }
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('Invalid file type. Please upload Excel (.xlsx, .xls) or CSV file.');
      event.target.value = '';
      return;
    }

    const confirmUpload = window.confirm(
      `Upload Data Stok?\n\nFile: ${file.name}\nSize: ${(file.size / 1024 / 1024).toFixed(2)} MB\n\nRequired columns in Excel:\n- Barcode (required)\n- Item Name\n- Brand\n- Size\n- Color\n- Price\n- Receive No\n- Receive Date`
    );

    if (!confirmUpload) {
      event.target.value = '';
      return;
    }

    setIsLoading(true);
    setUploadProgress(0);
    setLastScanFeedback({ 
      status: 'PROCESSING', 
      message: 'Processing Excel file...',
      item: null
    });

    // Simulate progress
    let progress = 0;
    uploadProgressIntervalRef.current = setInterval(() => {
      progress += 5;
      if (progress <= 90) {
        setUploadProgress(progress);
      }
    }, 100);

    try {
      // Check server
      const connected = await checkServerConnection();
      if (!connected) {
        throw new Error('Server is not connected. Please start the server.');
      }

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user', 'Admin User');

      // Upload file
      const response = await axios.post(`${API_BASE_URL}/upload-excel`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 90) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        },
        timeout: 300000, // 5 minutes
      });

      // Clear progress interval
      if (uploadProgressIntervalRef.current) {
        clearInterval(uploadProgressIntervalRef.current);
      }
      setUploadProgress(100);

      if (response.data.success) {
        AudioPresets.UPLOAD_COMPLETE();
        setLastScanFeedback({
          status: 'SUCCESS',
          message: response.data.message || 'Upload successful!',
          item: null
        });

        // Show success message with details
        setTimeout(() => {
          if (response.data.stats) {
            const { added, updated, skipped } = response.data.stats;
            alert(`✅ Upload Summary:\n\n📥 Added: ${added} items\n📝 Updated: ${updated} items\n⏭️ Skipped: ${skipped} items`);
          }
        }, 500);

        // Refresh data
        await refreshData();
      } else {
        throw new Error(response.data.message || 'Upload failed');
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      
      if (uploadProgressIntervalRef.current) {
        clearInterval(uploadProgressIntervalRef.current);
      }
      
      AudioPresets.ITEM_NOT_FOUND();
      
      let errorMessage = 'Upload failed. ';
      if (error.response?.data?.message) {
        errorMessage += error.response.data.message;
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Unknown error.';
      }
      
      setLastScanFeedback({
        status: 'ERROR',
        message: errorMessage,
        item: null
      });
      
      alert(`❌ Upload Error:\n\n${errorMessage}\n\nPlease check:\n1. Server is running\n2. Excel format is correct\n3. Network connection`);
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadProgress(0), 1000);
      event.target.value = '';
    }
  };

  // Handle export data
  const handleExport = async (filterType: 'ALL' | 'SCANNED' | 'PENDING' | 'ON_LOAN') => {
    if (tableData.length === 0) {
      alert("No data available for export.");
      return;
    }

    const button = document.getElementById('export-btn-text');
    const originalText = button?.textContent || 'DOWNLOAD REPORT';
    
    if (button) button.textContent = "Processing...";

    try {
      let dataToExport = [...tableData];
      
      // Filter data
      if (filterType === 'SCANNED') {
        dataToExport = dataToExport.filter(item => 
          item.status === 'Scanned'
        );
      } else if (filterType === 'ON_LOAN') {
        dataToExport = dataToExport.filter(item => 
          item.status === 'On Loan'
        );
      } else if (filterType === 'PENDING') {
        dataToExport = dataToExport.filter(item => 
          item.status === 'Available'
        );
      }

      if (dataToExport.length === 0) {
        alert("No data matches the selected filter.");
        return;
      }

      // Prepare CSV content
      const headers = [
        "Barcode",
        "Item Name",
        "Brand",
        "Size", 
        "Color",
        "Price",
        "Status",
        "Receive No",
        "Receive Date",
        "Last Updated"
      ];

      const rows = dataToExport.map(item => [
        item.barcode,
        `"${(item.item_name || '').replace(/"/g, '""')}"`,
        item.brand || '',
        item.size || '',
        item.color || '',
        Number(item.price || 0).toFixed(2),
        item.status || 'Available',
        item.receive_no || '',
        item.receive_date || '',
        item.updated_at ? new Date(item.updated_at).toLocaleString('id-ID') : '-'
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create and download CSV file
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Inventory_${filterType}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Success feedback
      AudioPresets.EXPORT_COMPLETE();
      setLastScanFeedback({
        status: 'SUCCESS',
        message: `Exported ${dataToExport.length} items successfully`,
        item: null
      });

    } catch (error) {
      console.error('Export error:', error);
      AudioPresets.ITEM_NOT_FOUND();
      alert("Error during export. Please try again.");
    } finally {
      if (button) button.textContent = originalText;
    }
  };

  // Handle clear all data
  const handleClearData = async () => {
    const confirmed = window.confirm(
      "⚠️ WARNING: DELETE ALL DATA?\n\nThis will permanently delete ALL inventory data and cannot be undone.\n\nType 'DELETE_CONFIRM' to confirm:"
    );

    if (!confirmed) return;

    const userInput = prompt("Please type 'DELETE_CONFIRM' to confirm:");
    if (userInput !== 'DELETE_CONFIRM') {
      alert('Cancelled. Data was NOT deleted.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.delete(`${API_BASE_URL}/clear/all`, {
        data: {
          password: 'DELETE_CONFIRM',
          user: 'Admin'
        }
      });
      
      if (response.data.success) {
        setTableData([]);
        setStats({ total: 0, scanned: 0, on_loan: 0, available: 0 });
        
        AudioPresets.UPLOAD_COMPLETE();
        setLastScanFeedback({
          status: 'SUCCESS',
          message: 'All data has been cleared',
          item: null
        });
        
        alert('✅ All data cleared successfully');
      }
    } catch (error: any) {
      console.error('Clear data error:', error);
      AudioPresets.ITEM_NOT_FOUND();
      setLastScanFeedback({
        status: 'ERROR',
        message: 'Failed to clear data',
        item: null
      });
      alert(`Error: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle barcode scan
  const handleScan = useCallback(async (barcode: string) => {
    // Debounce
    const now = Date.now();
    if (now - lastScanTime < 500) return;
    setLastScanTime(now);

    if (!barcode.trim() || isProcessing) return;

    setIsProcessing(true);
    const searchCode = barcode.trim();

    // Clear previous feedback timeout
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

    try {
      const item = await getItemByBarcode(searchCode);
      
      if (!item) {
        AudioPresets.ITEM_NOT_FOUND();
        setLastScanFeedback({
          status: 'NOT_FOUND',
          message: 'BARCODE NOT FOUND',
          item: null
        });
      } else if (item.status === 'Scanned') {
        AudioPresets.ITEM_DUPLICATE();
        setLastScanFeedback({
          status: 'DUPLICATE',
          message: 'ALREADY SCANNED',
          item: item
        });
      } else if (item.status === 'On Loan') {
        AudioPresets.ITEM_NOT_FOUND();
        setLastScanFeedback({
          status: 'ERROR',
          message: 'ITEM IS ON LOAN',
          item: item
        });
      } else {
        const scannedItem = await markItemAsScanned(searchCode);
        AudioPresets.ITEM_FOUND();
        setLastScanFeedback({
          status: 'FOUND',
          message: `${scannedItem.item_name || 'ITEM'} SCANNED SUCCESSFULLY`,
          item: scannedItem
        });
        
        // Refresh data after successful scan
        await refreshData();
      }
    } catch (error) {
      console.error('Scan error:', error);
      AudioPresets.ITEM_NOT_FOUND();
      setLastScanFeedback({
        status: 'ERROR',
        message: 'SERVER ERROR',
        item: null
      });
    } finally {
      setIsProcessing(false);
      
      // Auto-clear feedback after 3 seconds
      scanTimeoutRef.current = setTimeout(() => {
        setLastScanFeedback({
          status: 'IDLE',
          message: 'Ready to scan',
          item: null
        });
      }, 3000);
    }
  }, [isProcessing, lastScanTime]);

  // Handle camera scan success
  const handleCameraScanSuccess = useCallback((barcode: string) => {
    AudioPresets.CAMERA_SCAN_SUCCESS();
    handleScan(barcode);
    setShowCamera(false);
  }, [handleScan]);

  // Handle camera scan start
  const handleCameraStart = () => {
    if (serverStatus !== 'connected') {
      alert('Please connect to server first');
      return;
    }
    AudioPresets.CAMERA_SCAN_START();
    setShowCamera(true);
  };

  // Test audio function
  const testAudio = () => {
    try {
      AudioPresets.ITEM_FOUND();
      setTimeout(() => AudioPresets.ITEM_DUPLICATE(), 300);
      setTimeout(() => AudioPresets.ITEM_NOT_FOUND(), 600);
      setTimeout(() => AudioPresets.UPLOAD_COMPLETE(), 900);
    } catch (error) {
      console.warn('Audio test failed:', error);
    }
  };

  // Test server connection
  const testServerConnection = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/test`, { timeout: 5000 });
      alert(`✅ Server is running!\n\n${JSON.stringify(response.data, null, 2)}`);
      setServerStatus('connected');
    } catch (error) {
      alert(`❌ Server connection failed:\n\n${error.message}`);
      setServerStatus('disconnected');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      await refreshData();
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/items`, {
        params: { search: searchQuery }
      });
      
      if (response.data.success) {
        setTableData(response.data.data);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col font-sans overflow-hidden">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-white p-6">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-blue-500/30 rounded-full"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          </div>
          <h2 className="text-xl font-bold mt-4 mb-2">
            {uploadProgress > 0 ? 'Uploading Data...' : 'Processing...'}
          </h2>
          {uploadProgress > 0 && (
            <>
              <div className="w-64 bg-gray-700 rounded-full h-3 overflow-hidden mt-2">
                <div 
                  className="bg-green-500 h-full transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="mt-2 font-mono text-sm">{uploadProgress}%</p>
            </>
          )}
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm z-30 shrink-0 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-2 rounded-lg shadow">
              <i className="fa-solid fa-boxes-stacked text-lg"></i>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Wardrobe Inventory Pro</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-500">Real-time Inventory Management</p>
                <div className={`w-2 h-2 rounded-full ${
                  serverStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                  serverStatus === 'disconnected' ? 'bg-red-500' : 'bg-yellow-500'
                }`}></div>
                <span className={`text-xs ${
                  serverStatus === 'connected' ? 'text-green-600' :
                  serverStatus === 'disconnected' ? 'text-red-600' : 'text-yellow-600'
                }`}>
                  {serverStatus === 'connected' ? 'Connected' : 
                   serverStatus === 'disconnected' ? 'Disconnected' : 'Checking...'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search items..."
                className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <i className="fa-solid fa-search"></i>
              </button>
            </div>

            {/* Upload Button */}
            <label className="cursor-pointer bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow hover:shadow-md">
              <i className="fa-solid fa-upload"></i>
              Upload Excel
              <input 
                type="file" 
                accept=".xlsx,.xls,.csv" 
                className="hidden" 
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </label>

            {/* Loan System Button */}
            <button
              onClick={() => setShowLoanSystem(true)}
              className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow hover:shadow-md"
            >
              <i className="fa-solid fa-handshake"></i>
              Loan System
            </button>

            {/* Return System Button */}
            <button
              onClick={() => setShowReturnSystem(true)}
              className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow hover:shadow-md"
            >
              <i className="fa-solid fa-arrow-right-to-bracket"></i>
              Return System
            </button>

            {/* Export Dropdown */}
            <div className="relative group">
              <button className="bg-gray-100 hover:bg-gray-200 p-2.5 rounded-lg text-gray-600 transition-colors">
                <i className="fa-solid fa-download text-lg"></i>
              </button>
              <div className="absolute right-0 top-full mt-2 w-56 bg-white shadow-xl rounded-lg border border-gray-200 hidden group-hover:block p-2 z-50">
                <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wide" id="export-btn-text">
                  Download Report
                </div>
                <div className="space-y-1">
                  <button 
                    onClick={() => handleExport('SCANNED')}
                    className="w-full text-left p-2 hover:bg-green-50 text-sm text-green-700 font-medium rounded transition-colors flex items-center gap-2"
                  >
                    <i className="fa-solid fa-check-circle text-green-500"></i>
                    Scanned Items
                  </button>
                  <button 
                    onClick={() => handleExport('ON_LOAN')}
                    className="w-full text-left p-2 hover:bg-orange-50 text-sm text-orange-700 font-medium rounded transition-colors flex items-center gap-2"
                  >
                    <i className="fa-solid fa-handshake text-orange-500"></i>
                    Items on Loan
                  </button>
                  <button 
                    onClick={() => handleExport('PENDING')}
                    className="w-full text-left p-2 hover:bg-yellow-50 text-sm text-yellow-700 font-medium rounded transition-colors flex items-center gap-2"
                  >
                    <i className="fa-solid fa-clock text-yellow-500"></i>
                    Available Items
                  </button>
                  <button 
                    onClick={() => handleExport('ALL')}
                    className="w-full text-left p-2 hover:bg-blue-50 text-sm text-blue-700 font-medium rounded transition-colors flex items-center gap-2 border-b border-gray-100"
                  >
                    <i className="fa-solid fa-list text-blue-500"></i>
                    All Data
                  </button>
                  <button 
                    onClick={handleClearData}
                    className="w-full text-left p-2 hover:bg-red-50 text-sm text-red-600 font-medium rounded transition-colors flex items-center gap-2 mt-1"
                  >
                    <i className="fa-solid fa-trash-alt text-red-500"></i>
                    Clear All Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveMenu('inventory')}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeMenu === 'inventory'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="fa-solid fa-boxes-stacked mr-2"></i>
                Inventory Management
              </button>
              <button
                onClick={() => setShowBorrowerManagement(true)}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeMenu === 'borrowers'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="fa-solid fa-users mr-2"></i>
                Borrower Management
              </button>
              <button
                onClick={() => setShowLoanSystem(true)}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeMenu === 'loans'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="fa-solid fa-handshake mr-2"></i>
                Loan Management
              </button>
              <button
                onClick={() => setShowReturnSystem(true)}
                className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeMenu === 'returns'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <i className="fa-solid fa-arrow-right-to-bracket mr-2"></i>
                Return Management
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 p-4 lg:p-6">
        {/* Left Panel */}
        <div className="w-full lg:w-5/12 flex flex-col shrink-0 space-y-4">
          {/* Stats Dashboard */}
          <DashboardStats 
            total={stats.total} 
            scanned={stats.scanned} 
            onLoan={stats.on_loan}
            available={stats.available}
          />
          
          {/* Feedback Display */}
          <FeedbackDisplay feedback={lastScanFeedback} />
          
          {/* Scanner Controls */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            {/* Manual Scanner Input */}
            <ScannerInput 
              onScan={handleScan} 
              lastResult={lastScanFeedback.status}
              isProcessing={isProcessing}
            />
            
            {/* Camera Scanner Button */}
            <button 
              onClick={handleCameraStart}
              disabled={isProcessing || serverStatus !== 'connected'}
              className={`w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 active:scale-[0.98] text-white rounded-xl shadow-md font-bold flex justify-center items-center gap-3 text-lg transition-all duration-200 ${
                (isProcessing || serverStatus !== 'connected') ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <i className="fa-solid fa-camera text-2xl"></i>
              SCAN WITH CAMERA
            </button>
            
            {/* Server Status */}
            <div className={`p-3 rounded-lg ${
              serverStatus === 'connected' ? 'bg-green-50 border border-green-200' :
              serverStatus === 'disconnected' ? 'bg-red-50 border border-red-200' :
              'bg-yellow-50 border border-yellow-200'
            }`}>
              <p className={`text-sm font-medium flex items-center gap-2 ${
                serverStatus === 'connected' ? 'text-green-800' :
                serverStatus === 'disconnected' ? 'text-red-800' : 'text-yellow-800'
              }`}>
                <i className={`fa-solid ${
                  serverStatus === 'connected' ? 'fa-check-circle text-green-500' :
                  serverStatus === 'disconnected' ? 'fa-times-circle text-red-500' :
                  'fa-exclamation-circle text-yellow-500'
                }`}></i>
                Server: {serverStatus === 'connected' ? 'Connected' : 
                        serverStatus === 'disconnected' ? 'Disconnected - Please start server' : 
                        'Checking...'}
              </p>
              <button 
                onClick={testServerConnection}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Test Connection
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Inventory Table */}
        <div className="w-full lg:w-7/12 flex flex-col shrink-0 h-[500px] lg:h-auto lg:flex-1 pb-16 lg:pb-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <i className="fa-solid fa-table text-blue-500"></i>
                Latest Inventory Items
                <span className="text-sm font-normal text-gray-500">
                  ({tableData.length} items)
                </span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  Showing {tableData.length} of {stats.total}
                </span>
                <button 
                  onClick={refreshData}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <i className="fa-solid fa-sync-alt"></i>
                  Refresh
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <InventoryTable items={tableData} />
            </div>
            <div className="p-3 border-t border-gray-200 bg-gray-50 text-center">
              <p className="text-gray-500 text-sm">
                Total: <span className="font-bold">{stats.total}</span> | 
                Available: <span className="font-bold text-green-600">{stats.available}</span> | 
                On Loan: <span className="font-bold text-orange-600">{stats.on_loan}</span> | 
                Scanned: <span className="font-bold text-blue-600">{stats.scanned}</span>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Camera Scanner Modal */}
      {showCamera && (
        <CameraScanner 
          onScanSuccess={handleCameraScanSuccess}
          onClose={() => setShowCamera(false)}
          onError={(error) => {
            console.error('Camera error:', error);
            AudioPresets.ITEM_NOT_FOUND();
            setLastScanFeedback({
              status: 'ERROR',
              message: `Camera Error: ${error}`
            });
            setShowCamera(false);
          }}
        />
      )}

      {/* Loan System Modal */}
      {showLoanSystem && (
        <LoanSystem onClose={() => setShowLoanSystem(false)} />
      )}

      {/* Return System Modal */}
      {showReturnSystem && (
        <ReturnSystem onClose={() => setShowReturnSystem(false)} />
      )}

      {/* Borrower Management Modal */}
      {showBorrowerManagement && (
        <BorrowerManagement onClose={() => setShowBorrowerManagement(false)} />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 p-3 text-center z-30 shrink-0">
        <p className="text-gray-500 text-sm">
          © {new Date().getFullYear()} Wardrobe Inventory Pro • 
          <span className={`font-medium mx-2 ${
            serverStatus === 'connected' ? 'text-green-600' : 'text-red-600'
          }`}>
            Server: {serverStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </span>
          • Last update: {new Date().toLocaleTimeString('id-ID')}
        </p>
      </footer>

      {/* Debug Buttons */}
      <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-2">
        <button
          onClick={testAudio}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded shadow-md transition-colors opacity-70 hover:opacity-100"
        >
          Test Audio
        </button>
        <button
          onClick={testServerConnection}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded shadow-md transition-colors opacity-70 hover:opacity-100"
        >
          Test Server
        </button>
      </div>

      {/* Audio Status Indicator */}
      {audioInitialized && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-gray-800/80 backdrop-blur-sm rounded-lg p-2 border border-gray-700">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-white text-xs">Audio Ready</span>
        </div>
      )}
    </div>
  );
};

export default App;