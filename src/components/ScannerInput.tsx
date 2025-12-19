// components/ScannerInput.tsx
import React, { useState, useRef, useEffect } from 'react';

interface ScannerInputProps {
  onScan: (barcode: string) => void;
  lastResult: string;
  isProcessing: boolean;
}

const ScannerInput: React.FC<ScannerInputProps> = ({ 
  onScan, 
  lastResult, 
  isProcessing 
}) => {
  const [barcode, setBarcode] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [scanMode, setScanMode] = useState<'auto' | 'manual'>('auto');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on input
  useEffect(() => {
    if (inputRef.current && scanMode === 'auto') {
      inputRef.current.focus();
    }
  }, [scanMode, lastResult]);

  // Handle auto scan input
  const handleAutoScanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setBarcode(value);
    
    // Detect when barcode scanner sends Enter or Tab
    if (value.includes('\n') || value.includes('\t')) {
      const cleanBarcode = value.replace(/\n|\t/g, '').trim();
      if (cleanBarcode) {
        onScan(cleanBarcode);
        setBarcode('');
      }
    }
    
    // Auto-submit after certain length (typical barcode length)
    if (value.length >= 8 && value.length <= 20 && /^\d+$/.test(value)) {
      setTimeout(() => {
        onScan(value);
        setBarcode('');
      }, 100);
    }
  };

  // Handle manual scan submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  };

  // Handle key press for auto scan
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && barcode.trim()) {
      onScan(barcode.trim());
      setBarcode('');
    }
  };

  // Clear input
  const handleClear = () => {
    setBarcode('');
    setManualInput('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Get status color
  const getStatusColor = () => {
    switch (lastResult) {
      case 'FOUND': return 'border-green-500 bg-green-50';
      case 'NOT_FOUND': return 'border-red-500 bg-red-50';
      case 'DUPLICATE': return 'border-yellow-500 bg-yellow-50';
      case 'ERROR': return 'border-red-500 bg-red-50';
      default: return 'border-gray-300 bg-white';
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="flex border border-gray-300 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setScanMode('auto')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            scanMode === 'auto'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <i className="fa-solid fa-barcode mr-2"></i>
          Auto Scan
        </button>
        <button
          type="button"
          onClick={() => setScanMode('manual')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            scanMode === 'manual'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <i className="fa-solid fa-keyboard mr-2"></i>
          Manual Input
        </button>
      </div>

      {/* Auto Scan Mode */}
      {scanMode === 'auto' && (
        <div className="space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={barcode}
              onChange={handleAutoScanChange}
              onKeyPress={handleKeyPress}
              placeholder="Scan barcode automatically..."
              className={`w-full p-4 border-2 rounded-xl text-lg font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                getStatusColor()
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isProcessing}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
            />
            {barcode && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <i className="fa-solid fa-times"></i>
              </button>
            )}
          </div>
          
          <div className="text-sm text-gray-500 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-info-circle"></i>
              <span>Auto-detect barcode scanner input</span>
            </div>
            <span className="font-mono">{barcode.length} chars</span>
          </div>
        </div>
      )}

      {/* Manual Input Mode */}
      {scanMode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Enter barcode manually..."
              className={`w-full p-4 border-2 rounded-xl text-lg font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                getStatusColor()
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isProcessing}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
            />
            {manualInput && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <i className="fa-solid fa-times"></i>
              </button>
            )}
          </div>
          
          <button
            type="submit"
            disabled={isProcessing || !manualInput.trim()}
            className={`w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold flex justify-center items-center gap-2 text-lg transition-all duration-200 ${
              isProcessing || !manualInput.trim() ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isProcessing ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                Processing...
              </>
            ) : (
              <>
                <i className="fa-solid fa-check"></i>
                Submit Barcode
              </>
            )}
          </button>
        </form>
      )}

      {/* Scanner Status */}
      <div className={`p-3 rounded-lg ${getStatusColor()} transition-all duration-300`}>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            lastResult === 'FOUND' ? 'bg-green-500' :
            lastResult === 'NOT_FOUND' ? 'bg-red-500' :
            lastResult === 'DUPLICATE' ? 'bg-yellow-500' :
            lastResult === 'ERROR' ? 'bg-red-500' :
            'bg-gray-400'
          }`}></div>
          <span className="text-sm font-medium">
            {lastResult === 'FOUND' ? '✅ Item Found' :
             lastResult === 'NOT_FOUND' ? '❌ Item Not Found' :
             lastResult === 'DUPLICATE' ? '⚠️ Already Scanned' :
             lastResult === 'ERROR' ? '❌ Scan Error' :
             '📡 Ready to Scan'}
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-1">
          {scanMode === 'auto' 
            ? 'Use barcode scanner or type and press Enter' 
            : 'Enter barcode manually and click Submit'}
        </p>
      </div>

      {/* Quick Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-blue-800 text-sm font-medium flex items-center gap-2">
          <i className="fa-solid fa-lightbulb text-blue-500"></i>
          Quick Tips:
        </p>
        <ul className="text-blue-600 text-xs mt-1 space-y-1">
          <li>• Auto mode works with USB barcode scanners</li>
          <li>• Most barcodes are 8-13 digits</li>
          <li>• Scanner usually adds Enter at the end</li>
          <li>• Manual mode for damaged barcodes</li>
        </ul>
      </div>
    </div>
  );
};

export default ScannerInput;