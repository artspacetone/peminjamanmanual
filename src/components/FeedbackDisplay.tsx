import React, { useEffect, useState } from 'react'
import { ScanFeedback, getStatusColor, getStatusIcon, formatPrice, formatDate } from '../types'

interface FeedbackDisplayProps {
  feedback: ScanFeedback
  autoClear?: boolean
  clearTimeout?: number
}

const FeedbackDisplay: React.FC<FeedbackDisplayProps> = ({
  feedback,
  autoClear = true,
  clearTimeout = 3000
}) => {
  const [visible, setVisible] = useState(false)
  const [countdown, setCountdown] = useState(clearTimeout / 1000)

  // Show/hide animation
  useEffect(() => {
    if (feedback.status !== 'IDLE') {
      setVisible(true)
      setCountdown(clearTimeout / 1000)
    } else {
      setVisible(false)
    }
  }, [feedback.status, clearTimeout])

  // Auto clear feedback
  useEffect(() => {
    if (autoClear && feedback.status !== 'IDLE' && feedback.status !== 'PROCESSING') {
      const timer = setTimeout(() => {
        setVisible(false)
      }, clearTimeout)

      const countdownTimer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimer)
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => {
        clearTimeout(timer)
        clearInterval(countdownTimer)
      }
    }
  }, [feedback.status, autoClear, clearTimeout])

  // Get status text color
  const getStatusText = () => {
    switch (feedback.status) {
      case 'FOUND':
        return 'Scan Successful'
      case 'NOT_FOUND':
        return 'Item Not Found'
      case 'DUPLICATE':
        return 'Already Scanned'
      case 'ERROR':
        return 'Error Occurred'
      case 'PROCESSING':
        return 'Processing...'
      case 'SCANNING':
        return 'Scanning...'
      default:
        return 'Ready to Scan'
    }
  }

  // Get status icon
  const getStatusEmoji = () => {
    switch (feedback.status) {
      case 'FOUND':
        return '🎉'
      case 'NOT_FOUND':
        return '❌'
      case 'DUPLICATE':
        return '⚠️'
      case 'ERROR':
        return '🚨'
      case 'PROCESSING':
        return '⏳'
      case 'SCANNING':
        return '📷'
      default:
        return '📦'
    }
  }

  // Handle manual close
  const handleClose = () => {
    setVisible(false)
  }

  if (!visible || feedback.status === 'IDLE') {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-6 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
          <i className="fa-solid fa-barcode text-2xl text-gray-400"></i>
        </div>
        <h3 className="text-lg font-bold text-gray-700 mb-2">Waiting for Scan</h3>
        <p className="text-gray-500 text-sm">Enter barcode or use camera to scan items</p>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl border-2 ${getStatusColor(feedback.status)} p-6 animate-slide-up`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center">
            <span className="text-2xl">{getStatusEmoji()}</span>
          </div>
          <div>
            <h3 className="text-xl font-bold">{getStatusText()}</h3>
            <p className="text-sm opacity-80">{feedback.message}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {autoClear && feedback.status !== 'PROCESSING' && (
            <div className="text-xs font-mono bg-white/30 px-2 py-1 rounded">
              {countdown}s
            </div>
          )}
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/50 hover:bg-white flex items-center justify-center transition-colors"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
      </div>

      {/* Item Details */}
      {feedback.item && (
        <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 mb-4 border border-white/30">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-bold text-lg">{feedback.item.item_name}</h4>
              <p className="text-sm text-gray-600">
                <i className="fa-solid fa-barcode mr-2"></i>
                {feedback.item.barcode}
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-blue-600">
                {formatPrice(feedback.item.price)}
              </div>
              <div className="text-xs text-gray-500">
                {feedback.item.type}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-white/80 rounded-lg p-2">
              <p className="text-xs text-gray-500">Status</p>
              <p className="font-medium">{feedback.item.status}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-2">
              <p className="text-xs text-gray-500">Color</p>
              <p className="font-medium">{feedback.item.color}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-2">
              <p className="text-xs text-gray-500">Brand</p>
              <p className="font-medium">{feedback.item.brand}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-2">
              <p className="text-xs text-gray-500">Scanned</p>
              <p className="font-medium">
                {feedback.item.is_scanned ? (
                  <span className="text-green-600">
                    <i className="fa-solid fa-check mr-1"></i>
                    Yes
                  </span>
                ) : (
                  <span className="text-red-600">
                    <i className="fa-solid fa-xmark mr-1"></i>
                    No
                  </span>
                )}
              </p>
            </div>
          </div>
          
          {feedback.item.scan_timestamp && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                <i className="fa-solid fa-clock mr-1"></i>
                Scanned at: {formatDate(feedback.item.scan_timestamp)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Processing Indicator */}
      {(feedback.status === 'PROCESSING' || feedback.status === 'SCANNING') && (
        <div className="text-center py-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">
            {feedback.status === 'SCANNING' ? 'Scanning with camera...' : 'Processing scan...'}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      {feedback.item && (
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-rotate-right"></i>
            Scan Another
          </button>
          <button
            onClick={() => {
              // Copy barcode to clipboard
              navigator.clipboard.writeText(feedback.item!.barcode)
            }}
            className="px-4 bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium py-3 rounded-xl transition-colors"
          >
            <i className="fa-solid fa-copy"></i>
          </button>
        </div>
      )}
    </div>
  )
}

export default FeedbackDisplay