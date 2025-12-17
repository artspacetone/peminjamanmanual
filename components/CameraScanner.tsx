import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

// Helper Deteksi iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // Status UI
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  // Fitur Hardware
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const mountedRef = useRef(true);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  // --- 1. INITIALIZATION & MEMORY ---
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      // Cek apakah ada kamera yang tersimpan di memori (LocalStorage)
      const savedCameraId = localStorage.getItem('scanner_camera_id');

      try {
        // Kita tetap butuh getCameras untuk mengisi list dropdown
        // Tapi jika ada savedId, kita bisa start scanner PARALEL agar terasa lebih cepat
        const devicesPromise = Html5Qrcode.getCameras();
        
        // Jika ada saved ID, langsung start tanpa menunggu list device selesai (Optimasi Loading)
        if (savedCameraId) {
            setSelectedCameraId(savedCameraId);
            startScanner(savedCameraId);
        }

        const devices = await devicesPromise;
        if (mountedRef.current && devices && devices.length > 0) {
           setCameras(devices);
           
           // Jika BELUM ada saved ID, baru kita cari otomatis
           if (!savedCameraId) {
               const backCam = devices.find(d => 
                   d.label.toLowerCase().includes('back') || 
                   d.label.toLowerCase().includes('belakang') || 
                   d.label.toLowerCase().includes('environment')
               );
               const targetId = backCam ? backCam.id : devices[devices.length - 1].id;
               
               setSelectedCameraId(targetId);
               localStorage.setItem('scanner_camera_id', targetId); // Simpan langsung
               startScanner(targetId);
           }
        } else {
           if (!savedCameraId) {
               setPermissionError(true);
               setIsLoading(false);
           }
        }
      } catch (err) {
        console.error("Init Error", err);
        setPermissionError(true);
        setIsLoading(false);
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, []);

  // --- 2. CORE SCANNER LOGIC ---
  const startScanner = async (cameraId: string) => {
    // Stop scanner lama jika ada
    if (scannerRef.current?.isScanning) {
        try { await scannerRef.current.stop(); } catch(e) {}
    }

    // Reset State Hardware
    setHasTorch(false);
    setTorchOn(false);
    setZoomCap(null);
    setZoom(1);

    if (!mountedRef.current) return;
    setIsLoading(true);

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    // KONFIGURASI KHUSUS PERANGKAT
    // iOS butuh FPS lebih rendah dan aspek rasio standar agar tidak nge-freeze
    const fpsConfig = isIOS() ? 10 : 20;
    
    // Constraints: Kunci perbaikan iOS
    const constraints: MediaTrackConstraints = {
        deviceId: { exact: cameraId },
        // iOS Safari suka freeze jika dipaksa resolusi custom tertentu
        // Kita gunakan range longgar agar browser memilih native resolution terbaik
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
    };

    // Tambahkan focusMode hanya jika BUKAN iOS (iOS handle fokus otomatis via OS)
    // Memaksa focusMode di iOS kadang bikin kamera gagal start
    if (!isIOS()) {
        (constraints as any).advanced = [{ focusMode: "continuous" }];
    }

    try {
        await html5QrCode.start(
            constraints,
            {
                fps: fpsConfig,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
                disableFlip: false, // Biarkan library mengatur flip
                formatsToSupport: [ 
                    Html5QrcodeSupportedFormats.CODE_128, 
                    Html5QrcodeSupportedFormats.EAN_13, 
                    Html5QrcodeSupportedFormats.QR_CODE 
                ]
            },
            (decodedText) => {
                if (navigator.vibrate) navigator.vibrate(200);
                onScanSuccess(decodedText);
                onClose();
            },
            () => {} // Error callback (ignore frame errors)
        );

        if (mountedRef.current) {
            setIsLoading(false);
            setIsScanning(true);
            
            // Setup Capabilities (Zoom & Torch)
            setTimeout(setupHardwareCapabilities, 500);
        }

    } catch (err) {
        console.error("Start Failed", err);
        if (mountedRef.current) {
            setIsLoading(false);
            // Jangan langsung error, coba fallback ke mode environment tanpa ID jika gagal (fail-safe)
            // Ini berguna terutama di iOS jika ID berubah
            alert("Gagal memulai kamera. Silakan pilih kamera lain atau refresh.");
        }
    }
  };

  const stopScanner = async () => {
      if (scannerRef.current) {
          try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
      }
  };

  // --- 3. HARDWARE LOGIC (ZOOM & TORCH) ---
  const setupHardwareCapabilities = () => {
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      if (!video || !video.srcObject) return;

      // Styling Video agar Full Cover
      video.style.objectFit = "cover";
      video.style.width = "100%";
      video.style.height = "100%";

      const stream = video.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      const caps: any = track.getCapabilities ? track.getCapabilities() : {};

      // 1. Setup Torch
      if (caps.torch) {
          setHasTorch(true);
      }

      // 2. Setup Zoom
      if (caps.zoom) {
          const min = caps.zoom.min || 1;
          const max = Math.min(caps.zoom.max || 5, 10); // Limit max zoom
          setZoomCap({
              min: min,
              max: max,
              step: caps.zoom.step || 0.1
          });
          
          // Auto Zoom Sedikit (1.5x) untuk menghindari blur jarak dekat (Macro issue)
          const optimalZoom = Math.min(1.5, max);
          applyZoom(optimalZoom, track);
      }
  };

  const applyZoom = async (val: number, trackParam?: MediaStreamTrack) => {
      const track = trackParam || trackRef.current;
      if (track) {
          try {
              await track.applyConstraints({ advanced: [{ zoom: val }] } as any);
              setZoom(val);
          } catch (e) { console.warn("Zoom fail", e); }
      }
  };

  const toggleTorch = async () => {
      const track = trackRef.current;
      if (track && hasTorch) {
          try {
              const next = !torchOn;
              await track.applyConstraints({ advanced: [{ torch: next }] } as any);
              setTorchOn(next);
          } catch (e) { console.warn("Torch fail", e); }
      }
  };

  // Handler Ganti Kamera
  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newId = e.target.value;
      setSelectedCameraId(newId);
      localStorage.setItem('scanner_camera_id', newId); // Simpan pilihan user!
      startScanner(newId);
  };

  // --- 4. RENDER UI ---
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white">
      
      {/* Header */}
      <div className="bg-slate-900 px-4 py-3 flex justify-between items-center shadow-lg z-20 shrink-0 border-b border-slate-800">
         <h3 className="font-bold text-lg flex items-center gap-2 text-white">
            <i className="fa-solid fa-qrcode text-green-500"></i> Scan Barcode
         </h3>
         <button onClick={onClose} className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-red-500 transition-colors">
            <i className="fa-solid fa-xmark"></i>
         </button>
      </div>

      {/* Main Scanner Viewport */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
         
         {/* Container Library */}
         <div id="reader-custom-view" className="w-full h-full bg-black relative"></div>

         {/* Loading State */}
         {isLoading && (
             <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90">
                 <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-3"></div>
                 <p className="text-slate-400 text-sm font-medium">Memuat Kamera...</p>
             </div>
         )}

         {/* Error State */}
         {permissionError && !isLoading && (
             <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
                 <i className="fa-solid fa-triangle-exclamation text-yellow-500 text-4xl mb-4"></i>
                 <h3 className="text-lg font-bold mb-2">Kamera Tidak Dapat Diakses</h3>
                 <p className="text-slate-400 text-sm mb-6">Pastikan izin kamera diberikan di browser Anda.</p>
                 <button onClick={() => window.location.reload()} className="bg-blue-600 px-6 py-2 rounded-lg font-bold">Refresh Halaman</button>
             </div>
         )}

         {/* Visual Scanner Overlay */}
         {!isLoading && !permissionError && (
             <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                {/* Kotak Scanner */}
                <div className="w-[260px] h-[260px] relative">
                    {/* Sudut Hijau */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                    
                    {/* Laser Merah Animasi */}
                    <div className="absolute w-full h-0.5 bg-red-500 top-1/2 shadow-[0_0_15px_red] animate-[pulse_1.5s_ease-in-out_infinite]"></div>
                    
                    {/* Overlay Gelap di Luar Kotak */}
                    <div className="absolute -inset-[100vh] border-[100vh] border-black/60 -z-10"></div>
                </div>
                
                {/* Petunjuk Text */}
                <div className="mt-8 bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10">
                    <p className="text-white/90 text-xs font-medium">Jarak Optimal: 15-25cm</p>
                </div>
             </div>
         )}
      </div>

      {/* Footer Controls */}
      {!permissionError && (
          <div className="bg-slate-900 p-4 border-t border-slate-800 z-20 shrink-0 space-y-3 pb-8">
             
             {/* Slider Zoom */}
             {zoomCap ? (
                 <div className="flex items-center gap-3 px-1">
                     <i className="fa-solid fa-minus text-slate-500 text-xs"></i>
                     <input 
                        type="range" 
                        min={zoomCap.min} max={zoomCap.max} step={zoomCap.step} 
                        value={zoom} 
                        onChange={(e) => applyZoom(parseFloat(e.target.value))} 
                        className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                     />
                     <i className="fa-solid fa-plus text-slate-500 text-xs"></i>
                     <span className="text-xs font-bold w-8 text-right text-blue-400">{zoom.toFixed(1)}x</span>
                 </div>
             ) : (
                 <p className="text-center text-[10px] text-slate-500 h-6 pt-1">Zoom tidak tersedia di kamera ini</p>
             )}

             {/* Kontrol Bawah: Kamera & Flash */}
             <div className="flex gap-2 h-12">
                 {/* Dropdown Kamera */}
                 <div className="relative flex-1 bg-slate-800 rounded-xl border border-slate-700">
                     <select 
                        className="w-full h-full bg-transparent text-white pl-3 pr-8 text-sm font-bold outline-none appearance-none"
                        value={selectedCameraId}
                        onChange={handleCameraChange}
                     >
                        {cameras.map((c, i) => (
                            <option key={c.id} value={c.id} className="bg-slate-800 text-white">
                                {c.label || `Kamera ${i+1}`}
                            </option>
                        ))}
                     </select>
                     <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <i className="fa-solid fa-caret-down"></i>
                     </div>
                 </div>

                 {/* Tombol Flash */}
                 {hasTorch && (
                     <button 
                        onClick={toggleTorch}
                        className={`w-12 h-full rounded-xl flex items-center justify-center transition-all border ${
                            torchOn 
                            ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/30' 
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                     >
                        <i className={`fa-solid ${torchOn ? 'fa-bolt' : 'fa-bolt'}`}></i>
                     </button>
                 )}
             </div>
          </div>
      )}
    </div>
  );
};