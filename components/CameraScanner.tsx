import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Zoom State
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const mountedRef = useRef(true);

  // Ukuran Box Scan (Tetap & Konsisten)
  const SCAN_REGION_SIZE = { width: 280, height: 280 };

  // --- 1. INISIALISASI ---
  useEffect(() => {
    mountedRef.current = true;
    
    // Minta izin dan cari kamera terbaik
    initializeCameras();

    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, []);

  const initializeCameras = async () => {
    try {
      // Pancing izin browser
      await Html5Qrcode.getCameras();
      const devices = await Html5Qrcode.getCameras();

      if (devices && devices.length > 0) {
        setCameras(devices);
        
        // LOGIKA PINTAR PEMILIHAN KAMERA (Anti-Blur)
        // 1. Cari semua kamera belakang
        const backCameras = devices.filter(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') || 
            d.label.toLowerCase().includes('environment')
        );

        let bestCameraId = devices[0].id;

        if (backCameras.length > 0) {
            // 2. Filter kamera "Ultra Wide" atau "0.5x" (Karena biasanya fixed focus/blur buat barcode)
            const mainCameras = backCameras.filter(d => 
                !d.label.toLowerCase().includes('ultra') && 
                !d.label.toLowerCase().includes('0.5') &&
                !d.label.toLowerCase().includes('macro')
            );

            // 3. Jika ada kamera "Main", pakai itu. Jika tidak, pakai kamera belakang apapun yang terakhir.
            if (mainCameras.length > 0) {
                // Biasanya kamera terakhir di list 'mainCameras' adalah yang resolusi tertinggi di Android
                bestCameraId = mainCameras[mainCameras.length - 1].id;
            } else {
                bestCameraId = backCameras[backCameras.length - 1].id;
            }
        }

        setSelectedCameraId(bestCameraId);
        // Start otomatis dengan kamera terpilih
        startScanner(bestCameraId);
      } else {
        setErrorMsg("Tidak ada kamera terdeteksi.");
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Gagal akses kamera. Pastikan izin diberikan.");
      setIsLoading(false);
    }
  };

  // --- 2. LOGIKA START SCANNER (Robust) ---
  const startScanner = async (cameraId: string) => {
    // Cleanup scanner lama
    if (scannerRef.current) {
        try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch (e) {}
    }

    setIsLoading(true);
    setErrorMsg('');
    setZoom(1);
    setZoomCap(null);

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    // Config: 720p adalah sweet spot (Tajam tapi ringan)
    // Jangan pakai 4K (Autofocus lambat)
    // Jangan pakai 480p (Barcode blur)
    const constraints = {
        deviceId: { exact: cameraId },
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        advanced: [{ focusMode: "continuous" }] // Wajib untuk Android
    };

    const qrConfig = {
        fps: 15, // Stabil
        qrbox: SCAN_REGION_SIZE,
        aspectRatio: 1.0,
        disableFlip: false,
        formatsToSupport: [ 
            Html5QrcodeSupportedFormats.CODE_128, 
            Html5QrcodeSupportedFormats.EAN_13, 
            Html5QrcodeSupportedFormats.QR_CODE 
        ]
    };

    try {
        await html5QrCode.start(
            constraints, 
            qrConfig, 
            (decodedText) => {
                if (navigator.vibrate) navigator.vibrate(200);
                onScanSuccess(decodedText);
                onClose();
            },
            () => {} 
        );

        if (mountedRef.current) {
            setIsLoading(false);
            setIsScanning(true);
            setTimeout(setupCapabilities, 500); // Tunggu sebentar baru load Zoom
        }

    } catch (err) {
        console.warn("Start High-Res failed, trying fallback...", err);
        // Fallback: Coba tanpa constraints resolusi (Mode Aman)
        try {
            await html5QrCode.start(cameraId, { fps: 15, qrbox: SCAN_REGION_SIZE }, 
                (t) => { onScanSuccess(t); onClose(); }, () => {}
            );
            if (mountedRef.current) {
                setIsLoading(false);
                setIsScanning(true);
            }
        } catch (finalErr) {
            setErrorMsg("Kamera gagal dimulai. Coba pilih kamera lain.");
            setIsLoading(false);
        }
    }
  };

  const stopScanner = async () => {
      if (scannerRef.current?.isScanning) {
          try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
      }
  };

  // --- 3. HARDWARE CAPABILITIES (ZOOM) ---
  const setupCapabilities = () => {
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      if (!video || !video.srcObject) return;

      // FIX TAMPILAN: Pastikan video full cover container
      video.style.objectFit = "cover";

      const stream = video.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities ? track.getCapabilities() : {};

      if (caps.zoom) {
          setZoomCap({
              min: caps.zoom.min || 1,
              max: Math.min(caps.zoom.max || 5, 5), // Batasi max 5x agar tidak pecah
              step: caps.zoom.step || 0.1
          });
          // Auto zoom sedikit (1.2x) untuk memancing fokus lensa
          track.applyConstraints({ advanced: [{ zoom: 1.2 }] }).catch(()=>{});
          setZoom(1.2);
      }
  };

  const applyZoom = (val: number) => {
      setZoom(val);
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ zoom: val }] }).catch(()=>{});
  };

  // --- 4. RENDER UI ---
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white font-sans">
      
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center shadow-lg z-20 shrink-0">
         <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
                <i className="fa-solid fa-qrcode text-white text-sm"></i>
            </div>
            <span className="font-bold text-lg">Scanner Pro</span>
         </div>
         <button onClick={onClose} className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-colors">
            <i className="fa-solid fa-xmark"></i>
         </button>
      </div>

      {/* Main Scanner Area */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
         
         {/* Container Video Library */}
         <div id="reader-custom-view" className="w-full h-full bg-black relative"></div>

         {/* Loading Indicator */}
         {isLoading && (
             <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                 <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
                 <p className="text-slate-300 animate-pulse">Menyiapkan Kamera...</p>
             </div>
         )}

         {/* Error State */}
         {errorMsg && (
             <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
                 <i className="fa-solid fa-triangle-exclamation text-amber-500 text-4xl mb-4"></i>
                 <h3 className="text-xl font-bold mb-2">Kendala Kamera</h3>
                 <p className="text-slate-400 mb-6">{errorMsg}</p>
                 <button onClick={() => window.location.reload()} className="bg-blue-600 px-6 py-3 rounded-xl font-bold">
                    Refresh Halaman
                 </button>
             </div>
         )}

         {/* OVERLAY UI (Kotak Hijau & Laser) - Dikembalikan Konsistensinya */}
         {!isLoading && !errorMsg && (
             <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                
                {/* Kotak Area Scan - Ukuran Fixed */}
                <div style={{ width: SCAN_REGION_SIZE.width, height: SCAN_REGION_SIZE.height }} className="relative">
                    {/* Pojokan Hijau */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>

                    {/* Garis Laser Animasi */}
                    <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,1)] animate-[pulse_1.5s_ease-in-out_infinite]"></div>
                    
                    {/* Background Gelap di Luar Kotak */}
                    <div className="absolute -inset-[100vh] border-[100vh] border-black/60 -z-10"></div>
                </div>

                {/* Instruksi */}
                <div className="mt-8 bg-black/60 backdrop-blur-md px-5 py-2 rounded-full border border-white/10">
                    <p className="text-white text-xs font-bold tracking-wide">
                        <i className="fa-solid fa-arrows-left-right mr-2"></i>
                        Jarak Optimal: 15cm - 30cm
                    </p>
                </div>
             </div>
         )}
      </div>

      {/* Footer Controls */}
      <div className="bg-slate-900 p-5 border-t border-slate-800 z-20 shrink-0 space-y-4">
         
         {/* ZOOM SLIDER - Wajib Ada untuk Fokus */}
         {zoomCap && !errorMsg ? (
             <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                 <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase mb-2">
                     <span>Mundur</span>
                     <span className="text-blue-400">Zoom {zoom.toFixed(1)}x</span>
                     <span>Dekat</span>
                 </div>
                 <input 
                    type="range" 
                    min={zoomCap.min} max={zoomCap.max} step={zoomCap.step} 
                    value={zoom} 
                    onChange={(e) => applyZoom(parseFloat(e.target.value))} 
                    className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                 />
             </div>
         ) : !isLoading && !errorMsg && (
             <p className="text-center text-[10px] text-slate-500">
                 *Gunakan kamera belakang utama untuk hasil terbaik
             </p>
         )}

         {/* Camera Selector */}
         <div className="relative">
             <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <i className="fa-solid fa-camera"></i>
             </div>
             <select 
                className="w-full bg-slate-800 text-white border border-slate-600 rounded-xl py-3.5 pl-10 pr-4 text-sm font-bold outline-none focus:border-blue-500 transition-colors appearance-none"
                value={selectedCameraId}
                onChange={(e) => { setSelectedCameraId(e.target.value); startScanner(e.target.value); }}
             >
                {cameras.map((c, i) => (
                    <option key={c.id} value={c.id}>
                        {c.label || `Kamera ${i+1}`}
                    </option>
                ))}
             </select>
             <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                 <i className="fa-solid fa-chevron-down text-xs"></i>
             </div>
         </div>
      </div>
    </div>
  );
};