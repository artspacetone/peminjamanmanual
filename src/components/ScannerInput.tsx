import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { ScanResult } from '../types'

interface ScannerInputProps {
  onScan: (barcode: string) => void
  lastResult?: ScanResult
  isProcessing?: boolean
  placeholder?: string
  autoFocus?: boolean
}

const ScannerInput: React.FC<ScannerInputProps> = ({
  onScan,
  lastResult,
  isProcessing = false,
  placeholder = 'Enter barcode or scan QR code',
  autoFocus = true
}) => {
  const [inputValue, setInputValue] = useState('')
  const [scanHistory, setScanHistory] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    processBarcode()
  }

  // Process barcode
  const processBarcode = () => {
    const trimmedValue = inputValue.trim()
    if (!trimmedValue || isProcessing) return

    // Add to history
    setScanHistory(prev => [trimmedValue, ...prev.slice(0, 9)])

    // Call onScan callback
    onScan(trimmedValue)

    // Clear input
    setInputValue('')

    // Re-focus input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
      }
    }, 100)
  }

  // Handle Enter key press
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      processBarcode()
    }
    
    // Handle paste (Ctrl+V or Cmd+V)
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      // Clear input value to allow pasting
      setTimeout(() => {
        if (inputRef.current) {
          const pastedValue = inputRef.current.value.trim()
          if (pastedValue && pastedValue !== inputValue) {
            setInputValue(pastedValue)
          }
        }
      }, 10)
    }
  }

  // Get input border color based on last result
  const getBorderColor = () => {
    switch (lastResult) {
      case 'FOUND':
        return 'border-green-500 focus:border-green-500 focus:ring-green-500/30'
      case 'NOT_FOUND':
        return 'border-red-500 focus:border-red-500 focus:ring-red-500/30'
      case 'DUPLICATE':
        return 'border-yellow-500 focus:border-yellow-500 focus:ring-yellow-500/30'
      case 'ERROR':
        return 'border-red-500 focus:border-red-500 focus:ring-red-500/30'
      default:
        return 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/30'
    }
  }

  // Get input background color based on last result
  const getBackgroundColor = () => {
    switch (lastResult) {
      case 'FOUND':
        return 'bg-green-50'
      case 'NOT_FOUND':
        return 'bg-red-50'
      case 'DUPLICATE':
        return 'bg-yellow-50'
      case 'ERROR':
        return 'bg-red-50'
      default:
        return 'bg-white'
    }
  }

  // Clear scan history
  const clearHistory = () => {
    setScanHistory([])
  }

  // Select from history
  const selectFromHistory = (barcode: string) => {
    setInputValue(barcode)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  return (
    <div className="space-y-4">
      {/* Scanner Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            placeholder={placeholder}
            className={`w-full px-5 py-4 text-lg rounded-xl border-2 ${getBorderColor()} ${getBackgroundColor()} focus:outline-none focus:ring-4 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-mono`}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          
          {/* Scan Icon */}
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
            {isProcessing ? (
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <i className="fa-solid fa-barcode text-2xl text-gray-400"></i>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!inputValue.trim() || isProcessing}
            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-600 disabled:hover:to-blue-700 flex items-center justify-center gap-3"
          >
            <i className="fa-solid fa-magnifying-glass"></i>
            {isProcessing ? 'Processing...' : 'Scan Barcode'}
          </button>
          
          <button
            type="button"
            onClick={() => {
              setInputValue('')
              if (inputRef.current) {
                inputRef.current.focus()
              }
            }}
            disabled={!inputValue || isProcessing}
            className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      </form>

      {/* Scan History */}
      {scanHistory.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <i className="fa-solid fa-clock-rotate-left"></i>
              Recent Scans ({scanHistory.length})
            </h3>
            <button
              onClick={clearHistory}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Clear All
            </button>
          </div>
          
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {scanHistory.map((barcode, index) => (
              <div
                key={`${barcode}-${index}`}
                onClick={() => selectFromHistory(barcode)}
                className="group bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg p-3 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-barcode text-sm"></i>
                    </div>
                    <div>
                      <p className="font-mono font-bold text-gray-800">{barcode}</p>
                      <p className="text-xs text-gray-500">
                        {index === 0 ? 'Latest scan' : `${index + 1} scans ago`}
                      </p>
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-700 transition-opacity">
                    <i className="fa-solid fa-arrow-right"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
          <i className="fa-solid fa-keyboard"></i>
          Keyboard Shortcuts
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">Enter</kbd>
            <span className="text-xs text-blue-700">Scan barcode</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">Ctrl+V</kbd>
            <span className="text-xs text-blue-700">Paste barcode</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">Esc</kbd>
            <span className="text-xs text-blue-700">Clear input</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">Tab</kbd>
            <span className="text-xs text-blue-700">Next field</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ScannerInput