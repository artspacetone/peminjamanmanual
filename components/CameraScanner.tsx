import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // Status State
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // Features State
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    // Auto start saat dibuka
    startCameraSequence();

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []);

  const cleanup = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  };

  // --- STRATEGI START KAMERA BERTAHAP (Anti-Bug) ---
  const startCameraSequence = async () => {
    setLoading(true);
    setErrorMsg('');
    await cleanup();

    if (!mountedRef.current) return;

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    const qrConfig = {
      fps: 15, // 15 FPS lebih ringan & stabil
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      disableFlip: false,
      formatsToSupport: [ 
        Html5QrcodeSupportedFormats.CODE_128, 
        Html5QrcodeSupportedFormats.EAN_13 
      ]
    };

    // Callback Sukses
    const onSuccess = (decodedText: string) => {
      if (navigator.vibrate) navigator.vibrate(200);
      onScanSuccess(decodedText);
      onClose();
    };

    try {
      // PERCOBAAN 1: Mode Ideal (Kamera Belakang + Resolusi Bagus)
      // Kita pakai facingMode: "environment" agar browser yang memilihkan ID kamera terbaik
      console.log("Attempt 1: High Res Environment");
      await html5QrCode.start(
        { facingMode: "environment" }, 
        { ...qrConfig, videoConstraints: { facingMode: "environment", width: { ideal: 1280 } } }, 
        onSuccess, 
        () => {}
      );
    } catch (err1) {
      console.warn("Attempt 1 failed, trying fallback...", err1);
      
      try {
        // PERCOBAAN 2: Mode Aman (Kamera Belakang, Tanpa Constraint Resolusi)
        // Ini mengatasi error "Could not start video source" karena resolusi tidak didukung
        await html5QrCode.start(
            { facingMode: "environment" },
            { ...qrConfig, videoConstraints: { facingMode: "environment" } }, // Hapus width/height
            onSuccess,
            () => {}
        );
      } catch (err2) {
          console.warn("Attempt 2 failed, trying desperate mode...", err2);
          
          try {
            // PERCOBAAN 3: Mode Darurat (Kamera Apa Saja)
            // Jika kamera belakang rusak/tidak terdeteksi, pakai kamera apapun (depan/webcam)
            await html5QrCode.start(
                {}, // Any camera
                qrConfig, 
                onSuccess, 
                () => {}
            );
          } catch (err3: any) {
              console.error("All attempts failed", err3);
              if (mountedRef.current) {
                  // Terjemahkan error agar user paham
                  if (err3.name === 'NotAllowedError') {
                      setErrorMsg("Izin kamera ditolak. Reset izin browser Anda.");
                  } else if (err3.name === 'NotFoundError') {
                      setErrorMsg("Perangkat kamera tidak ditemukan.");
                  } else if (err3.name === 'NotReadableError') {
                      setErrorMsg("Kamera sedang dipakai aplikasi lain atau error hardware.");
                  } else {
                      setErrorMsg("Gagal membuka kamera: " + (err3.message || "Unknown Error"));
                  }
              }
          }
      }
    }

    if (mountedRef.current) {
        setLoading(false);
        // Jika scanner berhasil jalan (isScanning true), aktifkan fitur hardware
        if (scannerRef.current.isScanning) {
            setIsScanning(true);
            setTimeout(enableZoomFeature, 500);
        }
    }
  };

  // --- FITUR ZOOM (Dipisah agar tidak mengganggu Start) ---
  const enableZoomFeature = () => {
      try {
        const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
        if (!video || !video.srcObject) return;

        // CSS Fix
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
            // Auto zoom dikit
            track.applyConstraints({ advanced: [{ zoom: 1.2 }] }).catch(()=>{});
        }
      } catch (e) {
          console.log("Zoom not supported on this device");
      }
  };

  const applyZoom = (val: number) => {
      setZoom(val);
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ zoom: val }] }).catch(()=>{});
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center shadow-md shrink-0">
          <h3 className="font-bold flex items-center gap-2 text-lg">
             <i className="fa-solid fa-qrcode text-blue-500"></i> Scanner
          </h3>
          <button onClick={onClose} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700">
             <i className="fa-solid fa-xmark"></i>
          </button>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          
          <div id="reader-custom-view" className="w-full h-full bg-black"></div>

          {/* Loading State */}
          {loading && !errorMsg && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
                  <p className="text-sm text-slate-400">Menghubungkan Kamera...</p>
              </div>
          )}

          {/* Error State */}
          {errorMsg && (
              <div className="absolute inset-0 z-30 bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                      <i className="fa-solid fa-video-slash text-red-500 text-2xl"></i>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Kamera Gagal</h3>
                  <p className="text-slate-400 mb-6 text-sm">{errorMsg}</p>
                  
                  <button 
                      onClick={() => startCameraSequence()} 
                      className="bg-blue-600 active:bg-blue-700 px-6 py-3 rounded-xl font-bold flex items-center gap-2"
                  >
                      <i className="fa-solid fa-rotate-right"></i> Coba Lagi
                  </button>
              </div>
          )}

          {/* Overlay (Hanya muncul jika sukses) */}
          {isScanning && !loading && !errorMsg && (
             <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                <div className="w-64 h-64 border-2 border-green-500 rounded-lg relative shadow-[0_0_100vmax_rgba(0,0,0,0.6)]">
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 animate-pulse shadow-[0_0_8px_red]"></div>
                </div>
                <div className="mt-8 bg-black/60 px-4 py-1 rounded-full backdrop-blur-sm">
                    <p className="text-white text-xs font-medium">Jauhkan HP (20cm) agar fokus</p>
                </div>
             </div>
          )}
      </div>

      {/* Footer Controls (Zoom) */}
      {isScanning && !errorMsg && (
          <div className="bg-slate-900 p-5 border-t border-slate-800 shrink-0">
             {zoomCap ? (
                 <div className="px-1">
                     <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase mb-2">
                         <span>1x</span>
                         <span>Zoom {zoom.toFixed(1)}x</span>
                         <span>Max</span>
                     </div>
                     <input 
                        type="range" 
                        min={zoomCap.min} max={zoomCap.max} step={zoomCap.step} 
                        value={zoom} 
                        onChange={(e) => applyZoom(parseFloat(e.target.value))} 
                        className="w-full h-4 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                     />
                 </div>
             ) : (
                 <p className="text-center text-xs text-slate-500">Kamera aktif</p>
             )}
          </div>
      )}
    </div>
  );
};