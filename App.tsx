import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabaseClient';
import { 
  getInventoryStats, 
  getItemByBarcode, 
  markItemAsScanned, 
  fetchRecentInventory, 
  uploadBulkInventory, 
  clearAllData, 
  fetchAllForExport 
} from './services/inventoryService';
import { parseExcelFile } from './services/excelService';
import { AudioPresets, setupAudioOnFirstInteraction } from './services/audioService';
import { InventoryItem, ScanFeedback } from './types';

// PERBAIKAN IMPORT: Menghapus kurung kurawal {} karena komponen menggunakan export default
import ScannerInput from './components/ScannerInput';
import DashboardStats from './components/DashboardStats';
import FeedbackDisplay from './components/FeedbackDisplay';
import InventoryTable from './components/InventoryTable';
import CameraScanner from './components/CameraScanner';

const App: React.FC = () => {
  // State Management
  const [tableData, setTableData] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState({ total: 0, scanned: 0 });
  const [lastScanFeedback, setLastScanFeedback] = useState<ScanFeedback>({ 
    status: 'IDLE', 
    message: 'Ready to scan',
    item: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<number>(0);
  const [audioInitialized, setAudioInitialized] = useState(false);

  // Refs
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const uploadProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio and data
  useEffect(() => {
    // Setup audio on app load
    setupAudioOnFirstInteraction();
    setAudioInitialized(true);
    
    // Pre-warm audio on first user interaction
    const handleFirstInteraction = () => {
      try {
        AudioPresets.BUTTON_CLICK();
      } catch (error) {
        console.warn('Audio warmup failed:', error);
      }
    };
    
    document.addEventListener('click', handleFirstInteraction, { once: true });
    
    // Initialize data
    refreshData();
    
    // Setup real-time subscription
    const channel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory'
        },
        () => {
          refreshData();
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      if (uploadProgressIntervalRef.current) {
        clearInterval(uploadProgressIntervalRef.current);
      }
      document.removeEventListener('click', handleFirstInteraction);
      supabase.removeChannel(channel);
    };
  }, []);

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
        message: 'Failed to sync data',
        item: null
      });
    }
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const confirmUpload = window.confirm(
      "Upload Data Stok?\n\nFormat file Excel harus berisi kolom:\n- Barcode\n- Item Name\n- Status\n- Color\n- Brand\n- Price\n- Type"
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

    // Simulate progress for UX
    let progress = 0;
    uploadProgressIntervalRef.current = setInterval(() => {
      progress += 5;
      if (progress <= 95) {
        setUploadProgress(progress);
      }
    }, 100);

    try {
      const data = await parseExcelFile(file);
      
      if (!data || data.length === 0) {
        throw new Error('Excel file is empty or format is incorrect');
      }

      // Play upload start sound
      AudioPresets.UPLOAD_START();

      await uploadBulkInventory(data, (actualProgress) => {
        setUploadProgress(Math.round(actualProgress));
      });

      // Clear progress interval
      if (uploadProgressIntervalRef.current) {
        clearInterval(uploadProgressIntervalRef.current);
      }
      setUploadProgress(100);

      // Success feedback
      AudioPresets.UPLOAD_COMPLETE();
      setLastScanFeedback({
        status: 'SUCCESS',
        message: `SUCCESS! ${data.length} items uploaded`,
        item: null
      });

      // Refresh data
      await refreshData();
      
      // Reset input file
      event.target.value = '';

    } catch (error: any) {
      console.error('Upload error:', error);
      
      if (uploadProgressIntervalRef.current) {
        clearInterval(uploadProgressIntervalRef.current);
      }
      
      AudioPresets.ITEM_NOT_FOUND();
      setLastScanFeedback({
        status: 'ERROR',
        message: `Upload failed: ${error.message || 'Unknown error'}`,
        item: null
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // Handle export data
  const handleExport = async (filterType: 'ALL' | 'SCANNED' | 'PENDING') => {
    if (stats.total === 0) {
      alert("No data available for export.");
      return;
    }

    const button = document.getElementById('export-btn-text');
    const originalText = button?.textContent || 'DOWNLOAD REPORT';
    
    if (button) button.textContent = "Processing...";

    try {
      const data = await fetchAllForExport(filterType);
      
      if (data.length === 0) {
        alert("No data matches the selected filter.");
        return;
      }

      // Prepare CSV content
      const headers = [
        "Barcode",
        "Item Name",
        "Status",
        "Color", 
        "Brand",
        "Price",
        "Type",
        "Is Scanned",
        "Scan Time"
      ];

      const rows = data.map(item => [
        item.barcode,
        `"${(item.item_name || '').replace(/"/g, '""')}"`,
        item.status || '',
        item.color || '',
        item.brand || '',
        Number(item.price || 0).toFixed(0),
        item.type || '',
        item.is_scanned ? 'YES' : 'NO',
        item.scan_timestamp 
          ? new Date(item.scan_timestamp).toLocaleString('id-ID') 
          : '-'
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create and download CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Stock_Opname_${filterType}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Success feedback
      AudioPresets.EXPORT_COMPLETE();
      setLastScanFeedback({
        status: 'SUCCESS',
        message: `Exported ${data.length} items successfully`,
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
      "DELETE ALL DATA?\n\nThis action will permanently delete all inventory data and cannot be undone."
    );

    if (!confirmed) return;

    setIsLoading(true);
    try {
      await clearAllData();
      await refreshData();
      
      AudioPresets.ITEM_FOUND();
      setLastScanFeedback({
        status: 'SUCCESS',
        message: 'All data has been cleared',
        item: null
      });
    } catch (error) {
      console.error('Clear data error:', error);
      AudioPresets.ITEM_NOT_FOUND();
      setLastScanFeedback({
        status: 'ERROR',
        message: 'Failed to clear data',
        item: null
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle barcode scan (with debounce and audio feedback)
  const handleScan = useCallback(async (barcode: string) => {
    // Debounce: prevent multiple scans within 500ms
    const now = Date.now();
    if (now - lastScanTime < 500) {
      return;
    }
    setLastScanTime(now);

    if (!barcode.trim() || isProcessing) return;

    setIsProcessing(true);
    const searchCode = barcode.trim();

    // Clear previous feedback timeout
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    try {
      const item = await getItemByBarcode(searchCode);
      
      if (!item) {
        AudioPresets.ITEM_NOT_FOUND();
        setLastScanFeedback({
          status: 'NOT_FOUND',
          message: 'BARCODE NOT FOUND',
          item: null
        });
      } else if (item.is_scanned) {
        AudioPresets.ITEM_DUPLICATE();
        setLastScanFeedback({
          status: 'DUPLICATE',
          message: 'ALREADY SCANNED',
          item: item
        });
      } else {
        const scannedItem = await markItemAsScanned(searchCode);
        AudioPresets.ITEM_FOUND();
        setLastScanFeedback({
          status: 'FOUND',
          message: `${scannedItem.item_name || scannedItem.type || 'ITEM'} SCANNED SUCCESSFULLY`,
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
        message: 'SERVER / NETWORK ERROR',
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
    AudioPresets.CAMERA_SCAN_START();
    setShowCamera(true);
  };

  // Test audio function
  const testAudio = () => {
    try {
      // Play test sequence
      setTimeout(() => AudioPresets.ITEM_FOUND(), 0);
      setTimeout(() => AudioPresets.ITEM_DUPLICATE(), 300);
      setTimeout(() => AudioPresets.ITEM_NOT_FOUND(), 600);
      setTimeout(() => AudioPresets.EXPORT_COMPLETE(), 900);
    } catch (error) {
      console.warn('Audio test failed:', error);
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
              <h1 className="text-lg font-bold text-gray-800">Stock Opname Pro</h1>
              <p className="text-xs text-gray-500">Real-time Inventory Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Upload Button */}
            <label className="cursor-pointer bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow hover:shadow-md">
              <i className="fa-solid fa-upload"></i>
              Upload Excel
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                className="hidden" 
                onChange={handleFileUpload}
                disabled={isLoading}
              />
            </label>

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
                    onClick={() => handleExport('PENDING')}
                    className="w-full text-left p-2 hover:bg-yellow-50 text-sm text-yellow-700 font-medium rounded transition-colors flex items-center gap-2"
                  >
                    <i className="fa-solid fa-clock text-yellow-500"></i>
                    Pending Items
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
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 p-4 lg:p-6">
        {/* Left Panel */}
        <div className="w-full lg:w-5/12 flex flex-col shrink-0 space-y-4">
          {/* Stats Dashboard */}
          <DashboardStats total={stats.total} scanned={stats.scanned} />
          
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
              disabled={isProcessing}
              className={`w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 active:scale-[0.98] text-white rounded-xl shadow-md font-bold flex justify-center items-center gap-3 text-lg transition-all duration-200 ${
                isProcessing ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <i className="fa-solid fa-camera text-2xl"></i>
              SCAN WITH CAMERA
            </button>
            
            {/* Scan Tips */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-blue-800 text-sm font-medium flex items-center gap-2">
                <i className="fa-solid fa-lightbulb text-blue-500"></i>
                Scanning Tips:
              </p>
              <ul className="text-blue-600 text-xs mt-1 space-y-1">
                <li>• Ensure barcode/QR code is clean and undamaged</li>
                <li>• Optimal distance: 15-30 cm from camera</li>
                <li>• Good lighting conditions for best results</li>
                <li>• Use back camera for iOS devices</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right Panel - Inventory Table */}
        <div className="w-full lg:w-7/12 flex flex-col shrink-0 h-[500px] lg:h-auto lg:flex-1 pb-16 lg:pb-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <i className="fa-solid fa-table text-blue-500"></i>
                Latest Inventory Items
                <span className="text-sm font-normal text-gray-500">
                  ({tableData.length} items)
                </span>
              </h2>
            </div>
            <div className="flex-1 overflow-auto">
              <InventoryTable items={tableData} />
            </div>
            <div className="p-3 border-t border-gray-200 bg-gray-50 text-center">
              <p className="text-gray-500 text-sm">
                Total: <span className="font-bold">{stats.total}</span> | 
                Scanned: <span className="font-bold text-green-600">{stats.scanned}</span> | 
                Pending: <span className="font-bold text-red-600">{stats.total - stats.scanned}</span>
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

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 p-3 text-center z-30 shrink-0">
        <p className="text-gray-500 text-sm">
          © {new Date().getFullYear()} Stock Opname Pro • 
          <span className="text-blue-600 font-medium mx-2">
            Real-time Sync: Active
          </span>
          • Last update: {new Date().toLocaleTimeString('id-ID')}
        </p>
      </footer>

      {/* Audio Test Button (Debug) */}
      <button
        onClick={testAudio}
        className="fixed bottom-4 left-4 z-40 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded shadow-md transition-colors opacity-70 hover:opacity-100"
      >
        Test Audio
      </button>

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