import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // Status
  const [isScanning, setIsScanning] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Zoom
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const mountedRef = useRef(true);

  // --- 1. INITIALIZATION ---
  useEffect(() => {
    mountedRef.current = true;
    
    // Coba start otomatis saat dibuka
    initAndStart(true);

    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, []);

  const initAndStart = async (autoStart: boolean) => {
    setIsLoading(true);
    setPermissionError(false);

    try {
        // Pancing Izin Browser
        await Html5Qrcode.getCameras();
        const devices = await Html5Qrcode.getCameras();

        if (devices && devices.length > 0) {
            setCameras(devices);
            
            // Cari kamera belakang
            const backCam = devices.find(d => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('belakang') || 
                d.label.toLowerCase().includes('environment')
            );
            
            // Set ID default (Belakang atau Terakhir)
            const targetId = backCam ? backCam.id : devices[devices.length - 1].id;
            setSelectedCameraId(targetId);

            if (autoStart) {
                // Gunakan mode AMAN untuk start awal (facingMode)
                startScannerWithConfig(null); 
            }
        } else {
            setPermissionError(true);
            setIsLoading(false);
        }
    } catch (e) {
        console.error("Init Error", e);
        setPermissionError(true);
        setIsLoading(false);
    }
  };

  // --- 2. CORE SCANNER LOGIC ---
  const startScannerWithConfig = async (specificCameraId: string | null) => {
      // Cleanup dulu
      if (scannerRef.current) {
          try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
      }

      setIsLoading(true);
      setPermissionError(false);
      
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;

      // CONFIG AMAN & STABIL
      // width/height: ideal 720p (Cukup tajam, tidak berat)
      const constraints = specificCameraId 
          ? { deviceId: { exact: specificCameraId } } // Jika user pilih manual dari dropdown
          : { facingMode: "environment" };            // Auto-detect kamera belakang (Paling Stabil)

      const videoConstraints = {
          ...constraints,
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          advanced: [{ focusMode: "continuous" }]
      };

      try {
          await html5QrCode.start(
              constraints, 
              {
                  fps: 15,
                  qrbox: { width: 250, height: 250 }, // Ukuran Box Scan
                  aspectRatio: 1.0,
                  disableFlip: false,
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
              () => {} 
          );

          if (mountedRef.current) {
              setIsLoading(false);
              setIsScanning(true);
              // Setup Zoom belakangan agar kamera nyala dulu
              setTimeout(enableZoom, 500);
          }

      } catch (err) {
          console.error("Start Failed", err);
          if (mountedRef.current) {
              setIsLoading(false);
              setPermissionError(true); // Tampilkan tombol manual jika gagal
          }
      }
  };

  const stopScanner = async () => {
      if (scannerRef.current?.isScanning) {
          try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
      }
  };

  // --- 3. ZOOM LOGIC (Dipisah agar aman) ---
  const enableZoom = () => {
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      if (!video || !video.srcObject) return;

      // Fix CSS Video
      video.style.objectFit = "cover";

      const stream = video.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities ? track.getCapabilities() : {};

      if (caps.zoom) {
          setZoomCap({
              min: caps.zoom.min || 1,
              max: Math.min(caps.zoom.max || 5, 5),
              step: caps.zoom.step || 0.1
          });
          // Auto Zoom dikit (1.2x)
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
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white">
      
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center shadow-md z-20 shrink-0 border-b border-slate-800">
         <h3 className="font-bold text-lg flex items-center gap-2">
            <i className="fa-solid fa-qrcode text-blue-500"></i> Scanner
         </h3>
         <button onClick={onClose} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700">
            <i className="fa-solid fa-xmark"></i>
         </button>
      </div>

      {/* Main Scanner View */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
         
         <div id="reader-custom-view" className="w-full h-full bg-black relative"></div>

         {/* Loading State */}
         {isLoading && (
             <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90">
                 <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
                 <p className="text-slate-300">Membuka Kamera...</p>
             </div>
         )}

         {/* Error / Manual Start State */}
         {permissionError && !isLoading && (
             <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
                 <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
                    <i className="fa-solid fa-camera-rotate text-3xl text-blue-400"></i>
                 </div>
                 <h3 className="text-xl font-bold mb-2">Kamera Siap</h3>
                 <p className="text-slate-400 mb-8 max-w-xs text-sm">
                    Klik tombol di bawah untuk menyalakan kamera secara manual.
                 </p>
                 <button 
                    onClick={() => startScannerWithConfig(selectedCameraId || null)} 
                    className="bg-blue-600 active:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center gap-3"
                 >
                    <i className="fa-solid fa-power-off"></i> Nyalakan
                 </button>
             </div>
         )}

         {/* OVERLAY UI (Fixed Size & Animation) */}
         {isScanning && !isLoading && !permissionError && (
             <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                
                {/* Kotak Scan KUNCI UKURAN (280px) */}
                <div className="w-[280px] h-[280px] relative">
                    {/* Border Hijau */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>

                    {/* Laser Merah (CSS Animation) */}
                    <div className="absolute w-full h-0.5 bg-red-500 top-1/2 shadow-[0_0_10px_red] animate-pulse"></div>

                    {/* Dark Area Outside */}
                    <div className="absolute -inset-[100vh] border-[100vh] border-black/50 -z-10"></div>
                </div>

                <div className="mt-8 bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                    <p className="text-white text-xs font-bold tracking-wide">
                        Jarak Optimal: 20cm + Zoom
                    </p>
                </div>
             </div>
         )}
      </div>

      {/* Footer Controls */}
      {isScanning && !permissionError && (
          <div className="bg-slate-900 p-5 border-t border-slate-800 z-20 shrink-0 space-y-4">
             
             {/* Zoom Slider */}
             {zoomCap ? (
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
                        className="w-full h-3 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                     />
                 </div>
             ) : (
                <p className="text-center text-[10px] text-slate-500">*Gunakan Kamera Utama untuk Zoom</p>
             )}

             {/* Camera Dropdown */}
             <div className="relative">
                 <select 
                    className="w-full bg-slate-800 text-white border border-slate-600 rounded-xl py-3 px-4 text-sm font-bold outline-none focus:border-blue-500 appearance-none"
                    value={selectedCameraId}
                    onChange={(e) => { 
                        setSelectedCameraId(e.target.value); 
                        startScannerWithConfig(e.target.value); 
                    }}
                 >
                    {cameras.map((c, i) => (
                        <option key={c.id} value={c.id}>
                            {c.label || `Kamera ${i+1}`}
                        </option>
                    ))}
                 </select>
                 <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                     <i className="fa-solid fa-chevron-down text-xs"></i>
                 </div>
             </div>
          </div>
      )}
    </div>
  );
};