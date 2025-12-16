import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraLabel, setCameraLabel] = useState<string>('Memuat kamera...');
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";

  useEffect(() => {
    const initCamera = async () => {
      try {
        await Html5Qrcode.getCameras(); // Trigger Permission
        const devices = await Html5Qrcode.getCameras();
        
        if (devices && devices.length) {
          // LOGIKA FILTER KAMERA IPHONE (ANTI ULTRA WIDE)
          // Kita cari kamera belakang, TAPI buang yang ada tulisan 'Ultra' atau '0.5'
          const backCameras = devices.filter(d => {
              const label = d.label.toLowerCase();
              return (label.includes('back') || label.includes('rear') || label.includes('belakang')) 
                     && !label.includes('ultra') 
                     && !label.includes('0.5');
          });

          // Jika filter di atas kosong (misal nama kameranya aneh), ambil semua back camera
          const finalCandidates = backCameras.length > 0 ? backCameras : devices.filter(d => d.label.toLowerCase().includes('back'));
          
          // Fallback terakhir: ambil kamera apapun
          const validCameras = finalCandidates.length > 0 ? finalCandidates : devices;
          
          setCameras(devices); // Simpan semua untuk dropdown (opsional user ganti)
          
          // Pilih kandidat terbaik (biasanya yang terakhir di list adalah kamera utama High Res)
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

  const startScanner = async (cameraId: string) => {
    if (scannerRef.current) await stopScanner();
    
    // Reset Element
    const oldEl = document.getElementById(containerId);
    if(oldEl) oldEl.innerHTML = "";

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    const config = {
      fps: 30, // Max FPS
      qrbox: { width: 300, height: 150 }, // Persegi Panjang (Cocok untuk Barcode Baju)
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
           fps: 30,
           qrbox: { width: 300, height: 150 },
           // KHUSUS IOS: Resolusi Rendah = Lebih Cepat & Fokus
           videoConstraints: {
               width: 640, 
               height: 480,
               facingMode: "environment"
           }
        },
        (decodedText) => {
           if (navigator.vibrate) navigator.vibrate(200);
           onScanSuccess(decodedText);
           stopScanner();
        },
        () => {}
      );
    } catch (err) {
      console.error("Start failed", err);
      // Retry Mode Basic jika gagal
      try {
         await html5QrCode.start(cameraId, { fps: 20, qrbox: 250 }, (t)=>onScanSuccess(t), ()=>{});
      } catch(e) {}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-0 sm:p-4">
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
             
             {/* Overlay Laser Hijau (Lebih Kontras) */}
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div className="w-[300px] h-[150px] border-[3px] border-green-400/50 rounded-lg relative box-border shadow-[0_0_50px_rgba(0,0,0,0.8)_inset]">
                    {/* Garis Laser */}
                    <div className="absolute w-full h-[2px] bg-green-400 shadow-[0_0_10px_#4ade80] top-1/2 animate-pulse"></div>
                    
                    {/* Pojokan */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-green-500"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-green-500"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-green-500"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-green-500"></div>
                </div>
             </div>
             
             <div className="absolute bottom-10 w-full text-center z-20">
                 <p className="text-white text-xs font-bold bg-black/60 inline-block px-4 py-1 rounded-full">
                    Jarak Optimal: 15cm - 20cm
                 </p>
             </div>
        </div>

        {/* Controls */}
        <div className="p-5 bg-slate-800 shrink-0 z-20 border-t border-slate-700">
           <div className="flex justify-between items-center mb-2">
               <label className="text-slate-400 text-[10px] uppercase font-bold">Kamera Aktif</label>
               <span className="text-green-400 text-[10px] font-bold animate-pulse">● LIVE</span>
           </div>
           
           <div className="flex gap-2">
               <select 
                 className="flex-1 bg-white text-slate-900 font-bold p-3 rounded outline-none border-2 border-blue-500 text-xs"
                 value={selectedCameraId}
                 onChange={(e) => setSelectedCameraId(e.target.value)}
               >
                 {cameras.map((cam) => (
                   <option key={cam.id} value={cam.id}>
                     {cam.label.replace(/camera/gi, '').substring(0, 25)}...
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
           <p className="text-[10px] text-slate-500 mt-2 text-center">
             Menggunakan: {cameraLabel}
           </p>
        </div>
      </div>
    </div>
  );
};