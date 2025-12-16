import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  const [errorMsg, setErrorMsg] = useState<string>('');
  const lastScanRef = useRef<number>(0);

  useEffect(() => {
    // ID Element
    const scannerId = "reader";
    
    // Konfigurasi Khusus untuk Barcode Batang (1D) & Kecepatan
    const config = {
        fps: 30, // Maksimal frame per second agar lancar di iOS/Android
        // QR Box dibuat MELEBAR (Persegi Panjang) khusus untuk Barcode Batang
        // Ini membuat algoritma fokus ke garis horizontal, jauh lebih cepat!
        qrbox: { width: 300, height: 100 }, 
        aspectRatio: 1.0,
        formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128, // Paling umum untuk baju/ritel
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.QR_CODE
        ],
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        // Paksa kamera belakang dengan resolusi HD (720p) yang ringan tapi tajam
        videoConstraints: {
            facingMode: "environment",
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 },
            focusMode: "continuous" // Penting untuk Android
        },
        // Fitur eksperimental untuk mengingat kamera terakhir yang dipilih
        rememberLastUsedCamera: true 
    };

    const scanner = new Html5QrcodeScanner(scannerId, config, false);

    const onScanSuccessCallback = (decodedText: string) => {
        const now = Date.now();
        // Debounce 1.5 detik agar tidak double scan
        if (now - lastScanRef.current > 1500) {
            lastScanRef.current = now;
            // Getar HP (Haptic Feedback)
            try { window.navigator.vibrate(200); } catch(e) {} 
            onScanSuccess(decodedText);
        }
    };

    // Error callback kosong agar console bersih saat mencari fokus
    const onScanFailureCallback = () => {};

    try {
        scanner.render(onScanSuccessCallback, onScanFailureCallback);
    } catch (err) {
        console.error("Camera Error:", err);
        setErrorMsg("Gagal akses kamera. Pastikan izin browser diberikan.");
    }

    return () => {
        try { scanner.clear(); } catch(e) {}
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-0 sm:p-4">
      
      {/* CSS INJECTION: Styling Paksa untuk Library Scanner */}
      <style>{`
        /* 1. PERBAIKI DROPDOWN PILIH KAMERA */
        #html5-qrcode-select-camera {
            background-color: white !important;
            color: #1f2937 !important; /* Text Hitam Gelap */
            border: 2px solid #3b82f6 !important;
            border-radius: 8px !important;
            padding: 10px !important;
            font-size: 14px !important;
            width: 100% !important;
            margin-bottom: 10px !important;
            font-weight: 600 !important;
            display: block !important;
        }

        /* Label "Select Camera" yang tadinya samar, sekarang PUTIH TERANG */
        #reader span, #reader label {
            color: #ffffff !important;
            font-size: 14px !important;
            font-weight: bold !important;
            text-shadow: 0px 1px 2px rgba(0,0,0,0.8);
            margin-bottom: 5px !important;
            display: block !important;
        }

        /* 2. TOMBOL PERMISSION KAMERA (BIRU BESAR) */
        #html5-qrcode-button-camera-permission {
            background-color: #2563eb !important;
            color: white !important;
            padding: 12px 20px !important;
            border-radius: 8px !important;
            font-weight: bold !important;
            border: none !important;
            margin-top: 20px !important;
        }

        /* 3. TOMBOL STOP (MERAH) & START (HIJAU) */
        #html5-qrcode-button-camera-stop {
            background-color: #ef4444 !important;
            color: white !important;
            padding: 8px 20px !important;
            border-radius: 6px !important;
            border: none !important;
            margin-top: 15px !important;
            font-weight: 600 !important;
            width: 100%;
        }
        #html5-qrcode-button-camera-start {
            background-color: #22c55e !important;
            color: white !important;
            padding: 8px 20px !important;
            border-radius: 6px !important;
            border: none !important;
            margin-top: 10px !important;
            font-weight: 600 !important;
        }

        /* 4. ANIMASI SCANNER ALA GOOGLE LENS */
        #reader {
            border: none !important;
            position: relative;
        }
        /* Membuat garis laser bergerak */
        #reader__scan_region::after {
            content: '';
            position: absolute;
            top: 0;
            left: 10%;
            width: 80%;
            height: 3px;
            background: #00e5ff; /* Cyan Laser */
            box-shadow: 0 0 15px #00e5ff;
            border-radius: 50%;
            animation: scanLaser 2s infinite linear alternate;
            z-index: 99;
            opacity: 0.8;
        }
        /* Efek pojokan kotak scan */
        #reader__scan_region {
            box-shadow: 0 0 0 1000px rgba(0,0,0,0.5) !important; /* Gelapkan area luar */
            background: transparent !important;
        }

        @keyframes scanLaser {
            0% { top: 10%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 90%; opacity: 0; }
        }

        /* Hide elemen pengganggu */
        #html5-qrcode-anchor-scan-type-change { display: none !important; }
        img[alt="Info icon"] { display: none !important; }
      `}</style>

      <div className="bg-slate-900 rounded-xl w-full max-w-md overflow-hidden shadow-2xl relative flex flex-col h-[90vh] sm:h-auto border border-slate-700">
        
        {/* Header */}
        <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0 border-b border-slate-700">
            <h3 className="font-bold text-lg flex items-center text-blue-400">
                <i className="fa-solid fa-expand mr-2"></i> Scanner Pro
            </h3>
            <button 
                onClick={onClose} 
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 transition-colors text-slate-300"
            >
                <i className="fa-solid fa-xmark text-xl"></i>
            </button>
        </div>
        
        {/* Area Scanner */}
        <div className="flex-1 bg-black relative flex flex-col justify-center overflow-hidden">
            {errorMsg ? (
                <div className="text-red-400 text-center p-8">
                    <i className="fa-solid fa-video-slash text-4xl mb-4"></i>
                    <p>{errorMsg}</p>
                </div>
            ) : (
                <div id="reader" className="w-full h-full"></div>
            )}
            
            {/* Overlay Animasi Tambahan (Jika library loading) */}
            {!errorMsg && (
                <div className="absolute top-4 right-4 pointer-events-none z-10">
                   <span className="flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                </div>
            )}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-800 text-center shrink-0 border-t border-slate-700">
            <div className="inline-flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-full text-xs text-slate-300">
                <i className="fa-solid fa-barcode"></i>
                <span>Arahkan garis merah ke Barcode Batang</span>
            </div>
            
            <div className="mt-3 text-[10px] text-slate-500">
                iOS/iPhone: Kamera otomatis terpilih.<br/>
                Android: Pilih kamera belakang jika perlu.
            </div>
        </div>
      </div>
    </div>
  );
};