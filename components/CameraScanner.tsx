import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // State Kamera
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraLabel, setCameraLabel] = useState<string>('Memuat kamera...');
  
  // State Zoom (Solusi Masalah Fokus)
  const [zoom, setZoom] = useState<number>(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";

  // 1. Init Kamera & Permission
  useEffect(() => {
    const initCamera = async () => {
      try {
        // Pancing Permission
        await Html5Qrcode.getCameras(); 
        const devices = await Html5Qrcode.getCameras();
        
        if (devices && devices.length) {
          // LOGIKA FILTER KAMERA (Sama seperti kode asli Anda karena sudah benar)
          const backCameras = devices.filter(d => {
              const label = d.label.toLowerCase();
              return (label.includes('back') || label.includes('rear') || label.includes('belakang')) 
                     && !label.includes('ultra') 
                     && !label.includes('0.5');
          });

          const finalCandidates = backCameras.length > 0 ? backCameras : devices.filter(d => d.label.toLowerCase().includes('back'));
          const validCameras = finalCandidates.length > 0 ? finalCandidates : devices;
          
          setCameras(devices); 
          
          // Ambil kamera terakhir (biasanya kamera utama resolusi tinggi)
          const bestCam = validCameras[validCameras.length - 1];
          
          setSelectedCameraId(bestCam.id);
          setCameraLabel(bestCam.label);
        }
      } catch (err) {
        alert("Gagal akses kamera. Pastikan izin browser diberikan.");
      }
    };

    initCamera();
    return () => { stopScanner(); };
  }, []);

  // 2. Start Scanner dengan Settingan Fokus Baru
  const startScanner = async (cameraId: string) => {
    if (scannerRef.current) await stopScanner();
    
    // Reset Zoom State saat ganti kamera
    setZoom(1);
    setZoomCap(null);

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    // CONFIG PERBAIKAN:
    // 1. FPS diturunkan ke 15 (Lebih terang di indoor, Autofokus lebih cepat bekerja)
    // 2. Resolusi dinaikkan ke 720p (Agar barcode kecil terbaca saat dijauhkan)
    const config = {
      fps: 15, 
      qrbox: { width: 280, height: 280 }, // Kotak scan
      aspectRatio: 1.0,
      disableFlip: false,
      formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.QR_CODE
      ]
    };

    try {
      await html5QrCode.start(
        cameraId,
        {
           ...config,
           videoConstraints: {
               // Perbaikan: Jangan hardcode 480p. Gunakan range agar browser cari yang tajam.
               width: { min: 640, ideal: 1280, max: 1920 },
               height: { min: 480, ideal: 720, max: 1080 },
               // Coba paksa mode fokus continuous
               advanced: [{ focusMode: "continuous" }]
           }
        },
        (decodedText) => {
           if (navigator.vibrate) navigator.vibrate(200);
           onScanSuccess(decodedText);
           stopScanner();
        },
        () => {}
      );

      // 3. SETELAH START SUKSES -> AKTIFKAN ZOOM CAPABILITY
      // Ini trik agar slider zoom muncul
      setTimeout(() => {
          const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
          if (video && video.srcObject) {
              const stream = video.srcObject as MediaStream;
              const track = stream.getVideoTracks()[0];
              const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};

              if (capabilities.zoom) {
                  setZoomCap({
                      min: capabilities.zoom.min || 1,
                      max: Math.min(capabilities.zoom.max || 5, 4), // Batasi max zoom 4x
                      step: capabilities.zoom.step || 0.1
                  });
                  // Auto Zoom sedikit (1.2x) untuk memancing fokus
                  applyZoom(1.2, track);
              }
          }
      }, 500);

    } catch (err) {
      console.error("Start failed", err);
      // Fallback mode ringan jika gagal
      try {
         await html5QrCode.start(cameraId, { fps: 15, qrbox: 250 }, (t)=>onScanSuccess(t), ()=>{});
      } catch(e) {}
    }
  };

  const applyZoom = (value: number, trackParam?: MediaStreamTrack) => {
    // Logic untuk apply zoom ke hardware kamera
    const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    if (!video || !video.srcObject) return;
    
    const track = trackParam || (video.srcObject as MediaStream).getVideoTracks()[0];
    
    try {
        // @ts-ignore
        track.applyConstraints({ advanced: [{ zoom: value }] });
        setZoom(value);
    } catch (e) {
        console.log("Zoom not supported", e);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch (e) {}
    }
  };

  useEffect(() => {
    if (selectedCameraId) startScanner(selectedCameraId);
  }, [selectedCameraId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className="bg-slate-900 w-full max-w-md h-full flex flex-col relative">
        
        {/* Header */}
        <div className="p-4 bg-slate-800 flex justify-between items-center shrink-0 z-20 shadow-md border-b border-slate-700">
          <h3 className="text-white font-bold flex items-center gap-2">
             <i className="fa-solid fa-qrcode text-blue-400"></i> Scanner
          </h3>
          <button onClick={onClose} className="bg-slate-700 text-white w-9 h-9 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Viewport */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
             <div id="reader-custom-view" className="w-full h-full object-cover"></div>
             
             {/* Overlay Laser */}
             <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                <div className="w-[280px] h-[280px] border-2 border-green-500/80 rounded-lg relative shadow-[0_0_1000px_rgba(0,0,0,0.5)_inset]">
                    <div className="absolute w-full h-[2px] bg-red-500 top-1/2 animate-pulse shadow-[0_0_8px_red]"></div>
                </div>
                {/* Instruksi */}
                <div className="mt-8 bg-black/60 px-4 py-2 rounded-full backdrop-blur-sm">
                    <p className="text-white text-xs font-bold">
                       Jarak 15-20cm & Gunakan Zoom
                    </p>
                </div>
             </div>
        </div>

        {/* Controls */}
        <div className="p-5 bg-slate-800 shrink-0 z-20 border-t border-slate-700 space-y-4">
           
           {/* FITUR BARU: ZOOM SLIDER */}
           {zoomCap && (
               <div className="bg-slate-700/50 p-3 rounded-lg">
                   <div className="flex justify-between text-[10px] text-slate-300 font-bold uppercase mb-2">
                       <span>Mundur</span>
                       <span>Zoom: {zoom.toFixed(1)}x</span>
                       <span>Dekat</span>
                   </div>
                   <input 
                       type="range" 
                       min={zoomCap.min} 
                       max={zoomCap.max} 
                       step={zoomCap.step} 
                       value={zoom}
                       onChange={(e) => applyZoom(parseFloat(e.target.value))}
                       className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                   />
               </div>
           )}

           <div className="flex gap-2">
               <select 
                 className="flex-1 bg-white text-slate-900 font-bold p-3 rounded outline-none border-2 border-blue-500 text-xs"
                 value={selectedCameraId}
                 onChange={(e) => setSelectedCameraId(e.target.value)}
               >
                 {cameras.map((cam) => (
                   <option key={cam.id} value={cam.id}>
                     {cam.label || `Kamera ${cam.id.substring(0,5)}...`}
                   </option>
                 ))}
               </select>
               <button 
                onClick={() => { stopScanner().then(() => startScanner(selectedCameraId)); }}
                className="bg-blue-600 text-white px-4 rounded font-bold"
               >
                <i className="fa-solid fa-rotate"></i>
               </button>
           </div>
           
           {!zoomCap && (
               <p className="text-[10px] text-slate-500 text-center">
                  *Mundur sedikit jika gambar buram
               </p>
           )}
        </div>
      </div>
    </div>
  );
};