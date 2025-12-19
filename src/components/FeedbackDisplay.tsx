// components/FeedbackDisplay.tsx
import React from 'react';
import { ScanFeedback } from '../types/index.ts';

interface FeedbackDisplayProps {
  feedback: ScanFeedback;
}

const FeedbackDisplay: React.FC<FeedbackDisplayProps> = ({ feedback }) => {
  const { status, message, item } = feedback;

  // Get styling based on status
  const getStatusStyles = () => {
    switch (status) {
      case 'FOUND':
        return {
          container: 'bg-gradient-to-br from-green-50 to-green-100 border-green-300',
          icon: 'fa-check-circle text-green-600',
          iconBg: 'bg-green-100',
          text: 'text-green-800',
          border: 'border-green-400'
        };
      case 'NOT_FOUND':
        return {
          container: 'bg-gradient-to-br from-red-50 to-red-100 border-red-300',
          icon: 'fa-times-circle text-red-600',
          iconBg: 'bg-red-100',
          text: 'text-red-800',
          border: 'border-red-400'
        };
      case 'DUPLICATE':
        return {
          container: 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300',
          icon: 'fa-exclamation-circle text-yellow-600',
          iconBg: 'bg-yellow-100',
          text: 'text-yellow-800',
          border: 'border-yellow-400'
        };
      case 'ERROR':
        return {
          container: 'bg-gradient-to-br from-red-50 to-red-100 border-red-300',
          icon: 'fa-exclamation-triangle text-red-600',
          iconBg: 'bg-red-100',
          text: 'text-red-800',
          border: 'border-red-400'
        };
      case 'PROCESSING':
        return {
          container: 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300',
          icon: 'fa-spinner fa-spin text-blue-600',
          iconBg: 'bg-blue-100',
          text: 'text-blue-800',
          border: 'border-blue-400'
        };
      case 'SUCCESS':
        return {
          container: 'bg-gradient-to-br from-green-50 to-green-100 border-green-300',
          icon: 'fa-check-circle text-green-600',
          iconBg: 'bg-green-100',
          text: 'text-green-800',
          border: 'border-green-400'
        };
      default: // IDLE
        return {
          container: 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-300',
          icon: 'fa-barcode text-gray-600',
          iconBg: 'bg-gray-100',
          text: 'text-gray-800',
          border: 'border-gray-400'
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <div className={`rounded-xl border-2 p-6 shadow-sm transition-all duration-300 ${styles.container} ${styles.border}`}>
      {/* Status Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-full ${styles.iconBg}`}>
            <i className={`fa-solid text-2xl ${styles.icon}`}></i>
          </div>
          <div>
            <h3 className={`text-lg font-bold ${styles.text}`}>
              {status === 'FOUND' ? 'Item Found!' :
               status === 'NOT_FOUND' ? 'Item Not Found' :
               status === 'DUPLICATE' ? 'Already Scanned' :
               status === 'ERROR' ? 'Error' :
               status === 'PROCESSING' ? 'Processing...' :
               status === 'SUCCESS' ? 'Success!' :
               'Ready to Scan'}
            </h3>
            <p className="text-sm text-gray-600">
              {status === 'IDLE' ? 'Waiting for barcode scan...' :
               status === 'PROCESSING' ? 'Please wait...' :
               new Date().toLocaleTimeString('id-ID')}
            </p>
          </div>
        </div>
        
        {/* Status Indicator */}
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${styles.text} ${styles.iconBg}`}>
          {status}
        </div>
      </div>

      {/* Main Message */}
      <div className="mb-4">
        <div className={`text-2xl font-bold text-center p-4 rounded-lg ${styles.text} bg-white/50`}>
          {message}
        </div>
      </div>

      {/* Item Details (if available) */}
      {item && status === 'FOUND' && (
        <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
          <h4 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <i className="fa-solid fa-info-circle text-blue-500"></i>
            Item Details
          </h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Barcode</p>
              <p className="font-mono font-bold text-gray-800">{item.barcode}</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Name</p>
              <p className="font-medium text-gray-800">{item.item_name}</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Brand</p>
              <p className="font-medium text-gray-800">{item.brand || '-'}</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Color</p>
              <p className="font-medium text-gray-800">{item.color || '-'}</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Size</p>
              <p className="font-medium text-gray-800">{item.size || '-'}</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Price</p>
              <p className="font-medium text-gray-800">
                {item.price ? new Intl.NumberFormat('id-ID', {
                  style: 'currency',
                  currency: 'IDR',
                  minimumFractionDigits: 0
                }).format(item.price) : '-'}
              </p>
            </div>
          </div>
          
          {item.receive_no && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">Receive No.</p>
              <p className="font-medium text-gray-800">{item.receive_no}</p>
            </div>
          )}
        </div>
      )}

      {/* Scan Instructions */}
      {status === 'IDLE' && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
            <i className="fa-solid fa-graduation-cap text-blue-500"></i>
            How to Scan
          </h4>
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• Point barcode scanner at item barcode</li>
            <li>• Press scanner trigger button</li>
            <li>• Scanner will beep on successful read</li>
            <li>• Item status updates automatically</li>
          </ul>
        </div>
      )}

      {/* Status Legend */}
      <div className="mt-6 pt-4 border-t border-gray-300">
        <h5 className="text-xs font-bold text-gray-500 uppercase mb-2">Status Legend</h5>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-xs text-gray-600">Found</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-xs text-gray-600">Not Found</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-xs text-gray-600">Duplicate</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-600">Processing</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackDisplay;