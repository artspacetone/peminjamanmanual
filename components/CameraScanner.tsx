import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
  onError?: (error: string) => void;
}

// --- UTILITIES ---

const isIOS = () => {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isSafari = () => {
  const ua = navigator.userAgent.toLowerCase();
  return /safari/.test(ua) && !/chrome|crios/.test(ua);
};

const isIOSDevice = isIOS();
const containerId = "reader-custom-view";

// --- CONFIGURATION ---

const SCANNER_CONFIG = {
  fps: isIOSDevice ? 20 : 30, // iOS lebih stabil di FPS rendah
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return {
      width: Math.floor(minEdge * 0.7),
      height: Math.floor(minEdge * 0.7),
    };
  },
  aspectRatio: 1.777778, // 16:9
  disableFlip: false,
  rememberLastUsedCamera: true,
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
    Html5QrcodeSupportedFormats.PDF_417,
  ],
};

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose, onError }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // Status State
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Default true saat init
  const [isInitializing, setIsInitializing] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Hardware Features State
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [autoFocusEnabled, setAutoFocusEnabled] = useState(true);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isMountedRef = useRef(true);
  const startAttemptsRef = useRef(0);
  const scanDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // --- LIFECYCLE ---

  useEffect(() => {
    isMountedRef.current = true;
    
    // Mulai inisialisasi sistem kamera
    initializeCameraSystem();

    return () => {
      isMountedRef.current = false;
      cleanupScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- INITIALIZATION & PERMISSION ---

  const initializeCameraSystem = async () => {
    if (!isMountedRef.current) return;
    
    setIsInitializing(true);
    setErrorMessage('');
    
    try {
      // 1. Cek dukungan browser
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser tidak mendukung akses kamera');
      }

      // 2. Request Permission (Penting untuk iOS agar list kamera muncul)
      await requestCameraPermission();

      // 3. Ambil daftar kamera
      const devices = await getCameraList();

      if (!devices || devices.length === 0) {
        throw new Error('Tidak ada kamera yang ditemukan');
      }

      if (isMountedRef.current) {
        setCameras(devices);
        
        // 4. Pilih kamera optimal
        const optimalCameraId = selectOptimalCamera(devices);
        setSelectedCameraId(optimalCameraId);

        // 5. Mulai kamera otomatis
        // Note: Pada iOS kadang perlu trigger manual, tapi kita coba auto start dulu
        // dengan delay sedikit agar DOM siap
        setTimeout(() => {
            if (isMountedRef.current) {
                startCamera(optimalCameraId);
            }
        }, 500);
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

  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      // Pancing permission dengan stream sementara
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      });
      
      // Matikan stream segera setelah dapat izin
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error: any) {
      console.warn('Permission request failed:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
         setErrorMessage('Izin kamera ditolak. Harap izinkan akses di pengaturan browser.');
         setPermissionError(true);
      }
      return false;
    }
  };

  const getCameraList = async (): Promise<CameraDevice[]> => {
    try {
      return await Html5Qrcode.getCameras();
    } catch (error) {
      console.warn('Get cameras error, trying fallback enumeration:', error);
      // Fallback manual enumerateDevices
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        return videoDevices.map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Kamera ${index + 1}`
        }));
      } catch (e) {
        return [];
      }
    }
  };

  const selectOptimalCamera = (devices: CameraDevice[]): string => {
    if (!devices.length) return '';

    // Coba ambil preferensi terakhir
    const lastCameraId = localStorage.getItem('lastCameraId');
    
    // Logika Khusus iOS: Prioritaskan Back Camera
    if (isIOSDevice) {
       const backCamera = devices.find(c => 
         c.label.toLowerCase().includes('back') || 
         c.label.toLowerCase().includes('rear') || 
         c.label.toLowerCase().includes('environment') ||
         (c.label && c.label.match(/2$/)) // Back camera kadang berakhiran "2"
       );
       // Jika ada preferensi valid dan device ID masih ada, gunakan itu. 
       // Jika tidak, gunakan back camera yang ditemukan.
       if (lastCameraId && devices.some(d => d.id === lastCameraId)) return lastCameraId;
       return backCamera?.id || devices[0].id;
    }

    // Android/Desktop
    if (lastCameraId && devices.some(d => d.id === lastCameraId)) {
      return lastCameraId;
    }
    
    const backCamera = devices.find(c => 
        c.label.toLowerCase().includes('back') || 
        c.label.toLowerCase().includes('environment')
    );
    return backCamera?.id || devices[0].id;
  };

  // --- CORE CAMERA LOGIC ---

  const getVideoConstraints = (cameraId: string) => {
      // Base constraints
      const baseConstraints: any = {
          deviceId: { exact: cameraId }
      };

      if (isIOSDevice) {
          // iOS Specific Fixes:
          // 1. Resolusi Tinggi: Memaksa penggunaan lensa utama (Wide) yg punya autofocus
          // 2. Aspect Ratio 16:9 agar full screen
          return {
              ...baseConstraints,
              width: { min: 1280, ideal: 1920, max: 2560 }, // Resolusi tinggi = Autofocus aktif
              height: { min: 720, ideal: 1080 },
              facingMode: { ideal: "environment" } // Hint tambahan
          };
      } else {
          // Android/Desktop Fixes:
          // 1. Continuous Focus
          return {
              ...baseConstraints,
              width: { ideal: 1280 },
              height: { ideal: 720 },
              focusMode: "continuous", // Sinyal standar Android
              advanced: [{ focusMode: "continuous" }]
          };
      }
  };

  const startCamera = async (cameraId: string) => {
    if (!isMountedRef.current || !cameraId) return;
    if (isLoading && startAttemptsRef.current > 0) return; // Prevent double start

    setIsLoading(true);
    setPermissionError(false);
    setErrorMessage('');
    startAttemptsRef.current++;

    try {
        // Cleanup previous instance
        await stopCamera();

        const html5QrCode = new Html5Qrcode(containerId);
        scannerRef.current = html5QrCode;

        // Ambil constraints yang sudah dioptimalkan
        const videoConstraints = getVideoConstraints(cameraId);
        console.log('Starting with constraints:', videoConstraints);

        // Start scanning
        await html5QrCode.start(
            videoConstraints,
            SCANNER_CONFIG,
            onScanSuccessHandler,
            (errorMessage) => { 
                // Ignore frame scanning errors
            }
        );

        if (isMountedRef.current) {
            setIsScanning(true);
            setIsLoading(false);
            
            // Simpan preferensi
            localStorage.setItem('lastCameraId', cameraId);

            // Setup hardware features (Zoom/Flash)
            setTimeout(() => {
                setupCameraCapabilities();
                setupAutoFocus(); // Trigger re-focus
                // Set default zoom agak maju sedikit agar fokus lebih mudah
                if (!isIOSDevice) applyZoom(1.2); 
            }, 800);
        }

    } catch (error: any) {
        console.error('Start camera error:', error);
        
        if (isMountedRef.current) {
            // Handle error specific
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                setPermissionError(true);
                setErrorMessage('Akses kamera ditolak.');
                setIsLoading(false);
            } else {
                // Try fallback method jika gagal start normal
                if (startAttemptsRef.current < 2) {
                    console.log('Attempting fallback start...');
                    startCameraWithFallback(cameraId);
                } else {
                    setErrorMessage(`Gagal memulai kamera: ${error.message}`);
                    setIsLoading(false);
                    if (onError) onError(error.message);
                }
            }
        }
    }
  };

  const startCameraWithFallback = async (cameraId: string) => {
      try {
          if (!scannerRef.current) return;
          
          // Fallback menggunakan basic constraints tanpa resolusi tinggi
          const basicConstraints = {
              deviceId: { exact: cameraId },
              facingMode: isIOSDevice ? "environment" : undefined
          };

          await scannerRef.current.start(
              basicConstraints,
              { ...SCANNER_CONFIG, fps: 10 }, // Turunkan FPS di fallback
              onScanSuccessHandler,
              () => {}
          );

          if (isMountedRef.current) {
              setIsScanning(true);
              setIsLoading(false);
          }
      } catch (fallbackError: any) {
          console.error('Fallback failed:', fallbackError);
          setIsLoading(false);
          setErrorMessage('Gagal memulai kamera (Mode Fallback).');
      }
  };

  const stopCamera = async () => {
      if (scannerRef.current?.isScanning) {
          try {
              await scannerRef.current.stop();
              scannerRef.current.clear();
          } catch (e) { console.warn("Stop failed", e); }
      }

      // Stop stream tracks manual
      if (videoTrackRef.current) {
          videoTrackRef.current.stop();
          videoTrackRef.current = null;
      }
      
      if (isMountedRef.current) {
        setIsScanning(false);
        setIsFlashOn(false);
      }
  };

  const cleanupScanner = () => {
      stopCamera();
      scannerRef.current = null;
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = '';
  };

  // --- HARDWARE CAPABILITIES ---

  const setupCameraCapabilities = () => {
      const videoElement = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      if (!videoElement || !videoElement.srcObject) return;
      
      videoElementRef.current = videoElement;
      const stream = videoElement.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;

      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      const settings = track.getSettings ? track.getSettings() : {};

      // 1. Flash
      if ('torch' in capabilities || 'fillLightMode' in capabilities) {
          setHasFlash(true);
      }

      // 2. Zoom
      if ('zoom' in capabilities) {
          const zoomCaps = (capabilities as any).zoom;
          setZoomCap({
              min: zoomCaps.min || 1,
              max: Math.min(zoomCaps.max || 5, 5),
              step: zoomCaps.step || 0.1
          });
          const currentZoom = (settings as any).zoom || zoomCaps.min;
          setZoom(currentZoom);
      }

      // 3. Setup Manual Tap Focus Listener
      if (isIOSDevice || 'ontouchstart' in window) {
          setupTapToFocus(videoElement);
      }
  };

  const setupAutoFocus = () => {
      if (!videoTrackRef.current) return;
      // Coba paksa mode continuous
      try {
          videoTrackRef.current.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as any]
          });
          setAutoFocusEnabled(true);
      } catch (e) {
          console.log("Continuous focus constraint rejected (normal on some iOS)");
      }
  };

  const setupTapToFocus = (videoElement: HTMLVideoElement) => {
      // Menambahkan event listener ke container untuk tap to focus visual
      const container = document.getElementById(containerId);
      if (!container) return;

      const handleTap = (e: any) => {
          if (!videoTrackRef.current) return;
          
          const rect = container.getBoundingClientRect();
          const x = e.touches ? e.touches[0].clientX : e.clientX;
          const y = e.touches ? e.touches[0].clientY : e.clientY;
          
          // Visual Indicator
          showFocusIndicator(x - rect.left, y - rect.top);

          // Logic re-trigger focus
          // Pada web, kita tidak bisa kirim koordinat (X,Y) ke hardware kamera secara standar API.
          // Tapi, re-applying constraint seringkali memicu kamera untuk mencari fokus ulang (re-metering).
          setupAutoFocus();
      };

      container.addEventListener('touchstart', handleTap);
      container.addEventListener('click', handleTap);
      
      // Simpan referensi cleanup di state atau ref jika perlu, 
      // tapi karena component unmount membersihkan container, ini aman.
  };

  const showFocusIndicator = (x: number, y: number) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      
      const indicator = document.createElement('div');
      indicator.className = 'absolute w-16 h-16 border-2 border-yellow-400 rounded-full animate-ping pointer-events-none z-50';
      indicator.style.left = `${x - 32}px`;
      indicator.style.top = `${y - 32}px`;
      
      container.appendChild(indicator);
      setTimeout(() => indicator.remove(), 1000);
  };

  // --- ACTIONS ---

  const onScanSuccessHandler = (decodedText: string) => {
      if (scanDebounceRef.current) return;
      
      // Debounce logic
      scanDebounceRef.current = setTimeout(() => {
          scanDebounceRef.current = null;
      }, 1500);

      if (navigator.vibrate) navigator.vibrate(50);
      playScanSound();
      
      setScanCount(prev => prev + 1);
      onScanSuccess(decodedText);
  };

  const playScanSound = () => {
      try {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContext) {
              const ctx = new AudioContext();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 800;
              gain.gain.value = 0.1;
              osc.start();
              setTimeout(() => { osc.stop(); ctx.close(); }, 100);
          }
      } catch (e) {}
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newId = e.target.value;
      setSelectedCameraId(newId);
      startCamera(newId);
  };

  const toggleFlash = async () => {
      if (!videoTrackRef.current) return;
      const target = !isFlashOn;
      try {
          await videoTrackRef.current.applyConstraints({
              advanced: [{ torch: target } as any]
          });
          setIsFlashOn(target);
      } catch (e) {
          // Fallback iOS legacy
          try {
             await videoTrackRef.current.applyConstraints({
                 advanced: [{ fillLightMode: target ? "flash" : "off" } as any]
             });
             setIsFlashOn(target);
          } catch (e2) {}
      }
  };

  const applyZoom = async (value: number) => {
      setZoom(value);
      if (videoTrackRef.current) {
          try {
              await videoTrackRef.current.applyConstraints({
                  advanced: [{ zoom: value } as any]
              });
          } catch(e) {}
      }
  };

  const handleManualStart = () => {
      if (selectedCameraId) {
          startCamera(selectedCameraId);
      } else if (cameras.length > 0) {
          startCamera(cameras[0].id);
      } else {
          initializeCameraSystem();
      }
  };

  const handleCameraError = (error: any) => {
      let msg = 'Gagal mengakses kamera.';
      if (error.name === 'NotAllowedError') {
          msg = 'Izin kamera ditolak.';
          setPermissionError(true);
      } else if (error.name === 'NotFoundError') {
          msg = 'Kamera tidak ditemukan.';
      }
      setErrorMessage(msg);
      setIsLoading(false);
  };

  // --- RENDER HELPERS ---

  const renderLoading = () => (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-50">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-300">Menyiapkan Kamera...</p>
          {startAttemptsRef.current > 1 && <p className="text-xs text-gray-500 mt-2">Mencoba metode alternatif...</p>}
      </div>
  );

  const renderError = () => (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-6 z-50 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
             <i className="fa-solid fa-triangle-exclamation text-red-500 text-2xl"></i>
          </div>
          <h3 className="text-xl font-bold mb-2 text-white">Gagal Memulai</h3>
          <p className="text-gray-400 mb-6">{errorMessage}</p>
          <div className="flex gap-3 w-full max-w-xs">
              <button onClick={handleManualStart} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg">
                 Coba Lagi
              </button>
              <button onClick={() => window.location.reload()} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg">
                 Reload
              </button>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white">
      {/* HEADER */}
      <div className="flex justify-between items-center p-4 bg-gray-900 border-b border-gray-800 z-20 shadow-lg">
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 transition">
          <i className="fa-solid fa-arrow-left"></i>
        </button>

        <div className="text-center">
            <h1 className="font-bold text-lg">QR Scanner Pro</h1>
            <div className="text-xs text-gray-400 flex items-center justify-center gap-1">
                {isScanning ? <span className="text-green-400">● Kamera Aktif</span> : 'Standby'}
            </div>
        </div>

        <button 
          onClick={toggleFlash}
          disabled={!hasFlash || !isScanning}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition ${
            isFlashOn ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-gray-800 text-white'
          } ${!hasFlash ? 'opacity-30 cursor-not-allowed' : ''}`}
        >
          <i className={`fa-solid ${isFlashOn ? 'fa-bolt' : 'fa-bolt-lightning'}`}></i>
        </button>
      </div>

      {/* VIEWPORT */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
        <div id={containerId} className="w-full h-full object-cover"></div>

        {/* Scan Overlay */}
        {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                <div className="relative w-72 h-72">
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-xl"></div>
                    {/* Scan Line */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-blue-400 shadow-[0_0_20px_#3b82f6] animate-scan-down"></div>
                    {/* Text Hint */}
                    <div className="absolute -bottom-16 left-0 right-0 text-center">
                        <span className="bg-black/60 backdrop-blur px-4 py-2 rounded-full text-sm text-white border border-white/10">
                            Arahkan kamera ke QR Code
                        </span>
                        {isIOSDevice && <div className="text-xs text-gray-400 mt-2">Tap layar untuk fokus manual</div>}
                    </div>
                </div>
            </div>
        )}

        {/* States */}
        {isLoading && renderLoading()}
        {errorMessage && !isLoading && renderError()}
        {permissionError && !isLoading && renderError()}
        
        {/* Manual Start Button (if needed) */}
        {!isScanning && !isLoading && !errorMessage && (
             <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/80">
                 <button onClick={handleManualStart} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-3">
                     <i className="fa-solid fa-power-off"></i> Mulai Kamera
                 </button>
             </div>
        )}
      </div>

      {/* FOOTER CONTROLS */}
      <div className="bg-gray-900 p-4 pb-8 border-t border-gray-800 z-20 safe-area-bottom">
        {/* Zoom Slider */}
        {zoomCap && (
            <div className="mb-5 flex items-center gap-3 px-2">
                <i className="fa-solid fa-minus text-gray-500 text-xs"></i>
                <input 
                    type="range"
                    min={zoomCap.min}
                    max={zoomCap.max}
                    step={zoomCap.step}
                    value={zoom}
                    onChange={(e) => applyZoom(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <i className="fa-solid fa-plus text-gray-500 text-xs"></i>
            </div>
        )}

        <div className="flex gap-3">
             {/* Camera Selector */}
             <div className="relative flex-1">
                 <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <i className="fa-solid fa-camera"></i>
                 </div>
                 <select 
                    value={selectedCameraId}
                    onChange={handleCameraChange}
                    disabled={cameras.length === 0}
                    className="w-full bg-gray-800 text-white text-sm py-3.5 pl-10 pr-8 rounded-xl border border-gray-700 appearance-none focus:outline-none focus:border-blue-500 disabled:opacity-50"
                 >
                    <option value="" disabled>
                        {cameras.length === 0 ? "Mencari kamera..." : "Ganti Kamera"}
                    </option>
                    {cameras.map((cam, idx) => (
                        <option key={cam.id} value={cam.id}>
                            {cam.label || `Kamera ${idx + 1}`}
                        </option>
                    ))}
                 </select>
                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <i className="fa-solid fa-chevron-down text-xs"></i>
                 </div>
             </div>

             {/* Scan Counter */}
             <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 flex flex-col items-center justify-center min-w-[70px]">
                 <span className="text-xs text-gray-400">Scan</span>
                 <span className="text-blue-400 font-bold text-lg leading-none">{scanCount}</span>
             </div>
        </div>
      </div>
      
      <style>{`
        @keyframes scan-down {
            0% { top: 0; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
        .animate-scan-down {
            animation: scan-down 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .safe-area-bottom {
            padding-bottom: env(safe-area-inset-bottom, 20px);
        }
      `}</style>
    </div>
  );
};