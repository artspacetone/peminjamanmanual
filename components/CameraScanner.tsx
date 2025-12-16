import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom";

  // 1. Inisialisasi & Ambil Daftar Kamera
  useEffect(() => {
    const initCamera = async () => {
      try {
        // Minta izin dulu
        await Html5Qrcode.getCameras();
        
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length) {
          setCameras(devices);
          
          // LOGIKA PINTAR MEMILIH KAMERA UTAMA:
          // Cari kamera belakang. Di Android multi-kamera, biasanya kamera utama 
          // ada di urutan terakhir dari list 'back' cameras, atau yang labelnya '0' / 'back'.
          
          // Filter kamera belakang
          const backCameras = devices.filter(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
          
          let cameraIdToUse = devices[0].id; // Default

          if (backCameras.length > 0) {
             // Coba ambil yang terakhir (seringkali ini kamera utama high-res di samsung/xiaomi)
             // Atau ambil yang pertama jika cuma satu.
             // Kita prioritas ambil yang labelnya TIDAK mengandung 'wide' atau 'macro' jika memungkinkan
             const mainCam = backCameras.find(c => !c.label.includes('wide') && !c.label.includes('macro'));
             cameraIdToUse = mainCam ? mainCam.id : backCameras[0].id;
          }

          setSelectedCameraId(cameraIdToUse);
        }
      } catch (err) {
        console.error("Camera permission error", err);
        alert("Gagal mengakses kamera. Pastikan izin diberikan.");
      }
    };

    initCamera();

    return () => {
      stopScanner();
    };
  }, []);

  // 2. Fungsi Mulai Scan
  const startScanner = async (cameraId: string) => {
    if (scannerRef.current) {
      await stopScanner();
    }

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    const config = {
      fps: 30, // High FPS biar responsif
      qrbox: { width: 300, height: 200 }, // Area scan luas persegi panjang
      aspectRatio: 1.0,
      formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.UPC_A
      ]
    };

    try {
      await html5QrCode.start(
        cameraId,
        config,
        (decodedText) => {
           // Success Callback
           // Vibrate
           if (navigator.vibrate) navigator.vibrate(200);
           stopScanner(); // Stop dulu biar ga double scan
           onScanSuccess(decodedText);
        },
        () => {
           // Ignore failures (scanning...)
        }
      );
      setIsScanning(true);
    } catch (err) {
      console.error("Start failed", err);
    }
  };

  // 3. Fungsi Stop Scan
  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        setIsScanning(false);
      } catch (err) {
        console.error("Stop failed", err);
      }
    }
  };

  // Trigger start saat camera ID berubah atau pertama kali load
  useEffect(() => {
    if (selectedCameraId) {
      startScanner(selectedCameraId);
    }
  }, [selectedCameraId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-0 sm:p-4">
      <div className="bg-slate-900 w-full max-w-md h-full sm:h-auto sm:rounded-2xl flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center z-10">
          <h3 className="text-white font-bold text-lg"><i className="fa-solid fa-camera mr-2"></i> Scanner</h3>
          <button onClick={onClose} className="bg-slate-700 text-white w-10 h-10 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Viewport Kamera */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
             {/* Div Kosong ini akan diisi video oleh library */}
             <div id="reader-custom" className="w-full h-full"></div>
             
             {/* Overlay Garis Merah Laser */}
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[80%] h-[250px] border-2 border-white/50 rounded-lg relative">
                    <div className="absolute top-1/2 left-0 w-full h-[2px] bg-red-500 shadow-[0_0_10px_red] animate-pulse"></div>
                    <p className="absolute -bottom-8 w-full text-center text-white text-xs font-bold drop-shadow-md">
                        Tempatkan Barcode di dalam kotak
                    </p>
                </div>
             </div>
        </div>

        {/* Control Panel (Pilih Kamera) */}
        <div className="p-5 bg-slate-800 border-t border-slate-700 z-10">
           <label className="text-slate-400 text-xs uppercase font-bold mb-2 block">Pilih Kamera (Jika Buram/Salah)</label>
           
           <div className="flex gap-2">
               <select 
                 className="flex-1 bg-white text-slate-900 font-bold p-3 rounded-lg outline-none border-2 border-blue-500"
                 value={selectedCameraId}
                 onChange={(e) => setSelectedCameraId(e.target.value)}
               >
                 {cameras.map((cam) => (
                   <option key={cam.id} value={cam.id}>
                     {cam.label || `Camera ${cam.id.substr(0, 5)}...`}
                   </option>
                 ))}
               </select>

               {/* Tombol Restart Manual jika macet */}
               <button 
                onClick={() => { stopScanner().then(() => startScanner(selectedCameraId)); }}
                className="bg-slate-700 text-white px-4 rounded-lg"
               >
                <i className="fa-solid fa-rotate"></i>
               </button>
           </div>
           
           <div className="mt-2 text-xs text-slate-500 text-center">
              Jika barcode tidak terbaca, coba ganti kamera lain di daftar.
           </div>
        </div>

      </div>
    </div>
  );
};