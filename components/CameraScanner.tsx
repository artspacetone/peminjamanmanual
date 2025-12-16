import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Ref untuk memastikan scan tidak double hit dalam waktu singkat
  const lastScanRef = useRef<number>(0);

  useEffect(() => {
    const scannerId = "reader";
    
    // Config untuk performa tinggi (Android & iOS)
    const config = {
        fps: 25, // Naikkan ke 25-30 agar responsif seperti aplikasi native
        qrbox: { width: 300, height: 150 }, // Kotak persegi panjang (lebih cocok untuk barcode panjang)
        aspectRatio: 1.0,
        // Fokuskan hanya pada format yang sering dipakai untuk memperingan CPU
        formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.CODE_39
        ],
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        // Konfigurasi Video (Kunci Performa iOS/Android)
        videoConstraints: {
            facingMode: "environment", // Kamera Belakang
            focusMode: "continuous",   // Autofocus terus menerus
            width: { min: 640, ideal: 1280, max: 1920 }, // Resolusi Ideal (HD), jangan 4K biar ga berat
            height: { min: 480, ideal: 720, max: 1080 },
        }
    };

    const scanner = new Html5QrcodeScanner(scannerId, config, false);

    const onScanSuccessCallback = (decodedText: string) => {
        const now = Date.now();
        // Debounce: Cegah scan beruntun dalam 1.5 detik
        if (now - lastScanRef.current > 1500) {
            lastScanRef.current = now;
            // Mainkan suara beep kecil agar user sadar sudah scan (opsional, tergantung browser support)
            try { window.navigator.vibrate(200); } catch(e) {} 
            onScanSuccess(decodedText);
        }
    };

    const onScanFailureCallback = (errorMessage: string) => {
        // Biarkan kosong agar console tidak penuh spam error saat mencari barcode
    };

    // Render Scanner
    try {
        scanner.render(onScanSuccessCallback, onScanFailureCallback);
    } catch (err) {
        console.error("Camera Start Error:", err);
        setErrorMsg("Gagal membuka kamera. Pastikan izin diberikan.");
    }

    // Cleanup saat tutup modal
    return () => {
        try {
            scanner.clear().catch(err => console.error("Failed to clear scanner", err));
        } catch(e) {}
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      
      {/* CSS INJECTION: Memaksa tampilan Tombol Library agar Jelas */}
      <style>{`
        /* Tombol Izin Kamera */
        #html5-qrcode-button-camera-permission {
            padding: 12px 24px !important;
            background-color: #2563eb !important; /* Biru Terang */
            color: white !important;
            border-radius: 8px !important;
            font-weight: bold !important;
            font-size: 16px !important;
            border: none !important;
            margin-top: 20px !important;
            cursor: pointer !important;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
        }
        /* Tombol Stop Scanning */
        #html5-qrcode-button-camera-stop {
            padding: 8px 16px !important;
            background-color: #dc2626 !important; /* Merah */
            color: white !important;
            border-radius: 6px !important;
            border: none !important;
            margin-top: 10px !important;
        }
        /* Tombol Start Scanning (jika muncul) */
        #html5-qrcode-button-camera-start {
            padding: 8px 16px !important;
            background-color: #16a34a !important; /* Hijau */
            color: white !important;
            border-radius: 6px !important;
            border: none !important;
        }
        /* Menyembunyikan link 'Scan an Image File' yg mengganggu */
        #html5-qrcode-anchor-scan-type-change {
            display: none !important; 
        }
        /* Kotak Scanner */
        #reader {
            border: none !important;
        }
        #reader__scan_region {
            background: rgba(0,0,0,0.3) !important;
        }
      `}</style>

      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
            <h3 className="font-bold text-lg flex items-center">
                <i className="fa-solid fa-camera mr-2"></i> Scan Barcode
            </h3>
            <button 
                onClick={onClose} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
                <i className="fa-solid fa-xmark text-xl"></i>
            </button>
        </div>
        
        {/* Area Kamera */}
        <div className="p-0 bg-black flex-1 relative overflow-hidden flex items-center justify-center min-h-[300px]">
            {errorMsg ? (
                <div className="text-red-400 text-center p-8">
                    <i className="fa-solid fa-triangle-exclamation text-4xl mb-4"></i>
                    <p>{errorMsg}</p>
                </div>
            ) : (
                <div id="reader" className="w-full h-full"></div>
            )}
        </div>

        {/* Footer Hint */}
        <div className="p-4 bg-slate-50 text-center text-sm text-slate-600 shrink-0">
            <p className="font-semibold mb-1">Tips Cepat:</p>
            <p className="text-xs text-slate-500">
                Posisikan Barcode di dalam kotak. <br/>
                Pastikan cahaya cukup terang.
            </p>
        </div>
      </div>
    </div>
  );
};