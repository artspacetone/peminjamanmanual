import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
  onError?: (error: string) => void;
}

// Device detection
const isIOS = () => {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isSafari = () => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

const isIOSDevice = isIOS();
const isSafariBrowser = isSafari();

// Optimal configuration for different platforms
const getScannerConfig = () => {
  if (isIOSDevice) {
    return {
      fps: 10, // Lower FPS for iOS stability
      qrbox: { width: 200, height: 200 },
      aspectRatio: 9/16, // iOS prefers 9:16 portrait
      disableFlip: false,
      rememberLastUsedCamera: true,
      showZoomSliderIfSupported: false,
      showTorchButtonIfSupported: false,
      defaultZoomValueIfSupported: 1,
      supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.EAN_13,
      ]
    };
  }
  
  return {
    fps: 30,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
    disableFlip: false,
    rememberLastUsedCamera: true,
    showZoomSliderIfSupported: true,
    showTorchButtonIfSupported: true,
    defaultZoomValueIfSupported: 1,
    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.CODABAR,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.AZTEC,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.PDF_417,
      Html5QrcodeSupportedFormats.MAXICODE,
    ],
  };
};

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose, onError }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [iosPermissionRequested, setIosPermissionRequested] = useState(false);
  
  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = `reader-custom-view-${Math.random().toString(36).substr(2, 9)}`;
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isMountedRef = useRef(true);
  const lastScanTimeRef = useRef<number>(0);
  const retryCountRef = useRef(0);
  const scanDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize component
  useEffect(() => {
    isMountedRef.current = true;
    
    // Pre-warm camera permissions for iOS
    if (isIOSDevice) {
      requestIOSPermissions();
    } else {
      initializeCameras();
    }

    return () => {
      isMountedRef.current = false;
      stopScanner();
      if (scanDebounceRef.current) {
        clearTimeout(scanDebounceRef.current);
      }
    };
  }, []);

  // Request iOS permissions (must be triggered by user gesture)
  const requestIOSPermissions = async () => {
    try {
      // Create a temporary video element to trigger permission request
      const tempVideo = document.createElement('video');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      });
      
      // Immediately stop the stream
      stream.getTracks().forEach(track => track.stop());
      setIosPermissionRequested(true);
      
      // Initialize cameras after permission
      setTimeout(() => initializeCameras(), 100);
    } catch (error) {
      console.warn('iOS Permission pre-warm failed:', error);
      setIosPermissionRequested(true);
      // Still try to initialize
      setTimeout(() => initializeCameras(), 100);
    }
  };

  // Initialize cameras with retry logic
  const initializeCameras = useCallback(async (retryCount = 0) => {
    if (!isMountedRef.current) return;
    
    setIsInitializing(true);
    setPermissionError(false);

    try {
      // Get available cameras
      const devices = await Html5Qrcode.getCameras();
      
      if (!devices || devices.length === 0) {
        throw new Error('No cameras found');
      }

      if (isMountedRef.current) {
        setCameras(devices);
        
        // Try to get last used camera from localStorage
        const lastCameraId = localStorage.getItem('lastCameraId');
        let targetCameraId = '';
        
        // iOS-specific camera selection
        if (isIOSDevice) {
          // iOS Safari has limited camera support
          // Try to find back camera first
          const backCamera = devices.find(camera => 
            camera.label.toLowerCase().includes('back') ||
            camera.label.toLowerCase().includes('rear') ||
            camera.label.toLowerCase().includes('environment') ||
            camera.label.match(/2$/) // iOS often marks back camera as "2"
          );
          
          if (backCamera) {
            targetCameraId = backCamera.id;
          } else if (devices.length > 1) {
            // Try second camera (usually back on iOS)
            targetCameraId = devices[1].id;
          } else {
            // Fallback to first camera
            targetCameraId = devices[0].id;
          }
        } else {
          // Android/Desktop: Use saved or find back camera
          if (lastCameraId && devices.some(d => d.id === lastCameraId)) {
            targetCameraId = lastCameraId;
          } else {
            const backCamera = devices.find(camera => 
              camera.label.toLowerCase().includes('back') ||
              camera.label.toLowerCase().includes('rear') ||
              camera.label.toLowerCase().includes('environment')
            );
            targetCameraId = backCamera ? backCamera.id : devices[0].id;
          }
        }
        
        setSelectedCameraId(targetCameraId);
        
        // Don't auto-start on iOS - wait for user to click
        if (!isIOSDevice && targetCameraId) {
          await startScanner(targetCameraId);
        }
      }
    } catch (error: any) {
      console.error('Camera initialization error:', error);
      
      if (isMountedRef.current) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setPermissionError(true);
          if (onError) {
            onError('Camera permission denied. Please allow camera access in your browser settings.');
          }
        } else if (retryCount < 3) {
          // Retry with exponential backoff
          retryCountRef.current = retryCount + 1;
          setTimeout(() => initializeCameras(retryCount + 1), 1000 * Math.pow(2, retryCount));
          return;
        } else {
          setPermissionError(true);
          if (onError) {
            onError('Failed to access camera. Please ensure camera is available and not being used by another application.');
          }
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsInitializing(false);
      }
    }
  }, [onError]);

  // Optimized scanner start
  const startScanner = async (cameraId: string) => {
    if (!isMountedRef.current || !cameraId) return;
    
    // Debounce start requests
    if (scannerRef.current?.isScanning) {
      await stopScanner();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    setIsLoading(true);
    setPermissionError(false);
    
    try {
      // Clean container
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = '';
      }
      
      // Initialize scanner
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;
      
      // Platform-specific constraints
      let constraints: MediaStreamConstraints;
      
      if (isIOSDevice) {
        // iOS Safari requires specific constraints
        constraints = {
          video: {
            deviceId: cameraId ? { exact: cameraId } : undefined,
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
            aspectRatio: { exact: 16/9 }
          },
          audio: false
        };
      } else {
        constraints = {
          video: {
            deviceId: { exact: cameraId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
            facingMode: { ideal: 'environment' }
          },
          audio: false
        };
      }
      
      // Start scanning with optimized config
      await html5QrCode.start(
        constraints,
        getScannerConfig(),
        (decodedText) => {
          // Debounce scan events (prevent multiple scans)
          const now = Date.now();
          if (now - lastScanTimeRef.current < 1000) return; // 1 second debounce
          lastScanTimeRef.current = now;
          
          // Success feedback
          if (navigator.vibrate) {
            navigator.vibrate([50, 50, 50]);
          }
          
          // Play success sound
          playScanSuccessSound();
          
          // Update state
          setScanCount(prev => prev + 1);
          
          // Call success handler
          onScanSuccess(decodedText);
          
          // Auto-restart scanner after delay
          scanDebounceRef.current = setTimeout(() => {
            if (isMountedRef.current && scannerRef.current?.isScanning) {
              // Clear previous results for fresh scan
              const containerEl = document.getElementById(containerId);
              if (containerEl) {
                const canvas = containerEl.querySelector('canvas');
                if (canvas) {
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                  }
                }
              }
            }
          }, 1500);
        },
        (errorMessage) => {
          // Non-fatal scanning errors
          console.log('Scan error:', errorMessage);
        }
      );
      
      // Scanner started successfully
      if (isMountedRef.current) {
        setIsScanning(true);
        setIsLoading(false);
        setCameraReady(true);
        
        // Save camera preference
        localStorage.setItem('lastCameraId', cameraId);
        
        // Setup camera capabilities after a delay
        setTimeout(() => {
          setupCameraCapabilities();
        }, 800);
      }
      
    } catch (error: any) {
      console.error('Scanner start error:', error);
      
      if (isMountedRef.current) {
        setIsLoading(false);
        
        if (error.name === 'NotAllowedError') {
          setPermissionError(true);
          if (onError) {
            onError('Camera access was denied. Please check browser permissions.');
          }
        } else if (error.name === 'NotFoundError') {
          setPermissionError(true);
          if (onError) {
            onError('Camera not found. Please check if camera is available.');
          }
        } else if (error.name === 'NotReadableError') {
          // Camera is in use by another application
          setPermissionError(true);
          if (onError) {
            onError('Camera is busy. Please close other applications using the camera.');
          }
        } else {
          // Try fallback method for iOS
          if (isIOSDevice) {
            await fallbackIOSScanner(cameraId);
          } else {
            setPermissionError(true);
          }
        }
      }
    }
  };

  // Fallback for iOS compatibility
  const fallbackIOSScanner = async (cameraId: string) => {
    try {
      if (!scannerRef.current) return;
      
      // Stop if already scanning
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      
      // Simplified constraints for iOS
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { min: 640, ideal: 1280 },
          height: { min: 480, ideal: 720 }
        },
        audio: false
      };
      
      // Simplified config
      const config = {
        fps: 10,
        qrbox: { width: 180, height: 180 },
        aspectRatio: 1.0,
        disableFlip: false
      };
      
      await scannerRef.current.start(
        constraints,
        config,
        (decodedText) => {
          const now = Date.now();
          if (now - lastScanTimeRef.current < 1000) return;
          lastScanTimeRef.current = now;
          
          if (navigator.vibrate) navigator.vibrate(100);
          playScanSuccessSound();
          setScanCount(prev => prev + 1);
          onScanSuccess(decodedText);
        },
        () => {}
      );
      
      if (isMountedRef.current) {
        setIsScanning(true);
        setIsLoading(false);
        setCameraReady(true);
      }
      
    } catch (fallbackError) {
      console.error('iOS fallback failed:', fallbackError);
      setPermissionError(true);
      setIsLoading(false);
    }
  };

  // Setup camera capabilities (zoom, flash)
  const setupCameraCapabilities = () => {
    const videoElement = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    if (!videoElement || !videoElement.srcObject) return;
    
    const stream = videoElement.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    videoTrackRef.current = track;
    
    if (!track || !track.getCapabilities) return;
    
    const capabilities = track.getCapabilities();
    
    // Check for zoom capability
    if (capabilities.zoom) {
      const zoomRange = capabilities.zoom as any;
      setZoomCap({
        min: zoomRange.min || 1,
        max: Math.min(zoomRange.max || 3, 5), // Cap at 5x
        step: zoomRange.step || 0.1
      });
      
      // Set default zoom
      const defaultZoom = Math.max(1.2, zoomRange.min || 1);
      applyZoom(defaultZoom);
    }
    
    // Check for flash/torch capability
    if (capabilities.torch || capabilities.fillLightMode) {
      setHasFlash(true);
    }
  };

  // Apply zoom to camera
  const applyZoom = (value: number) => {
    if (!videoTrackRef.current) return;
    
    setZoom(value);
    
    try {
      videoTrackRef.current.applyConstraints({
        advanced: [{ zoom: value }] as any
      });
    } catch (error) {
      console.warn('Zoom not supported on this device');
    }
  };

  // Toggle flash/torch
  const toggleFlash = async () => {
    if (!videoTrackRef.current || !hasFlash) return;
    
    try {
      const track = videoTrackRef.current;
      const constraints: any = { advanced: [] };
      
      if ('torch' in track.getCapabilities()) {
        constraints.advanced.push({ torch: !isFlashOn });
      } else if ('fillLightMode' in track.getCapabilities()) {
        constraints.advanced.push({ fillLightMode: !isFlashOn ? 'flash' : 'off' });
      }
      
      await track.applyConstraints(constraints);
      setIsFlashOn(!isFlashOn);
    } catch (error) {
      console.error('Failed to toggle flash:', error);
      setHasFlash(false);
    }
  };

  // Stop scanner
  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (error) {
        console.error('Error stopping scanner:', error);
      }
    }
    
    // Turn off flash
    if (isFlashOn && videoTrackRef.current) {
      try {
        const track = videoTrackRef.current;
        const constraints: any = { advanced: [] };
        
        if ('torch' in track.getCapabilities()) {
          constraints.advanced.push({ torch: false });
        } else if ('fillLightMode' in track.getCapabilities()) {
          constraints.advanced.push({ fillLightMode: 'off' });
        }
        
        await track.applyConstraints(constraints);
      } catch (error) {
        // Ignore flash turn-off errors
      }
    }
    
    setIsFlashOn(false);
    setIsScanning(false);
    setCameraReady(false);
    videoTrackRef.current = null;
  };

  // Restart scanner
  const restartScanner = async () => {
    await stopScanner();
    if (selectedCameraId) {
      await startScanner(selectedCameraId);
    }
  };

  // Switch camera
  const switchCamera = async (cameraId: string) => {
    if (cameraId === selectedCameraId) return;
    
    setSelectedCameraId(cameraId);
    await stopScanner();
    await startScanner(cameraId);
  };

  // Manual start (for iOS permission trigger)
  const handleManualStart = async () => {
    if (isIOSDevice && !iosPermissionRequested) {
      await requestIOSPermissions();
    }
    
    if (selectedCameraId) {
      await startScanner(selectedCameraId);
    } else if (cameras.length > 0) {
      await startScanner(cameras[0].id);
    }
  };

  // Play scan success sound
  const playScanSuccessSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      // Audio context not supported
    }
  };

  // Handle camera selection change
  const handleCameraChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newCameraId = event.target.value;
    switchCamera(newCameraId);
  };

  // Render loading state
  const renderLoading = () => (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <div className="relative">
        <div className="w-20 h-20 border-4 border-blue-500/30 rounded-full"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          <p className="text-white text-sm font-medium">Loading Camera...</p>
          {isIOSDevice && (
            <p className="text-blue-300 text-xs mt-1">iOS: Grant camera permission if prompted</p>
          )}
        </div>
      </div>
    </div>
  );

  // Render permission error
  const renderPermissionError = () => (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-black p-6">
      <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-slate-700 shadow-2xl">
        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-red-500/20 to-red-600/10 rounded-full flex items-center justify-center">
          <i className="fa-solid fa-camera-slash text-4xl text-red-400"></i>
        </div>
        
        <h3 className="text-2xl font-bold text-white text-center mb-3">
          Camera Access Required
        </h3>
        
        <div className="space-y-3 mb-8">
          <div className="flex items-start gap-3 p-3 bg-slate-700/50 rounded-lg">
            <i className="fa-solid fa-mobile-screen text-blue-400 mt-1"></i>
            <div>
              <p className="text-white font-medium">Enable Camera Permission:</p>
              <p className="text-slate-300 text-sm mt-1">
                1. Click "Allow Camera" when browser asks
                <br />
                2. Check browser settings if blocked
                <br />
                3. Reload page if needed
              </p>
            </div>
          </div>
          
          {isIOSDevice && (
            <div className="flex items-start gap-3 p-3 bg-yellow-900/30 rounded-lg border border-yellow-700/50">
              <i className="fa-brands fa-apple text-yellow-400 mt-1"></i>
              <div>
                <p className="text-yellow-300 font-medium">iOS Safari Users:</p>
                <p className="text-yellow-200/80 text-sm mt-1">
                  • Tap "Allow" when camera permission pops up
                  <br />
                  • Settings → Safari → Camera → "Allow"
                  <br />
                  • Use back camera for best results
                </p>
              </div>
            </div>
          )}
        </div>
        
        <div className="space-y-3">
          <button
            onClick={handleManualStart}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 active:scale-[0.98] text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg"
          >
            <i className="fa-solid fa-camera-retro"></i>
            Enable Camera
          </button>
          
          <button
            onClick={onClose}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl transition-colors"
          >
            Close Scanner
          </button>
        </div>
      </div>
    </div>
  );

  // Render iOS specific instructions
  const renderIOSInstructions = () => {
    if (!isIOSDevice || isScanning) return null;
    
    return (
      <div className="absolute bottom-24 left-0 right-0 z-30 flex justify-center px-4">
        <div className="bg-gradient-to-r from-yellow-900/40 to-amber-900/30 backdrop-blur-sm px-6 py-4 rounded-2xl border border-yellow-700/50 max-w-md">
          <div className="flex items-start gap-3">
            <div className="bg-yellow-500/20 p-2 rounded-lg">
              <i className="fa-brands fa-apple text-yellow-400 text-xl"></i>
            </div>
            <div>
              <h4 className="text-yellow-300 font-bold text-sm">iOS Camera Tips</h4>
              <ul className="text-yellow-200/80 text-xs mt-2 space-y-1">
                <li>• Hold device steady for better scanning</li>
                <li>• Ensure good lighting conditions</li>
                <li>• Tap screen to focus if needed</li>
                <li>• Use back camera for optimal results</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 p-4 flex justify-between items-center shadow-2xl z-50 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-full flex items-center justify-center transition-all duration-200"
            aria-label="Close scanner"
          >
            <i className="fa-solid fa-xmark text-white text-lg"></i>
          </button>
          <div>
            <h1 className="text-white font-bold text-lg flex items-center gap-2">
              <i className="fa-solid fa-qrcode text-blue-400"></i>
              QR/Barcode Scanner
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs px-2 py-1 rounded-full ${isScanning ? 'bg-green-900/30 text-green-400 border border-green-700/50' : 'bg-gray-700 text-gray-300'}`}>
                {isScanning ? '● Live' : '● Ready'}
              </span>
              <span className="text-xs text-gray-400">
                Scans: <span className="font-bold text-blue-300">{scanCount}</span>
              </span>
              {isIOSDevice && (
                <span className="text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded-full">
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
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${isFlashOn ? 'bg-yellow-500 shadow-lg shadow-yellow-500/30' : 'bg-gray-700 hover:bg-gray-600'}`}
              aria-label={isFlashOn ? 'Turn off flash' : 'Turn on flash'}
            >
              <i className={`fa-solid ${isFlashOn ? 'fa-bolt text-black' : 'fa-bolt text-white'} text-xl`}></i>
            </button>
          )}
          
          {isScanning && (
            <button
              onClick={restartScanner}
              className="w-12 h-12 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center transition-colors"
              aria-label="Restart scanner"
            >
              <i className="fa-solid fa-rotate text-white"></i>
            </button>
          )}
        </div>
      </div>

      {/* Main Scanner Area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {/* Scanner Container */}
        <div 
          id={containerId}
          className="absolute inset-0 w-full h-full bg-black"
        />
        
        {/* Loading State */}
        {isLoading && renderLoading()}
        
        {/* Initializing State */}
        {isInitializing && !isLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90">
            <div className="space-y-6 text-center">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-blue-500/20 rounded-full"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2">
                  <p className="text-white font-medium">Initializing Scanner...</p>
                  {retryCountRef.current > 0 && (
                    <p className="text-blue-300 text-sm mt-1">
                      Attempt {retryCountRef.current + 1} of 3
                    </p>
                  )}
                </div>
              </div>
              
              {isIOSDevice && !iosPermissionRequested && (
                <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 max-w-xs">
                  <p className="text-blue-300 text-sm">
                    <i className="fa-solid fa-info-circle mr-2"></i>
                    iOS may ask for camera permission. Please tap "Allow".
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Permission Error */}
        {permissionError && !isLoading && renderPermissionError()}
        
        {/* Start Button for iOS */}
        {!isScanning && !isLoading && !permissionError && isIOSDevice && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 via-black to-gray-900 p-6">
            <div className="text-center space-y-8 max-w-md">
              <div className="space-y-4">
                <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-full flex items-center justify-center border border-blue-500/20">
                  <i className="fa-solid fa-camera text-5xl text-blue-400"></i>
                </div>
                <h2 className="text-3xl font-bold text-white">Ready to Scan</h2>
                <p className="text-gray-300 text-lg">
                  Tap the button below to start your camera and begin scanning QR codes or barcodes.
                </p>
              </div>
              
              <div className="space-y-4">
                <button
                  onClick={handleManualStart}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 active:scale-95 text-white font-bold text-xl py-5 px-8 rounded-2xl transition-all duration-200 shadow-2xl shadow-green-500/20 flex items-center justify-center gap-4"
                >
                  <i className="fa-solid fa-play text-2xl"></i>
                  Start Camera
                </button>
                
                <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                  <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                    <i className="fa-solid fa-lightbulb text-yellow-400"></i>
                    Pro Tips for iOS:
                  </h4>
                  <ul className="text-gray-300 text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <i className="fa-solid fa-check text-green-400 mt-1"></i>
                      Hold device steady at 15-30cm distance
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fa-solid fa-check text-green-400 mt-1"></i>
                      Ensure good lighting on the code
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fa-solid fa-check text-green-400 mt-1"></i>
                      Tap screen to adjust focus if needed
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Scanning Overlay */}
        {isScanning && !isLoading && !permissionError && (
          <>
            {/* Scanning Frame */}
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="relative w-[260px] h-[260px]">
                {/* Corner Borders with Animation */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-green-400 rounded-tl-xl animate-pulse"></div>
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-green-400 rounded-tr-xl animate-pulse delay-150"></div>
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-green-400 rounded-bl-xl animate-pulse delay-300"></div>
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-green-400 rounded-br-xl animate-pulse delay-500"></div>
                
                {/* Scanning Line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-scan"></div>
                
                {/* Overlay Mask */}
                <div className="absolute -inset-[100vh] border-[100vh] border-black/70 -z-10"></div>
              </div>
            </div>
            
            {/* Instructions */}
            <div className="absolute bottom-28 left-0 right-0 z-20 flex justify-center px-4">
              <div className="bg-black/80 backdrop-blur-md px-5 py-3 rounded-full border border-white/10 shadow-lg">
                <p className="text-white text-sm font-medium flex items-center gap-2">
                  <i className="fa-solid fa-bullseye text-green-400"></i>
                  Align QR/Barcode within frame
                </p>
              </div>
            </div>
          </>
        )}
        
        {/* iOS Instructions */}
        {renderIOSInstructions()}
      </div>

      {/* Controls Footer */}
      <div className="bg-gradient-to-t from-gray-900 via-gray-800 to-gray-900 p-4 border-t border-gray-700 z-30">
        {/* Camera Selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-video text-blue-400"></i>
              <span className="text-white font-medium">Select Camera</span>
            </div>
            <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
              {cameras.length} available
            </span>
          </div>
          
          <div className="relative">
            <select
              className="w-full bg-gray-800 border border-gray-600 rounded-xl py-3.5 pl-4 pr-12 text-white text-sm font-medium appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
              value={selectedCameraId}
              onChange={handleCameraChange}
              disabled={isLoading || !cameras.length}
            >
              {cameras.length === 0 ? (
                <option value="">No cameras detected</option>
              ) : (
                cameras.map((camera, index) => {
                  const label = camera.label || `Camera ${index + 1}`;
                  const isBackCamera = label.toLowerCase().includes('back') || 
                                     label.toLowerCase().includes('rear') || 
                                     label.toLowerCase().includes('environment');
                  const isFrontCamera = label.toLowerCase().includes('front') || 
                                       label.toLowerCase().includes('user');
                  
                  let displayLabel = label;
                  if (isBackCamera) displayLabel = `📷 ${label} (Rear)`;
                  else if (isFrontCamera) displayLabel = `📱 ${label} (Front)`;
                  
                  return (
                    <option key={camera.id} value={camera.id} className="bg-gray-800">
                      {displayLabel}
                      {selectedCameraId === camera.id && ' ✅'}
                    </option>
                  );
                })
              )}
            </select>
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
              <i className="fa-solid fa-chevron-down"></i>
            </div>
          </div>
          
          {isIOSDevice && cameras.length > 0 && (
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-2">
              <i className="fa-solid fa-info-circle"></i>
              iOS: Select "Rear" camera for optimal scanning
            </p>
          )}
        </div>
        
        {/* Zoom Control (only show if supported and not iOS) */}
        {zoomCap && isScanning && !isIOSDevice && (
          <div className="mb-4 bg-gray-800/60 rounded-xl p-4 border border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-magnifying-glass text-blue-400"></i>
                <span className="text-white font-medium">Zoom Control</span>
              </div>
              <span className="text-blue-300 font-bold bg-blue-900/30 px-3 py-1 rounded-lg">
                {zoom.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={zoomCap.min}
              max={zoomCap.max}
              step={zoomCap.step}
              value={zoom}
              onChange={(e) => applyZoom(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-lg"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>Wide ({zoomCap.min}x)</span>
              <span>Optimal (1.5x)</span>
              <span>Zoom ({zoomCap.max}x)</span>
            </div>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          {isScanning ? (
            <>
              <button
                onClick={() => {
                  setScanCount(0);
                  restartScanner();
                }}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white font-medium py-3.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg"
              >
                <i className="fa-solid fa-rotate-right"></i>
                Reset Scanner
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-3"
              >
                <i className="fa-solid fa-check"></i>
                Done ({scanCount} scans)
              </button>
            </>
          ) : !isIOSDevice ? (
            <button
              onClick={handleManualStart}
              disabled={!cameras.length || isLoading}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg"
            >
              <i className="fa-solid fa-play"></i>
              {isLoading ? 'Starting...' : 'Start Scanner'}
            </button>
          ) : null}
        </div>
        
        {/* Platform Indicator */}
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-mobile-screen"></i>
              {isIOSDevice ? 'iOS Device' : 'Android/Desktop'}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-browser"></i>
              {isSafariBrowser ? 'Safari' : navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser'}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-camera"></i>
              {cameras.length} Cameras
            </span>
          </div>
        </div>
      </div>

      {/* Add CSS for animations */}
      <style>{`
        @keyframes scan {
          0%, 100% {
            top: 0%;
            opacity: 1;
          }
          50% {
            top: calc(100% - 4px);
            opacity: 0.7;
          }
        }
        
        .animate-scan {
          animation: scan 2s ease-in-out infinite;
        }
        
        /* Custom range slider styling */
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }
        
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 24px;
          width: 24px;
          border-radius: 50%;
          background: #3b82f6;
          border: 3px solid white;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
          transition: all 0.2s ease;
        }
        
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
        }
        
        input[type="range"]::-moz-range-thumb {
          height: 24px;
          width: 24px;
          border-radius: 50%;
          background: #3b82f6;
          border: 3px solid white;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }
        
        /* Smooth transitions */
        .transition-all {
          transition-property: all;
          transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          transition-duration: 200ms;
        }
        
        /* iOS optimizations */
        @supports (-webkit-touch-callout: none) {
          select {
            font-size: 16px; /* Prevents iOS zoom on focus */
          }
          
          button {
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
          }
        }
      `}</style>
    </div>
  );
};

// Export helper functions
export const checkCameraPermissions = async (): Promise<boolean> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    if (videoDevices.length === 0) {
      return false;
    }
    
    // Try to get permission
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    
    return true;
  } catch (error) {
    return false;
  }
};

export const getCameraList = async (): Promise<CameraDevice[]> => {
  try {
    return await Html5Qrcode.getCameras();
  } catch (error) {
    return [];
  }
};