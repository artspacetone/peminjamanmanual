import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // State
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Controls
  const [zoom, setZoom] = useState<number>(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);
  const [boxSize, setBoxSize] = useState({ width: 250, height: 250 });

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const isMounted = useRef(true);

  // 1. Cek HTTPS & Responsive Box
  useEffect(() => {
    isMounted.current = true;

    // Cek Secure Context (Wajib HTTPS kecuali localhost)
    if (window.location.hostname !== 'localhost' && window.location.protocol !== 'https:') {
        setErrorMsg("Kamera wajib menggunakan HTTPS atau localhost.");
    }

    const handleResize = () => {
        const size = Math.min(window.innerWidth * 0.8, 300);
        setBoxSize({ width: size, height: Math.floor(size * 0.6) }); // Kotak landscape
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Auto start permission request
    requestCameraPermission();

    return () => { 
        isMounted.current = false;
        window.removeEventListener('resize', handleResize);
        cleanupScanner();
    };
  }, []);

  // 2. Cleanup Function yang Kuat
  const cleanupScanner = async () => {
    if (scannerRef.current) {
        try {
            if (scannerRef.current.isScanning) {
                await scannerRef.current.stop();
            }
            scannerRef.current.clear();
        } catch (e) {
            console.warn("Cleanup warning:", e);
        }
        scannerRef.current = null;
    }
  };

  // 3. Request Permission & Get Cameras
  const requestCameraPermission = async () => {
    setErrorMsg('');
    try {
        // Pancing izin dengan getCameras
        const devices = await Html5Qrcode.getCameras();
        
        if (!isMounted.current) return;

        if (devices && devices.length) {
            setCameras(devices);
            setPermissionGranted(true);

            // Pilih kamera belakang (environment)
            const backCams = devices.filter(d => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('belakang') ||
                d.label.toLowerCase().includes('environment')
            );
            
            // Ambil kamera belakang terakhir (biasanya kamera utama)
            const bestCam = backCams.length > 0 ? backCams[backCams.length - 1] : devices[0];
            setSelectedCameraId(bestCam.id);
        } else {
            setErrorMsg("Kamera tidak ditemukan di perangkat ini.");
        }
    } catch (err: any) {
        console.error(err);
        if(err.name === 'NotAllowedError') {
            setErrorMsg("Akses kamera ditolak. Mohon izinkan akses di pengaturan browser.");
        } else {
            setErrorMsg("Gagal mengakses kamera. Pastikan tidak sedang dipakai aplikasi lain.");
        }
    }
  };

  // 4. Start Scanner Logic
  const startScanner = async (cameraId: string) => {
    await cleanupScanner(); // Stop yang lama dulu
    
    if (!isMounted.current) return;

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    const constraints = {
        deviceId: { exact: cameraId },
        width: { min: 640, ideal: 1280, max: 1920 }, // 720p Ideal
        height: { min: 480, ideal: 720, max: 1080 },
        advanced: [{ focusMode: "continuous" }]
    };

    try {
        await html5QrCode.start(
            constraints,
            {
                fps: 15,
                qrbox: boxSize,
                aspectRatio: 1.0,
                disableFlip: false,
                formatsToSupport: [ 
                  Html5QrcodeSupportedFormats.CODE_128, 
                  Html5QrcodeSupportedFormats.EAN_13,
                  Html5QrcodeSupportedFormats.QR_CODE 
                ]
            },
            (decodedText) => {
                if(navigator.vibrate) navigator.vibrate(200);
                onScanSuccess(decodedText);
                onClose(); // Tutup modal setelah scan
            },
            () => {} // Ignore errors per frame
        );

        // Setup Capabilities (Zoom/Torch)
        setupCapabilities();

    } catch (err) {
        console.error("Start fail:", err);
        // Retry logic for older devices
        try {
            await html5QrCode.start(cameraId, { fps: 10, qrbox: 200 }, (t)=>onScanSuccess(t), ()=>{});
        } catch(e) {
            setErrorMsg("Kamera gagal dimulai. Silakan refresh.");
        }
    }
  };

  const setupCapabilities = () => {
     const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
     if (video && video.srcObject) {
         video.style.objectFit = "cover"; // Fix tampilan gepeng
         const stream = video.srcObject as MediaStream;
         const track = stream.getVideoTracks()[0];
         const caps: any = track.getCapabilities ? track.getCapabilities() : {};

         setCanTorch(!!caps.torch);
         
         if (caps.zoom) {
            setZoomCap({ min: caps.zoom.min || 1, max: Math.min(caps.zoom.max || 5, 5), step: caps.zoom.step || 0.1 });
            // Apply initial zoom
            track.applyConstraints({ advanced: [{ zoom: 1.2 }] }).catch(()=>{});
         }
     }
  };

  // Trigger Start saat ID berubah
  useEffect(() => {
     if (selectedCameraId && permissionGranted) {
         startScanner(selectedCameraId);
     }
  }, [selectedCameraId, permissionGranted]);

  // Handle Zoom & Torch
  const handleZoom = (val: number) => {
      setZoom(val);
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ zoom: val }] }).catch(()=>{});
  };

  const handleTorch = () => {
      const newStatus = !torchOn;
      setTorchOn(newStatus);
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ torch: newStatus }] }).catch(()=>{});
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center shadow-md z-20">
         <h3 className="text-white font-bold flex items-center gap-2">
            <i className="fa-solid fa-camera text-blue-500"></i> Scanner
         </h3>
         <button onClick={onClose} className="w-10 h-10 bg-slate-800 text-white rounded-full flex items-center justify-center">
            <i className="fa-solid fa-xmark"></i>
         </button>
      </div>

      {/* Main View */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          <div id="reader-custom-view" className="w-full h-full bg-black"></div>

          {/* Error State */}
          {errorMsg && (
              <div className="absolute inset-0 bg-slate-900 z-40 flex flex-col items-center justify-center p-6 text-center">
                  <i className="fa-solid fa-triangle-exclamation text-4xl text-amber-500 mb-4"></i>
                  <p className="text-white mb-6">{errorMsg}</p>
                  <button onClick={() => { setErrorMsg(''); requestCameraPermission(); }} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">
                      Coba Lagi / Izinkan
                  </button>
              </div>
          )}

          {/* Overlay Scanner */}
          {!errorMsg && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                  <div style={{ width: boxSize.width, height: boxSize.height }} className="border-2 border-green-400 relative shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)]">
                      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 animate-pulse shadow-[0_0_8px_red]"></div>
                  </div>
                  <div className="mt-8 bg-black/60 backdrop-blur px-4 py-2 rounded-full">
                      <p className="text-white text-xs font-medium">Jauhkan HP & Gunakan Zoom</p>
                  </div>
              </div>
          )}
      </div>

      {/* Controls */}
      <div className="bg-slate-900 p-4 border-t border-slate-800 flex flex-col gap-4 z-20">
          {/* Zoom Slider */}
          {zoomCap && !errorMsg && (
              <div className="px-2">
                  <div className="flex justify-between text-[10px] text-slate-400 uppercase font-bold mb-1">
                      <span>1x</span>
                      <span>Zoom</span>
                      <span>{zoomCap.max}x</span>
                  </div>
                  <input type="range" min={zoomCap.min} max={zoomCap.max} step={zoomCap.step} value={zoom} onChange={(e) => handleZoom(parseFloat(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none accent-blue-500" />
              </div>
          )}

          <div className="flex gap-3">
              <select className="flex-1 bg-slate-800 text-white border border-slate-700 rounded-lg px-3 py-3 text-sm font-bold outline-none" value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)}>
                  {cameras.map((c, i) => <option key={c.id} value={c.id}>{c.label || `Kamera ${i+1}`}</option>)}
              </select>
              
              {canTorch && (
                  <button onClick={handleTorch} className={`w-12 rounded-lg flex items-center justify-center text-xl border ${torchOn ? 'bg-amber-400 border-amber-400 text-black' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                      <i className="fa-solid fa-bolt"></i>
                  </button>
              )}
          </div>
      </div>
    </div>
  );
};