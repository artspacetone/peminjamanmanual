import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

const CONTAINER_ID = "reader-custom-view";

// --- KONFIGURASI VIDEO & AUTOFOCUS ---
// Pengaturan ini krusial untuk autofocus di Android & pemilihan lensa tepat di iOS
const VIDEO_CONSTRAINTS = {
  focusMode: 'continuous',              // Standar Android/Chrome
  advanced: [{ focusMode: 'continuous' }], // Syntax alternatif
  // Resolusi ini membantu iPhone memilih lensa "Utama", bukan lensa "Ultra Wide"
  width: { min: 720, ideal: 1280, max: 1920 },
  height: { min: 720, ideal: 720, max: 1080 },
  aspectRatio: { ideal: 1.7777777778 }  // 16:9
};

const SCANNER_CONFIG = {
  fps: 20, // 20-30 FPS cukup untuk barcode, lebih stabil
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return {
      width: Math.floor(minEdge * 0.7),
      height: Math.floor(minEdge * 0.7),
    };
  },
  aspectRatio: 1.0,
  disableFlip: false,
  // Kita inject video constraints di sini agar berlaku global
  videoConstraints: VIDEO_CONSTRAINTS,
  supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
  formatsToSupport: [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.PDF_417,
  ],
};

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fitur Kamera
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isFirstLoad = useRef(true);

  // --- LOGIKA UTAMA ---

  const startScanner = useCallback(async (cameraIdOrConfig: string | MediaTrackConstraints) => {
    // Stop jika sedang jalan
    if (scannerRef.current?.isScanning) {
      await stopScanner();
    }

    setIsLoading(true);
    setPermissionError(false);
    setHasFlash(false);
    setZoomCap(null);

    const container = document.getElementById(CONTAINER_ID);
    if (container) container.innerHTML = '';

    try {
      const html5QrCode = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = html5QrCode;

      // MENYIAPKAN KONFIGURASI KAMERA
      let finalConfig;

      if (typeof cameraIdOrConfig === 'string') {
        // Jika User memilih kamera spesifik (Dropdown)
        // Kita gabungkan deviceId dengan constraint Autofocus
        finalConfig = { 
            deviceId: { exact: cameraIdOrConfig },
            ...VIDEO_CONSTRAINTS 
        };
      } else {
        // Jika inisialisasi awal (Otomatis)
        // Pakai facingMode environment + Autofocus constraints
        finalConfig = { 
            facingMode: "environment",
            ...VIDEO_CONSTRAINTS 
        };
      }

      await html5QrCode.start(
        finalConfig, 
        SCANNER_CONFIG,
        (decodedText) => {
          // Success Callback
          if (navigator.vibrate) navigator.vibrate(50);
          setScanCount((prev) => prev + 1);
          onScanSuccess(decodedText);
           
           // Pause sebentar agar tidak spam scan
           html5QrCode.pause(true);
           setTimeout(() => html5QrCode.resume(), 1500);
        },
        (errorMessage) => {
          // Ignore scanning errors
        }
      );

      setIsScanning(true);
      setIsLoading(false);

      // Setup fitur Zoom & Flash setelah kamera siap
      setupCameraCapabilities();

      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        fetchCameras();
      }

    } catch (err: any) {
      console.error("Error starting scanner:", err);
      setIsLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError(true);
      } else {
        // Fallback: Jika gagal, coba mode user (kamera depan) sebagai opsi terakhir
        if (typeof cameraIdOrConfig === 'object' && (cameraIdOrConfig as any).facingMode === 'environment') {
            startScanner({ facingMode: "user" });
        }
      }
    }
  }, [onScanSuccess]);

  const fetchCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        
        // Cek kamera mana yang sedang aktif
        const currentTrack = videoTrackRef.current;
        if (currentTrack) {
            const activeLabel = currentTrack.label;
            const activeDevice = devices.find(d => d.label === activeLabel);
            if (activeDevice) setSelectedCameraId(activeDevice.id);
        }
      }
    } catch (err) {
      console.warn("Gagal fetch cameras:", err);
    }
  };

  const setupCameraCapabilities = () => {
    // Delay sedikit agar hardware siap melapor capabilities
    setTimeout(() => {
      const videoElement = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
      if (!videoElement || !videoElement.srcObject) return;

      const stream = videoElement.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;

      // Paksa re-apply constraint untuk memancing autofocus di beberapa device Android
      try {
        track.applyConstraints(VIDEO_CONSTRAINTS as any);
      } catch (e) {
        console.log("Auto-apply constraint warning:", e);
      }

      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      const settings = track.getSettings ? track.getSettings() : {};

      // Flash
      if ('torch' in capabilities || 'fillLightMode' in capabilities) {
        setHasFlash(true);
      }

      // Zoom
      if ('zoom' in capabilities) {
        const zoomCapObj = (capabilities as any).zoom;
        setZoomCap({
          min: zoomCapObj.min,
          max: zoomCapObj.max,
          step: zoomCapObj.step || 0.1
        });
        
        const currentZoom = (settings as any).zoom || zoomCapObj.min;
        setZoom(currentZoom);
      }
    }, 1000);
  };

  const handleZoom = async (val: number) => {
    setZoom(val);
    if (videoTrackRef.current) {
      try {
        await videoTrackRef.current.applyConstraints({
          advanced: [{ zoom: val } as any]
        });
      } catch (e) {
        console.error("Gagal zoom manual:", e);
      }
    }
  };

  const toggleFlash = async () => {
    if (!videoTrackRef.current) return;
    try {
      const track = videoTrackRef.current;
      const targetStatus = !isFlashOn;
      await track.applyConstraints({
        advanced: [{ torch: targetStatus } as any]
      });
      setIsFlashOn(targetStatus);
    } catch (e) {
      // Fallback
      try {
         await videoTrackRef.current?.applyConstraints({
            advanced: [{ fillLightMode: !isFlashOn ? "flash" : "off" } as any]
         });
         setIsFlashOn(!isFlashOn);
      } catch (e2) {}
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
        try {
            await scannerRef.current.stop();
            scannerRef.current.clear();
        } catch (e) {}
    }
    setIsScanning(false);
    setIsFlashOn(false);
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    startScanner(newId);
  };

  // --- EFFECT ---
  useEffect(() => {
    // Start langsung dengan environment mode (Auto Focus diutamakan via constraints)
    startScanner({ facingMode: "environment" });

    return () => {
      stopScanner();
    };
    // eslint-disable-next-line
  }, []);

  // --- RENDER ---
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header */}
      <div className="bg-slate-900 px-4 py-3 flex justify-between items-center z-20 shadow-lg border-b border-slate-700">
        <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 transition"
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        
        <div className="text-center">
            <h3 className="text-white font-bold text-sm">Scanner Pro</h3>
            <span className="text-xs text-green-400">
                {isScanning ? 'Auto Focus Active' : 'Starting...'}
            </span>
        </div>

        <button 
            onClick={toggleFlash}
            disabled={!hasFlash || !isScanning}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
                !hasFlash ? 'opacity-0 pointer-events-none' : 
                isFlashOn ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-slate-800 text-white'
            }`}
        >
            <i className={`fa-solid ${isFlashOn ? 'fa-bolt' : 'fa-bolt-lightning'}`}></i>
        </button>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
        <div id={CONTAINER_ID} className="w-full h-full object-cover"></div>

        {/* Scan Frame */}
        {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-[280px] h-[280px] md:w-[350px] md:h-[350px]">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>
                    
                    {/* Animasi Garis Scan */}
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-green-400 shadow-[0_0_10px_#4ade80] animate-scan-line"></div>
                </div>
                
                {/* Hint Text */}
                <div className="absolute bottom-20 text-white/70 text-sm bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                    Arahkan kamera ke barcode
                </div>
            </div>
        )}

        {/* Loading */}
        {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30">
                <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-white text-sm font-medium">Mengaktifkan Autofocus...</p>
            </div>
        )}

        {/* Error State */}
        {permissionError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-6 z-40 text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                    <i className="fa-solid fa-camera-slash text-red-500 text-2xl"></i>
                </div>
                <h3 className="text-white font-bold text-lg mb-2">Izin Kamera Diperlukan</h3>
                <p className="text-slate-400 text-sm mb-6">
                    {isIOS ? 'Buka Pengaturan > Safari > Kamera > Izinkan.' : 'Izinkan akses kamera pada browser.'}
                </p>
                <button onClick={() => window.location.reload()} className="bg-green-600 hover:bg-green-700 text-white py-2 px-6 rounded-lg">
                    Refresh
                </button>
            </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-slate-900 p-4 border-t border-slate-700 pb-8 safe-area-bottom">
        
        {/* Manual Zoom Slider */}
        {zoomCap && (
            <div className="mb-4 flex items-center gap-3 px-2">
                <i className="fa-solid fa-minus text-slate-400 text-xs"></i>
                <input 
                    type="range" 
                    min={zoomCap.min} 
                    max={zoomCap.max} 
                    step={zoomCap.step}
                    value={zoom}
                    onChange={(e) => handleZoom(parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500"
                />
                <i className="fa-solid fa-plus text-slate-400 text-xs"></i>
            </div>
        )}

        <div className="flex gap-3">
             <div className="relative flex-1">
                <select 
                    value={selectedCameraId}
                    onChange={handleCameraChange}
                    disabled={cameras.length === 0}
                    className="w-full bg-slate-800 text-white text-sm py-3 px-4 rounded-xl border border-slate-700 appearance-none focus:outline-none focus:border-green-500"
                >
                    <option value="" disabled>
                        {cameras.length === 0 ? "Menyiapkan kamera..." : "Ganti Kamera"}
                    </option>
                    {cameras.map((cam, idx) => (
                        <option key={cam.id} value={cam.id}>
                            {cam.label || `Kamera ${idx + 1}`}
                        </option>
                    ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <i className="fa-solid fa-chevron-down text-xs"></i>
                </div>
             </div>

             <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 flex items-center justify-center min-w-[80px]">
                <span className="text-green-400 font-bold mr-2">{scanCount}</span>
                <i className="fa-solid fa-qrcode text-slate-500 text-xs"></i>
             </div>
        </div>
      </div>
    </div>
  );
};