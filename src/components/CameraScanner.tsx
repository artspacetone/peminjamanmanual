import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { playBeep } from '../services/audioService'

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void
  onClose: () => void
  onError?: (error: string) => void
  autoStart?: boolean
}

const CameraScanner: React.FC<CameraScannerProps> = ({
  onScanSuccess,
  onClose,
  onError,
  autoStart = true
}) => {
  // State
  const [cameras, setCameras] = useState<any[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [isScanning, setIsScanning] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasFlash, setHasFlash] = useState(false)
  const [isFlashOn, setIsFlashOn] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState('')
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [scanCount, setScanCount] = useState(0)
  const [lastScanTime, setLastScanTime] = useState<number>(0)

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerId = `qr-scanner-${Date.now()}`
  const videoTrackRef = useRef<MediaStreamTrack | null>(null)
  const isMounted = useRef(true)
  const startAttempts = useRef(0)

  // Detect device type
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

  // Initialize scanner
  useEffect(() => {
    isMounted.current = true
    
    const initialize = async () => {
      setIsLoading(true)
      
      try {
        // Request camera permission first
        await requestCameraPermission()
        
        // Get available cameras
        await loadCameras()
        
        // Auto-start scanner
        if (autoStart && selectedCameraId) {
          await startScanner(selectedCameraId)
        }
      } catch (err: any) {
        console.error('Scanner initialization error:', err)
        handleError(err)
      } finally {
        if (isMounted.current) {
          setIsLoading(false)
        }
      }
    }

    initialize()

    return () => {
      isMounted.current = false
      stopScanner()
    }
  }, [])

  // Request camera permission
  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      })
      
      // Stop the stream immediately (we'll start it properly with Html5Qrcode)
      stream.getTracks().forEach(track => track.stop())
      
      setPermissionGranted(true)
      return true
    } catch (err: any) {
      console.warn('Camera permission error:', err)
      
      let message = 'Camera permission denied'
      if (err.name === 'NotAllowedError') {
        message = 'Please allow camera access in your browser settings'
      } else if (err.name === 'NotFoundError') {
        message = 'No camera found on this device'
      }
      
      setError(message)
      if (onError) onError(message)
      return false
    }
  }

  // Load available cameras
  const loadCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras()
      
      if (!devices || devices.length === 0) {
        throw new Error('No cameras found')
      }

      if (isMounted.current) {
        setCameras(devices)
        
        // Select optimal camera
        let optimalCameraId = devices[0].id
        
        // Try to find back camera
        const backCamera = devices.find(cam => 
          cam.label?.toLowerCase().includes('back') ||
          cam.label?.toLowerCase().includes('rear') ||
          cam.label?.toLowerCase().includes('environment')
        )
        
        if (backCamera) {
          optimalCameraId = backCamera.id
        }
        
        // For iOS, try to find camera with label '2' (usually back camera)
        if (isIOS && devices.length > 1) {
          const iosBackCamera = devices.find(cam => cam.label?.includes('2'))
          if (iosBackCamera) {
            optimalCameraId = iosBackCamera.id
          }
        }
        
        setSelectedCameraId(optimalCameraId)
      }
    } catch (err: any) {
      console.error('Load cameras error:', err)
      setError('Failed to load cameras')
    }
  }

  // Start scanner
  const startScanner = async (cameraId: string) => {
    if (!isMounted.current || !cameraId) return

    // Stop existing scanner
    await stopScanner()
    
    setIsLoading(true)
    setError('')
    startAttempts.current++

    try {
      // Clean container
      const container = document.getElementById(containerId)
      if (container) container.innerHTML = ''

      // Create new scanner instance
      const html5QrCode = new Html5Qrcode(containerId)
      scannerRef.current = html5QrCode

      // Platform-specific constraints
      let constraints: any
      
      if (isIOS) {
        // iOS Safari works better with facingMode
        constraints = {
          facingMode: { ideal: 'environment' },
          width: { min: 640, ideal: 1280 },
          height: { min: 480, ideal: 720 }
        }
      } else {
        constraints = {
          deviceId: { exact: cameraId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }

      // Scanner configuration
      const config = {
        fps: isIOS ? 10 : 20,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A
        ]
      }

      // Start scanning
      await html5QrCode.start(
        constraints,
        config,
        (decodedText) => {
          handleScanSuccess(decodedText)
        },
        (errorMessage) => {
          // Non-fatal scanning errors
          console.log('Scan error:', errorMessage)
        }
      )

      // Success
      if (isMounted.current) {
        setIsScanning(true)
        setIsLoading(false)
        
        // Setup camera features
        setTimeout(() => {
          setupCameraFeatures()
        }, 500)
      }

    } catch (err: any) {
      console.error('Start scanner error:', err)
      
      if (isMounted.current) {
        setIsLoading(false)
        
        // Try fallback for iOS
        if (isIOS && startAttempts.current < 3) {
          setTimeout(() => startScannerWithFallback(), 1000)
        } else {
          setError(`Failed to start camera: ${err.message || 'Unknown error'}`)
        }
      }
    }
  }

  // Fallback scanner for iOS
  const startScannerWithFallback = async () => {
    if (!scannerRef.current) return
    
    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop()
      }

      const minimalConfig = {
        fps: 5,
        qrbox: { width: 200, height: 200 },
        aspectRatio: 1.0
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        minimalConfig,
        (decodedText) => {
          handleScanSuccess(decodedText)
        },
        () => {}
      )

      if (isMounted.current) {
        setIsScanning(true)
        setIsLoading(false)
      }

    } catch (fallbackErr) {
      console.error('Fallback failed:', fallbackErr)
      setError('Failed to start camera with fallback method')
    }
  }

  // Setup camera features after start
  const setupCameraFeatures = () => {
    const videoElement = document.querySelector(`#${containerId} video`) as HTMLVideoElement
    if (!videoElement || !videoElement.srcObject) return

    const stream = videoElement.srcObject as MediaStream
    const track = stream.getVideoTracks()[0]
    videoTrackRef.current = track

    if (!track || !track.getCapabilities) return

    const capabilities = track.getCapabilities()

    // Check flash support
    if (capabilities.torch || capabilities.fillLightMode) {
      setHasFlash(true)
    }

    // Setup tap-to-focus for mobile
    if (isMobile) {
      setupTapToFocus(videoElement)
    }
  }

  // Setup tap-to-focus
  const setupTapToFocus = (videoElement: HTMLVideoElement) => {
    videoElement.addEventListener('click', (e) => {
      if (!videoTrackRef.current) return

      const track = videoTrackRef.current
      const capabilities = track.getCapabilities()

      if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
        try {
          track.applyConstraints({
            advanced: [{ focusMode: 'manual' }] as any
          })
        } catch (err) {
          console.log('Tap focus not supported')
        }
      }

      // Show visual feedback
      showFocusFeedback(e.clientX, e.clientY)
    })
  }

  // Show focus feedback
  const showFocusFeedback = (x: number, y: number) => {
    const container = document.getElementById(containerId)
    if (!container) return

    // Remove existing indicator
    const existingIndicator = container.querySelector('.focus-indicator')
    if (existingIndicator) existingIndicator.remove()

    // Create new indicator
    const indicator = document.createElement('div')
    indicator.className = 'focus-indicator'
    indicator.style.position = 'absolute'
    indicator.style.left = `${x - 30}px`
    indicator.style.top = `${y - 30}px`
    indicator.style.width = '60px'
    indicator.style.height = '60px'
    indicator.style.border = '2px solid #00ff00'
    indicator.style.borderRadius = '50%'
    indicator.style.zIndex = '1000'
    indicator.style.pointerEvents = 'none'
    indicator.style.animation = 'focusPulse 1s ease-out'

    container.appendChild(indicator)

    // Remove after animation
    setTimeout(() => {
      if (indicator.parentNode) indicator.remove()
    }, 1000)
  }

  // Handle scan success
  const handleScanSuccess = (decodedText: string) => {
    // Debounce scans
    const now = Date.now()
    if (now - lastScanTime < 500) return
    setLastScanTime(now)

    // Play success sound
    playBeep('SUCCESS')

    // Update scan count
    setScanCount(prev => prev + 1)

    // Call success handler
    onScanSuccess(decodedText)

    // Auto-stop scanner after successful scan
    setTimeout(() => {
      stopScanner()
      onClose()
    }, 1000)
  }

  // Stop scanner
  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch (err) {
        console.error('Stop scanner error:', err)
      }
    }

    // Turn off flash
    if (isFlashOn && videoTrackRef.current) {
      try {
        const track = videoTrackRef.current
        if ('torch' in track.getCapabilities()) {
          await track.applyConstraints({
            advanced: [{ torch: false }] as any
          })
        }
      } catch (err) {
        // Ignore
      }
      setIsFlashOn(false)
    }

    if (isMounted.current) {
      setIsScanning(false)
      videoTrackRef.current = null
    }
  }

  // Toggle flash
  const toggleFlash = async () => {
    if (!videoTrackRef.current || !hasFlash) return

    try {
      const track = videoTrackRef.current
      const capabilities = track.getCapabilities()

      if ('torch' in capabilities) {
        await track.applyConstraints({
          advanced: [{ torch: !isFlashOn }] as any
        })
        setIsFlashOn(!isFlashOn)
      }
    } catch (err) {
      console.error('Flash toggle error:', err)
      setHasFlash(false)
    }
  }

  // Switch camera
  const switchCamera = async (cameraId: string) => {
    setSelectedCameraId(cameraId)
    await stopScanner()
    await startScanner(cameraId)
  }

  // Handle error
  const handleError = (err: any) => {
    let message = 'Scanner error occurred'
    if (err.message) message = err.message
    if (err.name === 'NotAllowedError') message = 'Camera access denied'
    if (err.name === 'NotFoundError') message = 'Camera not found'

    setError(message)
    if (onError) onError(message)
  }

  // Manual start scanner
  const handleManualStart = async () => {
    if (selectedCameraId) {
      await startScanner(selectedCameraId)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-4 flex justify-between items-center z-50 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
            aria-label="Close scanner"
          >
            <i className="fa-solid fa-arrow-left text-white"></i>
          </button>
          <div>
            <h1 className="text-white font-bold text-lg">QR Code Scanner</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-300">
                Scans: <span className="font-bold text-green-400">{scanCount}</span>
              </span>
              {isIOS && (
                <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-1 rounded-full">
                  iOS
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isScanning && hasFlash && (
            <button
              onClick={toggleFlash}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isFlashOn 
                  ? 'bg-yellow-500 text-black' 
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
              aria-label={isFlashOn ? 'Turn off flash' : 'Turn on flash'}
            >
              <i className="fa-solid fa-bolt text-lg"></i>
            </button>
          )}
        </div>
      </div>

      {/* Scanner Area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {/* Scanner Container */}
        <div 
          id={containerId}
          className="absolute inset-0 w-full h-full"
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-blue-500/30 rounded-full"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
            <p className="text-white font-medium mt-4">Initializing camera...</p>
          </div>
        )}

        {/* Error Overlay */}
        {error && !isLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black p-6">
            <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-6 max-w-md text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                <i className="fa-solid fa-triangle-exclamation text-2xl text-red-400"></i>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">Camera Error</h3>
              <p className="text-red-200 mb-4">{error}</p>
              <div className="space-y-3">
                <button
                  onClick={handleManualStart}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg"
                >
                  Close Scanner
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Start Overlay */}
        {!isScanning && !isLoading && !error && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 via-black to-gray-900 p-6">
            <div className="text-center space-y-6 max-w-md">
              <div className="space-y-3">
                <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-full flex items-center justify-center border border-blue-500/20">
                  <i className="fa-solid fa-camera text-4xl text-blue-400"></i>
                </div>
                <h2 className="text-2xl font-bold text-white">Camera Ready</h2>
                <p className="text-gray-300">
                  Press start to begin scanning QR codes and barcodes
                </p>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={handleManualStart}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-lg py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3"
                >
                  <i className="fa-solid fa-play"></i>
                  Start Camera
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scanning Overlay */}
        {isScanning && !isLoading && (
          <>
            {/* Scanning Frame */}
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="scan-frame">
                <div className="scan-frame-corner-bottom-left"></div>
                <div className="scan-frame-corner-bottom-right"></div>
                <div className="scan-line"></div>
                <div className="overlay-mask"></div>
              </div>
            </div>
            
            {/* Instructions */}
            <div className="absolute bottom-24 left-0 right-0 z-20 flex justify-center px-4">
              <div className="bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full">
                <p className="text-white text-sm">
                  Point camera at QR/Barcode
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Controls Footer */}
      <div className="bg-gradient-to-t from-gray-900 to-gray-800 p-4 border-t border-gray-700">
        {/* Camera Selection */}
        {cameras.length > 1 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <i className="fa-solid fa-camera text-blue-400"></i>
              <span className="text-white font-medium text-sm">Select Camera</span>
            </div>
            <select
              className="w-full bg-gray-800 border border-gray-600 rounded-lg py-3 px-4 text-white text-sm focus:outline-none focus:border-blue-500"
              value={selectedCameraId}
              onChange={(e) => switchCamera(e.target.value)}
              disabled={isLoading}
            >
              {cameras.map((camera, index) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label || `Camera ${index + 1}`}
                  {selectedCameraId === camera.id && ' ✓'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {isScanning ? (
            <>
              <button
                onClick={stopScanner}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-stop"></i>
                Stop Scanner
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-check"></i>
                Done ({scanCount} scans)
              </button>
            </>
          ) : !error ? (
            <button
              onClick={handleManualStart}
              disabled={isLoading || !permissionGranted}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-play"></i>
              Start Scanner
            </button>
          ) : (
            <button
              onClick={handleManualStart}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-rotate-right"></i>
              Try Again
            </button>
          )}
        </div>

        {/* Camera Tips */}
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <p className="text-gray-400 text-xs text-center">
            {isMobile ? 'Hold steady for best results' : 'Position QR code within frame'}
          </p>
        </div>
      </div>

      {/* Custom CSS */}
      <style>{`
        @keyframes focusPulse {
          0% {
            transform: scale(0.8);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.1);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}

export default CameraScanner