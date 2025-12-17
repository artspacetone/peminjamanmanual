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
  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
};

const CONTAINER_ID = "reader-custom-view";

// --- CONFIGURATION ---

const SCANNER_CONFIG = {
  fps: 25, // 25 FPS seimbang untuk performa dan penggunaan baterai
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    // Area scan responsif (kotak di tengah)
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return {
      width: Math.floor(minEdge * 0.7),
      height: Math.floor(minEdge * 0.7),
    };
  },
  aspectRatio: 1.777778, // 16:9 Fullscreen aspect ratio
  disableFlip: false,
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
  const [isLoading, setIsLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Hardware Features State
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isMountedRef = useRef(true);
  const isIOSDevice = useRef(isIOS());
  const scanThrottleRef = useRef(false);

  // --- LIFECYCLE ---

  useEffect(() => {
    isMountedRef.current = true;
    
    // Inisialisasi awal: Langsung coba buka kamera belakang
    startScanner({ facingMode: "environment" });

    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- CORE FUNCTIONS ---

  /**
   * Fungsi Utama Memulai Scanner
   * Menerima config berupa object (untuk facingMode) atau string (untuk deviceId spesifik)
   */
  const startScanner = useCallback(async (cameraConfig: string | MediaTrackConstraints) => {
    if (!isMountedRef.current) return;

    // 1. Cleanup instance lama jika ada
    if (scannerRef.current?.isScanning) {
      await stopScanner();
    }

    // 2. Reset State UI
    setIsLoading(true);
    setPermissionError(false);
    setErrorMessage('');
    setHasFlash(false);
    setZoomCap(null);

    // 3. Pastikan container bersih
    const container = document.getElementById(CONTAINER_ID);
    if (container) container.innerHTML = '';

    try {
      const html5QrCode = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = html5QrCode;

      // 4. Tentukan Constraints Video (Kunci Perbaikan iOS)
      const isEnvironment = typeof cameraConfig === 'object' && cameraConfig.facingMode === 'environment';
      
      const videoConstraints: MediaTrackConstraints = {
        // Jika config adalah string ID, gunakan deviceId. Jika object, gunakan facingMode.
        ...(typeof cameraConfig === 'string' ? { deviceId: { exact: cameraConfig } } : cameraConfig),
        
        // Resolusi: Sangat penting untuk iOS.
        // Resolusi tinggi memaksa iPhone menggunakan lensa UTAMA (Wide) yang support Autofocus.
        // Resolusi rendah sering melempar ke lensa Ultra Wide (Fixed Focus).
        width: { min: 720, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        
        // Focus Mode untuk Android
        ...(isIOSDevice.current ? {} : { focusMode: "continuous" })
      };

      // 5. Start Scanning
      await html5QrCode.start(
        videoConstraints, 
        SCANNER_CONFIG,
        onScanSuccessHandler,
        (err) => { 
          // Error scanning frame-by-frame (diabaikan agar console tidak penuh) 
        }
      );

      // 6. Post-Start Setup
      if (isMountedRef.current) {
        setIsScanning(true);
        setIsLoading(false);
        
        // Setup kapabilitas hardware (Zoom/Flash) setelah delay agar kamera siap
        setTimeout(() => {
            setupCameraCapabilities();
            fetchCameras(); // Ambil list kamera untuk dropdown
        }, 500);
      }

    } catch (err: any) {
      console.error("Error starting camera:", err);
      if (isMountedRef.current) {
        setIsLoading(false);
        handleError(err);
      }
    }
  }, []);

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        console.warn("Failed to stop scanner", e);
      }
    }
    
    // Stop tracks manual untuk mematikan lampu flash & kamera sepenuhnya
    if (videoTrackRef.current) {
      videoTrackRef.current.stop();
      videoTrackRef.current = null;
    }

    if (isMountedRef.current) {
      setIsScanning(false);
      setIsFlashOn(false);
    }
  };

  const handleError = (error: any) => {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      setPermissionError(true);
      setErrorMessage("Akses kamera ditolak. Mohon izinkan akses di pengaturan browser.");
    } else if (error.name === 'NotFoundError') {
      setErrorMessage("Kamera tidak ditemukan pada perangkat ini.");
    } else if (error.name === 'NotReadableError') {
      setErrorMessage("Kamera sedang digunakan oleh aplikasi lain.");
    } else {
      setErrorMessage("Gagal memulai kamera. Silakan coba lagi.");
    }
    if (onError) onError(errorMessage);
  };

  // --- HARDWARE CAPABILITIES (ZOOM & FLASH) ---

  const setupCameraCapabilities = () => {
    const videoElement = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
    if (!videoElement || !videoElement.srcObject) return;

    const stream = videoElement.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    videoTrackRef.current = track;

    // Apply Focus Mode Continuous (Android fix)
    try {
        if (!isIOSDevice.current && track.getCapabilities && 'focusMode' in track.getCapabilities()) {
             track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] });
        }
    } catch (e) { /* Ignore focus error */ }

    // Get Capabilities
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    const settings = track.getSettings ? track.getSettings() : {};

    // 1. Setup Flash
    if ('torch' in capabilities || 'fillLightMode' in capabilities) {
      setHasFlash(true);
    }

    // 2. Setup Zoom
    if ('zoom' in capabilities) {
      const zoomCaps = (capabilities as any).zoom;
      setZoomCap({
        min: zoomCaps.min,
        max: Math.min(zoomCaps.max, 5), // Batasi max zoom agar tidak pecah
        step: zoomCaps.step || 0.1
      });
      const currentZoom = (settings as any).zoom || zoomCaps.min;
      setZoom(currentZoom);
    } else {
        // Jika browser tidak lapor capability zoom (biasa di iOS lama), kita sembunyikan slider
        setZoomCap(null); 
    }
  };

  const handleZoom = async (value: number) => {
    if (!videoTrackRef.current || !zoomCap) return;
    setZoom(value);
    
    try {
      await videoTrackRef.current.applyConstraints({
        advanced: [{ zoom: value } as any]
      });
    } catch (e) {
      console.warn("Zoom not supported directly:", e);
    }
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
       // Fallback untuk iOS lama atau standar berbeda
       try {
         await videoTrackRef.current.applyConstraints({
            advanced: [{ fillLightMode: target ? "flash" : "off" } as any]
         });
         setIsFlashOn(target);
       } catch (e2) {
         console.warn("Flash toggle failed");
       }
    }
  };

  // --- UTILS ---

  const fetchCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        
        // Sync dropdown dengan kamera yang aktif
        const currentTrack = videoTrackRef.current;
        if (currentTrack) {
            const activeDevice = devices.find(d => d.label === currentTrack.label);
            if (activeDevice) setSelectedCameraId(activeDevice.id);
        }
      }
    } catch (err) {
      console.warn("Failed to get cameras", err);
    }
  };

  const onScanSuccessHandler = (decodedText: string) => {
    // Throttle: Cegah scan beruntun terlalu cepat
    if (scanThrottleRef.current) return;
    scanThrottleRef.current = true;

    // Efek Getar/Suara
    if (navigator.vibrate) navigator.vibrate(50);
    playBeep();

    setScanCount(prev => prev + 1);
    onScanSuccess(decodedText);

    // Pause sebentar
    setTimeout(() => {
        scanThrottleRef.current = false;
    }, 1500);
  };

  const playBeep = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.value = 800;
        osc.type = "sine";
        gain.gain.value = 0.1;
        
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 100);
    } catch (e) {}
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    // Restart dengan ID spesifik
    startScanner(newId);
  };

  // Visual feedback untuk tap to focus
  const handleTapToFocus = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    // Note: Web API belum mendukung tap-to-focus manual dengan koordinat secara luas.
    // Trik ini hanya memberi visual feedback dan memicu re-focus otomatis OS pada beberapa device.
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const indicator = document.createElement('div');
    indicator.className = 'absolute border-2 border-yellow-400 rounded-full w-16 h-16 animate-ping pointer-events-none z-50';
    indicator.style.left = `${x - rect.left - 32}px`;
    indicator.style.top = `${y - rect.top - 32}px`;
    
    container.appendChild(indicator);
    setTimeout(() => indicator.remove(), 1000);

    // Coba trigger focus continuous lagi
    if (videoTrackRef.current && !isIOSDevice.current) {
        try {
            videoTrackRef.current.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
        } catch(err) {}
    }
  };

  // --- RENDER ---

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white">
      {/* 1. Header */}
      <div className="flex justify-between items-center p-4 bg-gray-900 border-b border-gray-800 z-20 shadow-lg">
        <button 
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 transition"
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>

        <div className="text-center">
            <h1 className="font-bold text-lg">QR Scanner</h1>
            <div className="text-xs text-green-400 flex items-center justify-center gap-1">
                {isScanning ? (
                    <><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Aktif</>
                ) : 'Memuat...'}
            </div>
        </div>

        <button 
          onClick={toggleFlash}
          disabled={!hasFlash || !isScanning}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition ${
            isFlashOn ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/50' : 'bg-gray-800 text-white'
          } ${!hasFlash ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-700'}`}
        >
          <i className={`fa-solid ${isFlashOn ? 'fa-bolt' : 'fa-bolt-lightning'}`}></i>
        </button>
      </div>

      {/* 2. Viewport Kamera */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
        {/* Container Library */}
        <div id={CONTAINER_ID} className="w-full h-full object-cover"></div>

        {/* Overlay Tap Area */}
        {isScanning && (
            <div 
                className="absolute inset-0 z-10 cursor-crosshair" 
                onClick={handleTapToFocus}
                onTouchStart={handleTapToFocus}
            />
        )}

        {/* Overlay Bingkai Scan */}
        {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                <div className="relative w-64 h-64 md:w-80 md:h-80">
                    {/* Sudut Bingkai */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-xl"></div>
                    
                    {/* Garis Scan Animasi */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_15px_#3b82f6] animate-scan-down"></div>
                    
                    {/* Helper Text */}
                    <div className="absolute -bottom-12 left-0 right-0 text-center">
                         <span className="bg-black/60 px-3 py-1 rounded-full text-sm text-gray-200 backdrop-blur-sm">
                            Arahkan ke kode QR/Barcode
                         </span>
                    </div>
                </div>
            </div>
        )}

        {/* State Loading */}
        {isLoading && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-30">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-300 animate-pulse">Menyiapkan Kamera...</p>
             </div>
        )}

        {/* State Error Permission */}
        {permissionError && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 p-6 z-40 text-center">
                 <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                    <i className="fa-solid fa-video-slash text-red-500 text-2xl"></i>
                 </div>
                 <h3 className="text-xl font-bold mb-2">Izin Ditolak</h3>
                 <p className="text-gray-400 mb-6 max-w-xs">{errorMessage}</p>
                 <button 
                    onClick={() => window.location.reload()}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition"
                 >
                    Muat Ulang Halaman
                 </button>
             </div>
        )}
      </div>

      {/* 3. Footer Controls */}
      <div className="bg-gray-900 p-4 pb-8 border-t border-gray-800 z-20 safe-area-bottom">
        
        {/* Slider Zoom (Hanya muncul jika device support) */}
        {zoomCap && (
            <div className="mb-5 flex items-center gap-3 px-2">
                <i className="fa-solid fa-minus text-gray-500 text-xs"></i>
                <input 
                    type="range"
                    min={zoomCap.min}
                    max={zoomCap.max}
                    step={zoomCap.step}
                    value={zoom}
                    onChange={(e) => handleZoom(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <i className="fa-solid fa-plus text-gray-500 text-xs"></i>
            </div>
        )}

        <div className="flex gap-3">
             {/* Dropdown Kamera */}
             <div className="relative flex-1">
                 <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <i className="fa-solid fa-camera"></i>
                 </div>
                 <select 
                    value={selectedCameraId}
                    onChange={handleCameraChange}
                    disabled={cameras.length === 0}
                    className="w-full bg-gray-800 text-white text-sm py-3.5 pl-10 pr-8 rounded-xl border border-gray-700 appearance-none focus:outline-none focus:border-blue-500"
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

             {/* Counter */}
             <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 flex flex-col items-center justify-center min-w-[70px]">
                 <span className="text-xs text-gray-400">Scan</span>
                 <span className="text-blue-400 font-bold text-lg leading-none">{scanCount}</span>
             </div>
        </div>
      </div>
      
      {/* 4. Global Styles for Animation */}
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