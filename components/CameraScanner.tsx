import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
  onError?: (error: string) => void;
}

// Device detection dengan deteksi lebih akurat
const isIOS = () => {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS;
};

const isSafari = () => {
  const ua = navigator.userAgent.toLowerCase();
  return /safari/.test(ua) && !/chrome|crios/.test(ua);
};

const isIOSDevice = isIOS();
const isSafariBrowser = isSafari();

// Config untuk auto-focus dan zoom
const SCANNER_CONFIG = {
  fps: isIOSDevice ? 15 : 30,
  qrbox: { width: 250, height: 250 },
  aspectRatio: 1.0,
  disableFlip: false,
  rememberLastUsedCamera: true,
  showZoomSliderIfSupported: true,
  showTorchButtonIfSupported: true,
  defaultZoomValueIfSupported: 1.3,
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
  ],
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
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number }>({
    min: 1,
    max: 5,
    step: 0.1
  });
  const [scanCount, setScanCount] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [autoFocusEnabled, setAutoFocusEnabled] = useState(true);
  const [focusMode, setFocusMode] = useState<string>('continuous');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = `reader-custom-view-${Date.now()}`;
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isMountedRef = useRef(true);
  const startAttemptsRef = useRef(0);
  const scanDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const zoomIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Initialize component
  useEffect(() => {
    isMountedRef.current = true;
    initializeCameraSystem();
    
    return () => {
      isMountedRef.current = false;
      cleanupScanner();
      if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
      if (zoomIntervalRef.current) clearTimeout(zoomIntervalRef.current);
    };
  }, []);

  // Initialize camera system
  const initializeCameraSystem = async () => {
    if (!isMountedRef.current) return;
    
    setIsInitializing(true);
    setErrorMessage('');
    
    try {
      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser tidak mendukung akses kamera');
      }
      
      // Request camera permission first (required for iOS)
      await requestCameraPermission();
      
      // Get available cameras
      const devices = await getCameraList();
      
      if (!devices || devices.length === 0) {
        throw new Error('Tidak ada kamera yang ditemukan');
      }
      
      if (isMountedRef.current) {
        setCameras(devices);
        selectOptimalCamera(devices);
        
        // Auto-start camera for Android, wait for manual start on iOS
        if (!isIOSDevice) {
          setTimeout(() => {
            if (selectedCameraId) {
              startCamera(selectedCameraId);
            }
          }, 500);
        }
      }
      
    } catch (error: any) {
      console.error('Initialize error:', error);
      handleCameraError(error);
    } finally {
      if (isMountedRef.current) {
        setIsInitializing(false);
      }
    }
  };

  // Request camera permission
  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      // For iOS, we need to trigger permission via user gesture
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      });
      
      // Stop the stream immediately after getting permission
      stream.getTracks().forEach(track => track.stop());
      return true;
      
    } catch (error: any) {
      console.warn('Permission request failed:', error);
      
      if (error.name === 'NotAllowedError') {
        setErrorMessage('Izin kamera ditolak. Harap izinkan akses kamera di pengaturan browser.');
      } else if (error.name === 'NotFoundError') {
        setErrorMessage('Kamera tidak ditemukan. Pastikan perangkat memiliki kamera yang berfungsi.');
      } else {
        setErrorMessage(`Gagal mengakses kamera: ${error.message}`);
      }
      
      return false;
    }
  };

  // Get camera list
  const getCameraList = async (): Promise<CameraDevice[]> => {
    try {
      return await Html5Qrcode.getCameras();
    } catch (error) {
      console.error('Get cameras error:', error);
      
      // Fallback: try to get cameras using MediaDevices API
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        return videoDevices.map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Kamera ${index + 1}`,
          kind: 'videoinput'
        }));
      } catch (e) {
        console.error('Fallback get cameras error:', e);
        return [];
      }
    }
  };

  // Select optimal camera
  const selectOptimalCamera = (devices: CameraDevice[]) => {
    if (!devices.length) return;
    
    // Try to get last used camera
    const lastCameraId = localStorage.getItem('lastCameraId');
    
    // For iOS, prefer back camera
    if (isIOSDevice) {
      // iOS often has camera labels like "Back Camera" or "Front Camera"
      const backCamera = devices.find(camera => 
        camera.label?.toLowerCase().includes('back') ||
        camera.label?.toLowerCase().includes('rear') ||
        camera.label?.toLowerCase().includes('environment') ||
        (camera.label && camera.label.match(/2$/)) // iOS back camera often ends with "2"
      );
      
      const targetId = backCamera?.id || devices[0].id;
      setSelectedCameraId(targetId);
      return;
    }
    
    // For Android/Desktop
    if (lastCameraId && devices.some(d => d.id === lastCameraId)) {
      setSelectedCameraId(lastCameraId);
    } else {
      const backCamera = devices.find(camera => 
        camera.label?.toLowerCase().includes('back') ||
        camera.label?.toLowerCase().includes('rear') ||
        camera.label?.toLowerCase().includes('environment')
      );
      
      setSelectedCameraId(backCamera?.id || devices[0].id);
    }
  };

  // Main function to start camera - FIXED VERSION
  const startCamera = async (cameraId: string) => {
    if (!isMountedRef.current || !cameraId) return;
    
    // Prevent multiple start attempts
    if (isLoading) return;
    
    setIsLoading(true);
    setPermissionError(false);
    setErrorMessage('');
    startAttemptsRef.current++;
    
    try {
      // Cleanup previous scanner
      await stopCamera();
      
      // Create new scanner instance
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;
      
      // Platform-specific video constraints
      const videoConstraints = getVideoConstraints(cameraId);
      
      console.log('Starting camera with constraints:', videoConstraints);
      
      // Start the scanner
      await html5QrCode.start(
        videoConstraints,
        {
          ...SCANNER_CONFIG,
          fps: isIOSDevice ? 10 : 20, // Lower FPS for stability
        },
        onScanSuccessHandler,
        () => {} // Empty error callback for scanning
      );
      
      // Camera started successfully
      if (isMountedRef.current) {
        setIsScanning(true);
        setIsLoading(false);
        setCameraReady(true);
        
        // Save camera preference
        localStorage.setItem('lastCameraId', cameraId);
        
        // Setup camera capabilities after delay
        setTimeout(() => {
          setupCameraCapabilities();
          setupAutoFocus();
          applyDefaultZoom();
        }, 800);
      }
      
    } catch (error: any) {
      console.error('Start camera error:', error);
      
      if (isMountedRef.current) {
        setIsLoading(false);
        
        // Handle specific errors
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setPermissionError(true);
          setErrorMessage('Akses kamera ditolak. Harap izinkan akses kamera di pengaturan browser.');
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          setErrorMessage('Kamera tidak ditemukan. Pastikan kamera tersedia dan tidak digunakan aplikasi lain.');
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          setErrorMessage('Kamera sedang digunakan aplikasi lain. Tutup aplikasi lain yang menggunakan kamera.');
        } else if (error.message?.includes('requestDevice')) {
          setErrorMessage('Gagal meminta akses kamera. Coba refresh halaman dan izinkan akses kamera.');
        } else {
          setErrorMessage(`Gagal memulai kamera: ${error.message || 'Unknown error'}`);
        }
        
        // Try fallback method
        if (startAttemptsRef.current < 3) {
          setTimeout(() => {
            if (isMountedRef.current && cameraId) {
              startCameraWithFallback(cameraId);
            }
          }, 1000);
        }
      }
    }
  };

  // Fallback camera start method
  const startCameraWithFallback = async (cameraId: string) => {
    try {
      if (!scannerRef.current) return;
      
      // Stop if already scanning
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      
      // Use minimal constraints for fallback
      const minimalConfig = {
        fps: 10,
        qrbox: { width: 200, height: 200 },
        aspectRatio: 1.0,
        disableFlip: false,
      };
      
      // Try with facingMode instead of deviceId
      const constraints = isIOSDevice 
        ? { facingMode: { ideal: 'environment' } }
        : { deviceId: { exact: cameraId } };
      
      await scannerRef.current.start(
        constraints,
        minimalConfig,
        onScanSuccessHandler,
        () => {}
      );
      
      if (isMountedRef.current) {
        setIsScanning(true);
        setIsLoading(false);
        setCameraReady(true);
      }
      
    } catch (fallbackError) {
      console.error('Fallback start failed:', fallbackError);
      setErrorMessage('Gagal memulai kamera dengan metode alternatif.');
      setPermissionError(true);
    }
  };

  // Get video constraints based on platform
  const getVideoConstraints = (cameraId: string): any => {
    // Base constraints
    const baseConstraints: any = {
      deviceId: { exact: cameraId },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: isIOSDevice ? 20 : 30 },
    };
    
    // Add focus mode for non-iOS devices
    if (!isIOSDevice) {
      baseConstraints.focusMode = { ideal: ['continuous', 'auto'] };
    }
    
    // iOS specific optimizations
    if (isIOSDevice) {
      // iOS works better with simpler constraints
      return {
        deviceId: { exact: cameraId },
        facingMode: { ideal: 'environment' },
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        aspectRatio: { ideal: 1.7777777778 }, // 16:9
      };
    }
    
    // Android/Desktop with advanced features
    return {
      ...baseConstraints,
      resizeMode: { ideal: 'crop-and-scale' },
      advanced: [
        { focusMode: 'continuous' },
        { whiteBalanceMode: 'continuous' },
        { exposureMode: 'continuous' },
      ]
    };
  };

  // Scan success handler
  const onScanSuccessHandler = (decodedText: string) => {
    // Debounce to prevent multiple scans
    const now = Date.now();
    const lastScanTime = localStorage.getItem('lastScanTime');
    
    if (lastScanTime && now - parseInt(lastScanTime) < 1000) {
      return; // Ignore scans within 1 second
    }
    
    localStorage.setItem('lastScanTime', now.toString());
    
    // Success feedback
    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }
    
    playScanSuccessSound();
    
    // Update state
    setScanCount(prev => prev + 1);
    
    // Call success handler
    onScanSuccess(decodedText);
    
    // Auto-reset scanner after delay
    if (scanDebounceRef.current) {
      clearTimeout(scanDebounceRef.current);
    }
    
    scanDebounceRef.current = setTimeout(() => {
      // Clear scanner for next scan
      if (scannerRef.current) {
        const container = document.getElementById(containerId);
        if (container) {
          const canvas = container.querySelector('canvas');
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
          }
        }
      }
    }, 1500);
  };

  // Setup camera capabilities
  const setupCameraCapabilities = () => {
    const videoElement = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    if (!videoElement || !videoElement.srcObject) return;
    
    videoElementRef.current = videoElement;
    
    const stream = videoElement.srcObject as MediaStream;
    setCameraStream(stream);
    
    const track = stream.getVideoTracks()[0];
    videoTrackRef.current = track;
    
    if (!track) return;
    
    // Check capabilities
    if (track.getCapabilities) {
      const capabilities = track.getCapabilities();
      
      // Setup zoom
      if (capabilities.zoom) {
        const zoomCaps = capabilities.zoom as any;
        setZoomCap({
          min: zoomCaps.min || 1,
          max: Math.min(zoomCaps.max || 3, isIOSDevice ? 2 : 5),
          step: zoomCaps.step || 0.1
        });
        
        // iOS zoom fix: start with minimal zoom
        const startZoom = isIOSDevice ? 1 : (zoomCaps.min || 1);
        setZoom(startZoom);
        
        if (!isIOSDevice) {
          // Apply default zoom for non-iOS
          setTimeout(() => applyZoom(1.3), 300);
        }
      }
      
      // Check flash support
      if (capabilities.torch || capabilities.fillLightMode) {
        setHasFlash(true);
      }
      
      // Check focus support
      if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        setAutoFocusEnabled(true);
        setFocusMode('continuous');
      }
    }
    
    // Setup tap-to-focus for mobile
    if (isIOSDevice || 'ontouchstart' in window) {
      setupTapToFocus(videoElement);
    }
  };

  // Setup auto focus
  const setupAutoFocus = () => {
    if (!videoTrackRef.current) return;
    
    try {
      const track = videoTrackRef.current;
      
      if (track.getCapabilities && track.getSettings) {
        const capabilities = track.getCapabilities();
        const settings = track.getSettings();
        
        // Try to set continuous auto-focus
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
          track.applyConstraints({
            advanced: [{ focusMode: 'continuous' }] as any
          }).then(() => {
            setAutoFocusEnabled(true);
            setFocusMode('continuous');
          }).catch(() => {
            // Fallback to auto focus
            try {
              track.applyConstraints({
                focusMode: 'auto'
              });
              setFocusMode('auto');
            } catch (e) {
              console.warn('Auto focus not supported');
              setAutoFocusEnabled(false);
            }
          });
        }
      }
    } catch (error) {
      console.warn('Auto focus setup failed:', error);
    }
  };

  // Setup tap-to-focus for mobile devices
  const setupTapToFocus = (videoElement: HTMLVideoElement) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const handleTap = (e: TouchEvent | MouseEvent) => {
      if (!videoTrackRef.current || !videoElement) return;
      
      const rect = videoElement.getBoundingClientRect();
      let x, y;
      
      if (e instanceof TouchEvent) {
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
      } else {
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
      }
      
      // Normalize coordinates
      const normalizedX = x / rect.width;
      const normalizedY = y / rect.height;
      
      try {
        const track = videoTrackRef.current;
        
        // Try to set focus point
        if ('focusDistance' in track.getCapabilities()) {
          track.applyConstraints({
            advanced: [
              { focusMode: 'manual' },
              { focusDistance: 0.5 } // Middle distance
            ] as any
          });
        } else if (track.getCapabilities().focusMode?.includes('auto')) {
          // Trigger auto focus at point
          track.applyConstraints({
            advanced: [{ focusMode: 'auto' }] as any
          });
        }
        
        // Visual feedback
        showFocusIndicator(x, y);
        
      } catch (error) {
        console.log('Tap-to-focus not supported');
      }
    };
    
    // Add event listeners
    container.addEventListener('touchstart', handleTap as EventListener);
    container.addEventListener('click', handleTap as EventListener);
    
    // Cleanup function
    return () => {
      container.removeEventListener('touchstart', handleTap as EventListener);
      container.removeEventListener('click', handleTap as EventListener);
    };
  };

  // Show focus indicator
  const showFocusIndicator = (x: number, y: number) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Remove existing indicator
    const existingIndicator = container.querySelector('.focus-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    // Create new indicator
    const indicator = document.createElement('div');
    indicator.className = 'focus-indicator';
    indicator.style.position = 'absolute';
    indicator.style.left = `${x - 30}px`;
    indicator.style.top = `${y - 30}px`;
    indicator.style.width = '60px';
    indicator.style.height = '60px';
    indicator.style.border = '3px solid #00ff00';
    indicator.style.borderRadius = '50%';
    indicator.style.zIndex = '1000';
    indicator.style.pointerEvents = 'none';
    indicator.style.animation = 'focusPulse 1s ease-out';
    
    container.appendChild(indicator);
    
    // Remove indicator after animation
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.remove();
      }
    }, 1000);
  };

  // Apply zoom
  const applyZoom = (value: number) => {
    if (!videoTrackRef.current) return;
    
    // Clamp value within bounds
    const clampedValue = Math.max(zoomCap.min, Math.min(value, zoomCap.max));
    setZoom(clampedValue);
    
    try {
      const track = videoTrackRef.current;
      
      // iOS zoom fix: apply constraints differently
      if (isIOSDevice) {
        // iOS may need different approach for zoom
        const settings = track.getSettings();
        const newWidth = Math.round((settings.width || 1280) * clampedValue);
        const newHeight = Math.round((settings.height || 720) * clampedValue);
        
        track.applyConstraints({
          width: { ideal: newWidth },
          height: { ideal: newHeight }
        });
      } else {
        // Standard zoom for other devices
        if ('zoom' in track.getCapabilities()) {
          track.applyConstraints({
            advanced: [{ zoom: clampedValue }] as any
          });
        }
      }
    } catch (error) {
      console.warn('Zoom application failed:', error);
      
      // Fallback for iOS
      if (isIOSDevice && videoElementRef.current) {
        videoElementRef.current.style.transform = `scale(${clampedValue})`;
        videoElementRef.current.style.transformOrigin = 'center center';
      }
    }
  };

  // Apply default zoom
  const applyDefaultZoom = () => {
    if (!videoTrackRef.current) return;
    
    // Default zoom is 1.3x for better scanning
    const defaultZoom = isIOSDevice ? 1.0 : 1.3;
    
    // Wait a bit for camera to stabilize
    setTimeout(() => {
      applyZoom(defaultZoom);
    }, 1000);
  };

  // Toggle flash
  const toggleFlash = async () => {
    if (!videoTrackRef.current || !hasFlash) return;
    
    try {
      const track = videoTrackRef.current;
      const capabilities = track.getCapabilities();
      
      if ('torch' in capabilities) {
        await track.applyConstraints({
          advanced: [{ torch: !isFlashOn }] as any
        });
        setIsFlashOn(!isFlashOn);
      } else if ('fillLightMode' in capabilities) {
        // For iOS
        await track.applyConstraints({
          advanced: [{ fillLightMode: !isFlashOn ? 'flash' : 'off' }] as any
        });
        setIsFlashOn(!isFlashOn);
      }
    } catch (error) {
      console.error('Flash toggle failed:', error);
      setHasFlash(false);
    }
  };

  // Stop camera
  const stopCamera = async () => {
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (error) {
        console.error('Stop scanner error:', error);
      }
    }
    
    // Stop camera stream
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        track.stop();
      });
      setCameraStream(null);
    }
    
    // Turn off flash
    if (isFlashOn && videoTrackRef.current) {
      try {
        const track = videoTrackRef.current;
        if ('torch' in track.getCapabilities()) {
          await track.applyConstraints({
            advanced: [{ torch: false }] as any
          });
        }
      } catch (error) {
        // Ignore
      }
      setIsFlashOn(false);
    }
    
    setIsScanning(false);
    setCameraReady(false);
    videoTrackRef.current = null;
    videoElementRef.current = null;
  };

  // Restart camera
  const restartCamera = async () => {
    if (selectedCameraId) {
      await stopCamera();
      await startCamera(selectedCameraId);
    }
  };

  // Switch camera
  const switchCamera = async (cameraId: string) => {
    if (cameraId === selectedCameraId) return;
    
    setSelectedCameraId(cameraId);
    await stopCamera();
    await startCamera(cameraId);
  };

  // Handle manual start (for iOS and manual trigger)
  const handleManualStart = async () => {
    if (!selectedCameraId && cameras.length > 0) {
      setSelectedCameraId(cameras[0].id);
      await startCamera(cameras[0].id);
    } else if (selectedCameraId) {
      await startCamera(selectedCameraId);
    } else {
      // Try to get cameras and start
      await initializeCameraSystem();
    }
  };

  // Handle camera error
  const handleCameraError = (error: any) => {
    console.error('Camera error:', error);
    
    let message = 'Terjadi kesalahan saat mengakses kamera.';
    
    if (error.name === 'NotAllowedError') {
      message = 'Izin kamera ditolak. Harap izinkan akses kamera di pengaturan browser.';
      setPermissionError(true);
    } else if (error.name === 'NotFoundError') {
      message = 'Kamera tidak ditemukan.';
    } else if (error.message) {
      message = error.message;
    }
    
    setErrorMessage(message);
    setIsInitializing(false);
    setIsLoading(false);
  };

  // Cleanup scanner
  const cleanupScanner = () => {
    stopCamera();
    scannerRef.current = null;
    
    // Clear container
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = '';
    }
  };

  // Play scan success sound
  const playScanSuccessSound = () => {
    try {
      // Create audio context for beep sound
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
      // Audio not supported, use vibration only
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }
    }
  };

  // Handle camera change
  const handleCameraChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newCameraId = event.target.value;
    switchCamera(newCameraId);
  };

  // Render loading state
  const renderLoading = () => (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <div className="relative">
        <div className="w-24 h-24 border-4 border-blue-500/20 rounded-full"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="absolute -bottom-16 left-1/2 transform -translate-x-1/2 text-center">
          <p className="text-white font-medium text-lg">Memuat Kamera...</p>
          <p className="text-blue-300 text-sm mt-2">
            {startAttemptsRef.current > 0 
              ? `Percobaan ${startAttemptsRef.current}...` 
              : 'Harap tunggu'}
          </p>
        </div>
      </div>
    </div>
  );

  // Render start button for manual start
  const renderStartButton = () => (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 via-black to-gray-900 p-6">
      <div className="text-center space-y-8 max-w-md">
        <div className="space-y-4">
          <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-full flex items-center justify-center border border-blue-500/20">
            <i className="fa-solid fa-camera text-5xl text-blue-400"></i>
          </div>
          <h2 className="text-3xl font-bold text-white">Scanner Kamera Siap</h2>
          <p className="text-gray-300 text-lg">
            Tekan tombol di bawah untuk memulai kamera dan memindai QR code atau barcode.
          </p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={handleManualStart}
            disabled={isLoading}
            className={`w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 active:scale-95 text-white font-bold text-xl py-5 px-8 rounded-2xl transition-all duration-200 shadow-2xl shadow-green-500/20 flex items-center justify-center gap-4 ${isLoading ? 'opacity-70' : ''}`}
          >
            <i className="fa-solid fa-play text-2xl"></i>
            {isLoading ? 'Memulai...' : 'Mulai Kamera'}
          </button>
          
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <h4 className="text-white font-bold mb-2 flex items-center gap-2">
              <i className="fa-solid fa-lightbulb text-yellow-400"></i>
              Tips Penggunaan:
            </h4>
            <ul className="text-gray-300 text-sm space-y-2">
              <li className="flex items-start gap-2">
                <i className="fa-solid fa-check text-green-400 mt-1"></i>
                Posisikan kamera 15-30cm dari objek
              </li>
              <li className="flex items-start gap-2">
                <i className="fa-solid fa-check text-green-400 mt-1"></i>
                Pastikan pencahayaan cukup
              </li>
              <li className="flex items-start gap-2">
                <i className="fa-solid fa-check text-green-400 mt-1"></i>
                Tap layar untuk fokus manual
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // Render error message
  const renderError = () => (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black p-6">
      <div className="bg-red-900/20 border border-red-700/50 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
          <i className="fa-solid fa-triangle-exclamation text-3xl text-red-400"></i>
        </div>
        <h3 className="text-xl font-bold text-white mb-4">Gagal Memulai Kamera</h3>
        <p className="text-red-200 mb-6">{errorMessage}</p>
        <div className="space-y-3">
          <button
            onClick={handleManualStart}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-3"
          >
            <i className="fa-solid fa-rotate-right"></i>
            Coba Lagi
          </button>
          <button
            onClick={onClose}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-xl"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 p-4 flex justify-between items-center shadow-2xl z-50 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-full flex items-center justify-center transition-all duration-200"
            aria-label="Tutup scanner"
          >
            <i className="fa-solid fa-arrow-left text-white text-lg"></i>
          </button>
          <div>
            <h1 className="text-white font-bold text-lg flex items-center gap-2">
              <i className="fa-solid fa-qrcode text-blue-400"></i>
              QR/Barcode Scanner
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs px-2 py-1 rounded-full ${isScanning ? 'bg-green-900/30 text-green-400 border border-green-700/50' : 'bg-gray-700 text-gray-300'}`}>
                {isScanning ? '● Aktif' : '● Siap'}
              </span>
              <span className="text-xs text-gray-400">
                Scan: <span className="font-bold text-blue-300">{scanCount}</span>
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
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                isFlashOn 
                  ? 'bg-yellow-500 shadow-lg shadow-yellow-500/30 text-black' 
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
              aria-label={isFlashOn ? 'Matikan flash' : 'Nyalakan flash'}
            >
              <i className={`fa-solid ${isFlashOn ? 'fa-bolt' : 'fa-bolt-lightning'} text-xl`}></i>
            </button>
          )}
          
          {isScanning && (
            <button
              onClick={restartCamera}
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
        {(isLoading || isInitializing) && renderLoading()}
        
        {/* Error State */}
        {errorMessage && !isLoading && !isScanning && renderError()}
        
        {/* Start Button (for iOS and manual start) */}
        {!isScanning && !isLoading && !errorMessage && (isIOSDevice || !isInitializing) && renderStartButton()}
        
        {/* Permission Error */}
        {permissionError && !isLoading && !isScanning && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black p-6">
            <div className="bg-gray-800/80 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-gray-700 text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
                <i className="fa-solid fa-camera-slash text-3xl text-red-400"></i>
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Izin Kamera Diperlukan</h3>
              <p className="text-gray-300 mb-6">
                Scanner membutuhkan akses kamera untuk berfungsi. Harap izinkan akses kamera di browser Anda.
              </p>
              <button
                onClick={handleManualStart}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-3"
              >
                <i className="fa-solid fa-camera"></i>
                Izinkan Kamera
              </button>
            </div>
          </div>
        )}
        
        {/* Scanning Overlay */}
        {isScanning && !isLoading && !errorMessage && (
          <>
            {/* Scanning Frame */}
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="relative w-[260px] h-[260px]">
                {/* Corner Borders */}
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-green-400 rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-green-400 rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-green-400 rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-green-400 rounded-br-xl"></div>
                
                {/* Scanning Line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-scan"></div>
                
                {/* Overlay Mask */}
                <div className="absolute -inset-[100vh] border-[100vh] border-black/70 -z-10"></div>
              </div>
            </div>
            
            {/* Focus Mode Indicator */}
            {autoFocusEnabled && (
              <div className="absolute top-4 right-4 z-20 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-full">
                <span className="text-green-400 text-xs font-bold flex items-center gap-2">
                  <i className="fa-solid fa-crosshairs"></i>
                  Auto-focus: {focusMode}
                </span>
              </div>
            )}
            
            {/* Instructions */}
            <div className="absolute bottom-28 left-0 right-0 z-20 flex justify-center px-4">
              <div className="bg-black/80 backdrop-blur-md px-5 py-3 rounded-full border border-white/10 shadow-lg">
                <p className="text-white text-sm font-medium flex items-center gap-2">
                  <i className="fa-solid fa-bullseye text-green-400"></i>
                  Arahkan kamera ke QR/Barcode
                </p>
              </div>
            </div>
            
            {/* Tap to focus hint for mobile */}
            {(isIOSDevice || 'ontouchstart' in window) && (
              <div className="absolute bottom-40 left-0 right-0 z-20 flex justify-center px-4">
                <div className="bg-blue-900/40 backdrop-blur-sm px-4 py-2 rounded-lg">
                  <p className="text-blue-200 text-xs flex items-center gap-2">
                    <i className="fa-solid fa-hand-pointer"></i>
                    Tap layar untuk fokus manual
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls Footer */}
      <div className="bg-gradient-to-t from-gray-900 via-gray-800 to-gray-900 p-4 border-t border-gray-700 z-30">
        {/* Camera Selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-video text-blue-400"></i>
              <span className="text-white font-medium">Pilih Kamera</span>
            </div>
            <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
              {cameras.length} tersedia
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
                <option value="">Tidak ada kamera</option>
              ) : (
                cameras.map((camera, index) => {
                  const label = camera.label || `Kamera ${index + 1}`;
                  const isBackCamera = label.toLowerCase().includes('back') || 
                                     label.toLowerCase().includes('rear') || 
                                     label.toLowerCase().includes('environment');
                  const isFrontCamera = label.toLowerCase().includes('front') || 
                                       label.toLowerCase().includes('user');
                  
                  let displayLabel = label;
                  if (isBackCamera) displayLabel = `📷 ${label} (Belakang)`;
                  else if (isFrontCamera) displayLabel = `📱 ${label} (Depan)`;
                  else displayLabel = `📹 ${label}`;
                  
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
              iOS: Pilih kamera "Belakang" untuk hasil terbaik
            </p>
          )}
        </div>
        
        {/* Zoom Control */}
        {isScanning && (
          <div className="mb-4 bg-gray-800/60 rounded-xl p-4 border border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-magnifying-glass text-blue-400"></i>
                <span className="text-white font-medium">Zoom Kamera</span>
              </div>
              <span className="text-blue-300 font-bold bg-blue-900/30 px-3 py-1 rounded-lg">
                {zoom.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={zoomCap.min}
              max={zoomCap.max}
              step={zoomCap.step}
              value={zoom}
              onChange={(e) => applyZoom(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>Normal ({zoomCap.min.toFixed(1)}x)</span>
              <span className="text-blue-400">Optimal (1.3x)</span>
              <span>Zoom ({zoomCap.max.toFixed(1)}x)</span>
            </div>
            
            {/* iOS Zoom Warning */}
            {isIOSDevice && (
              <p className="text-xs text-amber-400 mt-3 flex items-center gap-2">
                <i className="fa-solid fa-exclamation-triangle"></i>
                iOS: Zoom mungkin terbatas. Atur antara {zoomCap.min.toFixed(1)}x - {zoomCap.max.toFixed(1)}x
              </p>
            )}
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          {isScanning ? (
            <>
              <button
                onClick={() => {
                  setScanCount(0);
                  restartCamera();
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
                Selesai ({scanCount} scan)
              </button>
            </>
          ) : !isIOSDevice && !isLoading ? (
            <button
              onClick={handleManualStart}
              disabled={!cameras.length || isLoading}
              className={`flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg ${(!cameras.length || isLoading) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <i className="fa-solid fa-play"></i>
              {isLoading ? 'Memulai...' : 'Mulai Scanner'}
            </button>
          ) : null}
        </div>
        
        {/* Status Bar */}
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-microchip"></i>
              {isIOSDevice ? 'iOS' : 'Android/PC'}
            </span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-camera"></i>
              {cameras.length} Kamera
            </span>
            <span className="flex items-center gap-1">
              <i className="fa-solid fa-bolt"></i>
              {hasFlash ? 'Flash: Ready' : 'Flash: Not Available'}
            </span>
          </div>
        </div>
      </div>

      {/* Custom CSS for animations */}
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
        
        .animate-scan {
          animation: scan 2s ease-in-out infinite;
        }
        
        /* Custom range slider */
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
          width: 100%;
        }
        
        input[type="range"]::-webkit-slider-track {
          background: #374151;
          height: 8px;
          border-radius: 4px;
        }
        
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          border: 2px solid white;
          cursor: pointer;
          margin-top: -6px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
          transition: all 0.2s ease;
        }
        
        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          background: #2563eb;
        }
        
        input[type="range"]::-moz-range-track {
          background: #374151;
          height: 8px;
          border-radius: 4px;
        }
        
        input[type="range"]::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          border: 2px solid white;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }
        
        /* iOS specific fixes */
        @supports (-webkit-touch-callout: none) {
          select, button, input {
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
          }
          
          input[type="range"]::-webkit-slider-thumb {
            height: 24px;
            width: 24px;
          }
        }
        
        /* Smooth transitions */
        * {
          transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
        }
      `}</style>
    </div>
  );
};

// Export utility functions
export const checkCameraSupport = async (): Promise<{
  supported: boolean;
  hasCamera: boolean;
  permissionGranted: boolean;
  isMobile: boolean;
  isIOS: boolean;
}> => {
  const result = {
    supported: false,
    hasCamera: false,
    permissionGranted: false,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isIOS: isIOS(),
  };
  
  try {
    // Check if MediaDevices API is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return result;
    }
    
    result.supported = true;
    
    // Try to enumerate devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    result.hasCamera = videoDevices.length > 0;
    
    // Check permission by trying to get stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      result.permissionGranted = true;
    } catch (e) {
      result.permissionGranted = false;
    }
    
  } catch (error) {
    console.error('Camera support check failed:', error);
  }
  
  return result;
};

export default CameraScanner;