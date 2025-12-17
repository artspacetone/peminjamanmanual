import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
  onError?: (error: string) => void;
}

// Deteksi device
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || 
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isSafari = () => /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const isIOSDevice = isIOS();
const isSafariBrowser = isSafari();

// Config optimal
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
  ],
};

const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose, onError }) => {
  // State
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState({ min: 1, max: 3, step: 0.1 });
  const [error, setError] = useState('');
  const [showManualStart, setShowManualStart] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  
  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = `qr-reader-${Math.random().toString(36).substr(2, 9)}`;
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isMountedRef = useRef(true);
  const startAttemptsRef = useRef(0);

  // Inisialisasi
  useEffect(() => {
    isMountedRef.current = true;
    
    const init = async () => {
      setIsLoading(true);
      await initializeCameraSystem();
    };
    
    init();
    
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, []);

  // Inisialisasi sistem kamera
  const initializeCameraSystem = async () => {
    try {
      // Step 1: Minta izin kamera
      const hasPermission = await requestCameraPermission();
      
      if (!hasPermission) {
        setShowManualStart(true);
        setIsLoading(false);
        return;
      }
      
      // Step 2: Dapatkan daftar kamera
      await loadCameras();
      
    } catch (err: any) {
      console.error('Initialize error:', err);
      handleError(err);
      setIsLoading(false);
    }
  };

  // Minta izin kamera
  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser tidak mendukung akses kamera');
      }
      
      // Untuk iOS, perlu constraints khusus
      const constraints = isIOSDevice 
        ? { video: { facingMode: 'environment' }, audio: false }
        : { video: true, audio: false };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach(track => track.stop());
      
      return true;
    } catch (err: any) {
      console.warn('Permission error:', err);
      
      if (err.name === 'NotAllowedError') {
        setError('Izin kamera ditolak. Harap izinkan akses kamera di pengaturan browser.');
      } else if (err.name === 'NotFoundError') {
        setError('Kamera tidak ditemukan.');
      } else {
        setError('Gagal mengakses kamera.');
      }
      
      return false;
    }
  };

  // Load daftar kamera
  const loadCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      
      if (!devices || devices.length === 0) {
        throw new Error('Tidak ada kamera yang ditemukan');
      }
      
      setCameras(devices);
      
      // Pilih kamera optimal
      let optimalCameraId = devices[0].id;
      const backCamera = devices.find(cam => 
        cam.label?.toLowerCase().includes('back') ||
        cam.label?.toLowerCase().includes('rear') ||
        cam.label?.toLowerCase().includes('environment')
      );
      
      if (backCamera) {
        optimalCameraId = backCamera.id;
      }
      
      // Untuk iOS, coba cari kamera belakang dengan label '2'
      if (isIOSDevice && devices.length > 1) {
        const iosBackCamera = devices.find(cam => cam.label?.includes('2'));
        if (iosBackCamera) {
          optimalCameraId = iosBackCamera.id;
        }
      }
      
      setSelectedCameraId(optimalCameraId);
      
      // Auto-start untuk non-iOS
      if (!isIOSDevice) {
        await startCamera(optimalCameraId);
      } else {
        setShowManualStart(true);
        setIsLoading(false);
      }
      
    } catch (err: any) {
      console.error('Load cameras error:', err);
      
      // Fallback dengan MediaDevices API
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        if (videoDevices.length > 0) {
          const cameraList = videoDevices.map((device, idx) => ({
            id: device.deviceId,
            label: device.label || `Camera ${idx + 1}`,
            kind: 'videoinput'
          })) as CameraDevice[];
          
          setCameras(cameraList);
          setSelectedCameraId(cameraList[0].id);
          
          if (!isIOSDevice) {
            await startCamera(cameraList[0].id);
          } else {
            setShowManualStart(true);
            setIsLoading(false);
          }
        } else {
          throw new Error('No cameras found');
        }
      } catch (fallbackErr) {
        handleError(err);
      }
    }
  };

  // Start kamera - FUNGSI UTAMA
  const startCamera = async (cameraId?: string) => {
    if (!isMountedRef.current) return;
    
    const targetCameraId = cameraId || selectedCameraId;
    if (!targetCameraId) {
      setError('Tidak ada kamera yang dipilih');
      return;
    }
    
    setIsLoading(true);
    setError('');
    startAttemptsRef.current++;
    
    try {
      // Stop scanner sebelumnya
      await stopCamera();
      
      // Clean container
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = '';
      
      // Buat scanner baru
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;
      
      // Platform-specific constraints
      let constraints: any;
      
      if (isIOSDevice) {
        // iOS: gunakan facingMode
        constraints = { facingMode: 'environment' };
      } else {
        // Android/Desktop: gunakan deviceId
        constraints = { deviceId: { exact: targetCameraId } };
      }
      
      // Start scanner
      await html5QrCode.start(
        constraints,
        {
          ...SCANNER_CONFIG,
          fps: isIOSDevice ? 10 : 20,
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        (errorMsg) => {
          console.log('Scan error:', errorMsg);
        }
      );
      
      // Success
      if (isMountedRef.current) {
        setIsScanning(true);
        setIsLoading(false);
        setShowManualStart(false);
        setCameraReady(true);
        
        // Setup fitur kamera
        setTimeout(() => setupCameraFeatures(), 1000);
      }
      
    } catch (err: any) {
      console.error('Start camera error:', err);
      
      if (isMountedRef.current) {
        setIsLoading(false);
        
        // Coba fallback
        if (startAttemptsRef.current < 3) {
          if (isIOSDevice) {
            setTimeout(() => startCameraWithFallback(), 1000);
          } else {
            setTimeout(() => tryDifferentCamera(targetCameraId), 1000);
          }
        } else {
          setError(`Gagal memulai kamera: ${err.message || 'Unknown error'}`);
          setShowManualStart(true);
        }
      }
    }
  };

  // Fallback untuk iOS
  const startCameraWithFallback = async () => {
    if (!scannerRef.current) return;
    
    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      
      const minimalConfig = {
        fps: 5,
        qrbox: { width: 200, height: 200 },
        aspectRatio: 1.0,
      };
      
      await scannerRef.current.start(
        { facingMode: 'environment' },
        minimalConfig,
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {}
      );
      
      if (isMountedRef.current) {
        setIsScanning(true);
        setIsLoading(false);
        setShowManualStart(false);
        setCameraReady(true);
      }
      
    } catch (fallbackErr) {
      console.error('Fallback failed:', fallbackErr);
      setError('Gagal memulai kamera dengan metode alternatif.');
      setShowManualStart(true);
    }
  };

  // Coba kamera berbeda
  const tryDifferentCamera = async (failedCameraId: string) => {
    if (cameras.length <= 1) {
      setError('Hanya ada 1 kamera dan gagal diakses');
      setShowManualStart(true);
      return;
    }
    
    const otherCamera = cameras.find(cam => cam.id !== failedCameraId);
    if (otherCamera) {
      setSelectedCameraId(otherCamera.id);
      await startCamera(otherCamera.id);
    }
  };

  // Setup fitur kamera
  const setupCameraFeatures = () => {
    const videoElement = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    if (!videoElement || !videoElement.srcObject) return;
    
    const stream = videoElement.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    videoTrackRef.current = track;
    
    if (!track || !track.getCapabilities) return;
    
    const capabilities = track.getCapabilities();
    
    // Cek flash
    if (capabilities.torch || capabilities.fillLightMode) {
      setHasFlash(true);
    }
    
    // Cek zoom (non-iOS)
    if (!isIOSDevice && capabilities.zoom) {
      const zoomCaps = capabilities.zoom as any;
      setZoomCap({
        min: zoomCaps.min || 1,
        max: Math.min(zoomCaps.max || 3, 5),
        step: zoomCaps.step || 0.1
      });
    }
    
    // Setup tap-to-focus
    if (isIOSDevice || 'ontouchstart' in window) {
      setupTapToFocus(videoElement);
    }
  };

  // Setup tap-to-focus
  const setupTapToFocus = (videoElement: HTMLVideoElement) => {
    videoElement.addEventListener('click', () => {
      if (!videoTrackRef.current) return;
      
      const track = videoTrackRef.current;
      const capabilities = track.getCapabilities();
      
      if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
        try {
          track.applyConstraints({
            advanced: [{ focusMode: 'manual' }] as any
          });
        } catch (err) {
          console.log('Tap focus not supported');
        }
      }
    });
  };

  // Handle scan success
  const handleScanSuccess = (decodedText: string) => {
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
    
    playSuccessSound();
    setScanCount(prev => prev + 1);
    onScanSuccess(decodedText);
  };

  // Main manual start
  const handleManualStart = async () => {
    setError('');
    setShowManualStart(false);
    await startCamera();
  };

  // Stop kamera
  const stopCamera = async () => {
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error('Stop error:', err);
      }
    }
    
    if (videoTrackRef.current) {
      videoTrackRef.current = null;
    }
    
    if (isMountedRef.current) {
      setIsScanning(false);
      setCameraReady(false);
      setIsFlashOn(false);
    }
  };

  // Restart kamera
  const restartCamera = async () => {
    await stopCamera();
    await startCamera();
  };

  // Switch kamera
  const switchCamera = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    await stopCamera();
    await startCamera(cameraId);
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
        await track.applyConstraints({
          advanced: [{ fillLightMode: !isFlashOn ? 'flash' : 'off' }] as any
        });
        setIsFlashOn(!isFlashOn);
      }
    } catch (err) {
      console.error('Flash toggle error:', err);
      setHasFlash(false);
    }
  };

  // Apply zoom
  const applyZoom = (value: number) => {
    setZoom(value);
    
    if (!videoTrackRef.current || isIOSDevice) return;
    
    const track = videoTrackRef.current;
    const capabilities = track.getCapabilities();
    
    if (capabilities.zoom) {
      try {
        track.applyConstraints({
          advanced: [{ zoom: value }] as any
        });
      } catch (err) {
        console.warn('Zoom not supported');
      }
    }
  };

  // Play success sound
  const playSuccessSound = () => {
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
    } catch (err) {
      // Ignore audio errors
    }
  };

  // Handle error
  const handleError = (err: any) => {
    let message = 'Terjadi kesalahan saat mengakses kamera';
    
    if (err.name === 'NotAllowedError') {
      message = 'Izin kamera ditolak. Harap izinkan akses kamera di pengaturan browser.';
    } else if (err.name === 'NotFoundError') {
      message = 'Kamera tidak ditemukan.';
    } else if (err.message) {
      message = err.message;
    }
    
    setError(message);
    setShowManualStart(true);
    
    if (onError) {
      onError(message);
    }
  };

  // Render loading
  const renderLoading = () => (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black">
      <div className="relative">
        <div className="w-20 h-20 border-4 border-blue-500/30 rounded-full"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          <p className="text-white font-medium">Menyiapkan Kamera...</p>
          {startAttemptsRef.current > 0 && (
            <p className="text-blue-300 text-sm mt-1">Percobaan {startAttemptsRef.current}</p>
          )}
        </div>
      </div>
    </div>
  );

  // Render manual start
  const renderManualStart = () => (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 via-black to-gray-900 p-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-3">
          <div className="w-24 h-24 mx-auto bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-full flex items-center justify-center border border-blue-500/20">
            <i className="fa-solid fa-camera text-4xl text-blue-400"></i>
          </div>
          <h2 className="text-2xl font-bold text-white">Mulai Scanner</h2>
          <p className="text-gray-300">
            Tekan tombol di bawah untuk memulai kamera dan memindai QR/Barcode.
          </p>
        </div>
        
        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}
        
        <div className="space-y-3">
          <button
            onClick={handleManualStart}
            disabled={isLoading}
            className={`w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-lg py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3 ${
              isLoading ? 'opacity-70' : ''
            }`}
          >
            <i className="fa-solid fa-play"></i>
            {isLoading ? 'Memulai...' : 'Mulai Kamera'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-4 flex justify-between items-center z-50 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center"
            aria-label="Close"
          >
            <i className="fa-solid fa-arrow-left text-white"></i>
          </button>
          <div>
            <h1 className="text-white font-bold text-lg flex items-center gap-2">
              <i className="fa-solid fa-qrcode text-blue-400"></i>
              QR Scanner
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-xs px-2 py-1 rounded-full ${
                isScanning ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-300'
              }`}>
                {isScanning ? '● Live' : '● Ready'}
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
        
        {isScanning && hasFlash && (
          <button
            onClick={toggleFlash}
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isFlashOn ? 'bg-yellow-500' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <i className={`fa-solid ${isFlashOn ? 'fa-bolt' : 'fa-bolt'} ${
              isFlashOn ? 'text-black' : 'text-white'
            }`}></i>
          </button>
        )}
      </div>

      {/* Main Scanner Area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {/* Scanner Container */}
        <div 
          id={containerId}
          className="absolute inset-0 w-full h-full"
        />
        
        {/* Loading Overlay */}
        {isLoading && renderLoading()}
        
        {/* Manual Start Overlay */}
        {showManualStart && !isLoading && renderManualStart()}
        
        {/* Scanning Overlay */}
        {isScanning && !isLoading && (
          <>
            {/* Scanning Frame */}
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="relative w-[250px] h-[250px]">
                {/* Corners */}
                <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>
                
                {/* Scanning Line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-scan"></div>
                
                {/* Overlay Mask */}
                <div className="absolute -inset-[100vh] border-[100vh] border-black/60 -z-10"></div>
              </div>
            </div>
            
            {/* Instructions */}
            <div className="absolute bottom-24 left-0 right-0 z-20 flex justify-center px-4">
              <div className="bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full">
                <p className="text-white text-sm">
                  Arahkan kamera ke QR/Barcode
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
              <span className="text-white font-medium text-sm">Pilih Kamera</span>
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
        
        {/* Zoom Control (non-iOS only) */}
        {isScanning && !isIOSDevice && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-magnifying-glass text-blue-400"></i>
                <span className="text-white font-medium text-sm">Zoom</span>
              </div>
              <span className="text-blue-300 font-bold">{zoom.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={zoomCap.min}
              max={zoomCap.max}
              step={zoomCap.step}
              value={zoom}
              onChange={(e) => applyZoom(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
            />
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          {isScanning ? (
            <>
              <button
                onClick={restartCamera}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-rotate"></i>
                Restart
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-check"></i>
                Selesai
              </button>
            </>
          ) : !showManualStart && !isIOSDevice ? (
            <button
              onClick={handleManualStart}
              disabled={isLoading}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-play"></i>
              Mulai Scanner
            </button>
          ) : null}
        </div>
      </div>

      {/* Custom CSS */}
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
        
        /* Range slider styling */
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }
        
        input[type="range"]::-webkit-slider-track {
          background: #4b5563;
          height: 6px;
          border-radius: 3px;
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
          margin-top: -7px;
        }
      `}</style>
    </div>
  );
};

// Ekspor sebagai default
export default CameraScanner;