import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

// Konstanta untuk pengaturan
const SCANNER_CONFIG = {
  fps: 30,
  qrbox: { width: 250, height: 250 },
  aspectRatio: 1.0,
  disableFlip: false,
  rememberLastUsedCamera: true,
  showTorchButtonIfSupported: true,
  supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
  formatsToSupport: [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.CODABAR,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.AZTEC,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
    Html5QrcodeSupportedFormats.MAXICODE,
    Html5QrcodeSupportedFormats.PDF_417,
    Html5QrcodeSupportedFormats.RSS_14,
    Html5QrcodeSupportedFormats.RSS_EXPANDED,
  ],
} as const;

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view-" + Date.now();
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const lastCameraIdRef = useRef<string>('');
  const initializationAttemptRef = useRef(0);
  const flashSupportedRef = useRef(false);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // --- FUNGSI UTAMA ---

  // 1. Inisialisasi Kamera dengan retry logic
  const initializeCameras = useCallback(async (retryCount = 0) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('Browser tidak mendukung kamera');
      setPermissionError(true);
      setIsLoading(false);
      return;
    }

    try {
      // Coba dapatkan daftar kamera
      const devices = await Html5Qrcode.getCameras();
      
      if (devices && devices.length > 0) {
        setCameras(devices);
        
        // Coba gunakan kamera yang terakhir dipilih dari localStorage
        const savedCameraId = localStorage.getItem('lastCameraId');
        let targetCameraId = '';
        
        // Logika pemilihan kamera berdasarkan platform
        if (isIOS) {
          // Untuk iOS, prioritaskan kamera belakang
          const backCamera = devices.find(device => 
            device.label.toLowerCase().includes('back') ||
            device.label.toLowerCase().includes('environment') ||
            device.label.match(/rear|back|environment/i)
          );
          
          if (backCamera) {
            targetCameraId = backCamera.id;
          } else if (savedCameraId && devices.some(d => d.id === savedCameraId)) {
            targetCameraId = savedCameraId;
          } else {
            targetCameraId = devices[0].id;
          }
        } else {
          // Untuk Android/desktop
          if (savedCameraId && devices.some(d => d.id === savedCameraId)) {
            targetCameraId = savedCameraId;
          } else {
            // Cari kamera belakang
            const backCamera = devices.find(device => 
              device.label.toLowerCase().includes('back') ||
              device.label.toLowerCase().includes('rear') ||
              device.label.toLowerCase().includes('environment')
            );
            
            targetCameraId = backCamera ? backCamera.id : devices[0].id;
          }
        }
        
        setSelectedCameraId(targetCameraId);
        lastCameraIdRef.current = targetCameraId;
        
        // Start scanner otomatis
        await startScanner(targetCameraId);
        setIsInitialized(true);
      } else {
        throw new Error('Tidak ada kamera ditemukan');
      }
    } catch (error: any) {
      console.error('Error inisialisasi kamera:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionError(true);
      } else if (retryCount < 3) {
        // Retry dengan delay bertahap
        setTimeout(() => initializeCameras(retryCount + 1), 1000 * (retryCount + 1));
      } else {
        setPermissionError(true);
      }
      
      setIsLoading(false);
    }
  }, [isIOS]);

  // 2. Start Scanner dengan konfigurasi optimal
  const startScanner = async (cameraId: string) => {
    if (scannerRef.current?.isScanning) {
      await stopScanner();
    }

    setIsLoading(true);
    setPermissionError(false);

    try {
      // Cleanup container sebelum memulai
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = '';
      }

      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;

      // Konfigurasi optimal untuk berbagai device
      const config = {
        ...SCANNER_CONFIG,
        fps: isIOS ? 20 : 30, // Lower FPS untuk iOS lebih stabil
      };

      // Constraints khusus untuk iOS
      let videoConstraints: MediaTrackConstraints;
      
      if (isIOS) {
        // iOS membutuhkan constraints yang lebih sederhana
        videoConstraints = {
          deviceId: { exact: cameraId },
          facingMode: { ideal: 'environment' },
          width: { ideal: 720 },
          height: { ideal: 1280 },
          aspectRatio: { ideal: 0.5625 }, // 9:16 portrait
        };
      } else {
        videoConstraints = {
          deviceId: { exact: cameraId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          focusMode: 'continuous',
          resizeMode: 'crop-and-scale',
        };
      }

      // Start scanner
      await html5QrCode.start(
        { deviceId: { exact: cameraId } },
        config,
        (decodedText) => {
          // Vibrate jika didukung
          if (navigator.vibrate) {
            navigator.vibrate(100);
          }
          
          // Update scan count
          setScanCount(prev => prev + 1);
          
          // Kirim hasil scan
          onScanSuccess(decodedText);
          
          // Jangan tutup scanner, biarkan tetap terbuka untuk scan berikutnya
          // Hanya reset jika perlu
          setTimeout(() => {
            // Focus kembali ke scanner
            if (scannerRef.current && !scannerRef.current.isScanning) {
              restartScanner();
            }
          }, 1000);
        },
        (errorMessage) => {
          // Handle scanning errors (non-fatal)
          console.log('Scan error:', errorMessage);
        }
      );

      // Setup flash/torch setelah kamera aktif
      setTimeout(() => setupFlashCapabilities(), 500);
      
      // Setup zoom setelah kamera aktif
      setTimeout(() => setupZoomCapabilities(), 600);
      
      setIsScanning(true);
      setIsLoading(false);
      
      // Simpan cameraId ke localStorage
      localStorage.setItem('lastCameraId', cameraId);
      
    } catch (error: any) {
      console.error('Gagal memulai scanner:', error);
      
      if (error.name === 'NotAllowedError') {
        setPermissionError(true);
      } else if (error.message.includes('Could not start video stream')) {
        // Coba dengan constraints yang lebih sederhana
        await fallbackStartScanner(cameraId);
      } else {
        setPermissionError(true);
      }
      
      setIsLoading(false);
    }
  };

  // 3. Fallback untuk device yang bermasalah
  const fallbackStartScanner = async (cameraId: string) => {
    try {
      if (!scannerRef.current) return;
      
      const html5QrCode = scannerRef.current;
      
      // Stop jika sedang scanning
      if (html5QrCode.isScanning) {
        await html5QrCode.stop();
      }
      
      // Coba dengan constraints minimal
      const minimalConfig = {
        fps: 15,
        qrbox: { width: 200, height: 200 },
        aspectRatio: 1.0,
      };
      
      await html5QrCode.start(
        { facingMode: 'environment' }, // Gunakan facingMode sebagai fallback
        minimalConfig,
        (decodedText) => {
          if (navigator.vibrate) navigator.vibrate(100);
          onScanSuccess(decodedText);
          setScanCount(prev => prev + 1);
        },
        () => {}
      );
      
      setIsScanning(true);
      setIsLoading(false);
    } catch (fallbackError) {
      console.error('Fallback juga gagal:', fallbackError);
      setPermissionError(true);
      setIsLoading(false);
    }
  };

  // 4. Setup Flash/Torch Capabilities
  const setupFlashCapabilities = () => {
    const videoElement = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    if (!videoElement || !videoElement.srcObject) return;

    const stream = videoElement.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    videoTrackRef.current = track;

    if (track && track.getCapabilities) {
      const capabilities = track.getCapabilities();
      
      // Cek apakah flash/torch didukung
      if ('torch' in capabilities || 'fillLightMode' in capabilities) {
        flashSupportedRef.current = true;
        setHasFlash(true);
      }
    }
  };

  // 5. Toggle Flash
  const toggleFlash = async () => {
    if (!videoTrackRef.current) return;

    try {
      const track = videoTrackRef.current;
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      
      if ('torch' in capabilities) {
        await track.applyConstraints({
          advanced: [{ torch: !isFlashOn } as any]
        });
        setIsFlashOn(!isFlashOn);
      } else if ('fillLightMode' in capabilities) {
        // Untuk device Apple
        await track.applyConstraints({
          advanced: [{ fillLightMode: !isFlashOn ? 'flash' : 'off' } as any]
        });
        setIsFlashOn(!isFlashOn);
      }
    } catch (error) {
      console.error('Gagal mengontrol flash:', error);
    }
  };

  // 6. Setup Zoom Capabilities
  const setupZoomCapabilities = () => {
    const videoElement = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    if (!videoElement || !videoElement.srcObject) return;

    const stream = videoElement.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];

    if (track && track.getCapabilities) {
      const capabilities = track.getCapabilities();
      
      if ('zoom' in capabilities) {
        const zoomCapability = capabilities.zoom as any;
        setZoomCap({
          min: zoomCapability.min || 1,
          max: Math.min(zoomCapability.max || 5, 8), // Batasi maksimal 8x
          step: zoomCapability.step || 0.1
        });
        
        // Set zoom default 1.5x untuk scanning lebih baik
        const defaultZoom = Math.max(1.5, zoomCapability.min || 1);
        applyZoom(defaultZoom);
      }
    }
  };

  // 7. Apply Zoom
  const applyZoom = (value: number) => {
    setZoom(value);
    const videoElement = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    const track = videoElement?.srcObject 
      ? (videoElement.srcObject as MediaStream).getVideoTracks()[0] 
      : null;

    if (track && track.applyConstraints) {
      try {
        track.applyConstraints({ advanced: [{ zoom: value }] as any });
      } catch (error) {
        console.error('Gagal apply zoom:', error);
      }
    }
  };

  // 8. Stop Scanner
  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (error) {
        console.error('Error stopping scanner:', error);
      }
    }
    
    // Matikan flash jika aktif
    if (isFlashOn && videoTrackRef.current) {
      try {
        const track = videoTrackRef.current;
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        
        if ('torch' in capabilities) {
          await track.applyConstraints({
            advanced: [{ torch: false } as any]
          });
        } else if ('fillLightMode' in capabilities) {
          await track.applyConstraints({
            advanced: [{ fillLightMode: 'off' } as any]
          });
        }
      } catch (error) {
        console.error('Error turning off flash:', error);
      }
    }
    
    setIsFlashOn(false);
    setIsScanning(false);
    videoTrackRef.current = null;
  };

  // 9. Restart Scanner (untuk scan berikutnya)
  const restartScanner = async () => {
    if (!selectedCameraId) return;
    
    await stopScanner();
    await startScanner(selectedCameraId);
  };

  // 10. Ganti Kamera
  const switchCamera = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    lastCameraIdRef.current = cameraId;
    
    await stopScanner();
    await startScanner(cameraId);
  };

  // 11. Manual Start Scanner
  const manualStartScanner = async () => {
    if (selectedCameraId) {
      await startScanner(selectedCameraId);
    } else if (cameras.length > 0) {
      await startScanner(cameras[0].id);
    }
  };

  // 12. Handle Camera Change
  const handleCameraChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newCameraId = event.target.value;
    switchCamera(newCameraId);
  };

  // --- EFFECTS ---

  // Inisialisasi pertama
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await initializeCameras();
    };

    init();

    return () => {
      // Cleanup saat komponen unmount
      stopScanner();
      scannerRef.current = null;
    };
  }, [initializeCameras]);

  // Handle scan success tanpa menutup scanner
  useEffect(() => {
    if (scanCount > 0) {
      // Beri feedback sukses scan
      const successSound = () => {
        // Optional: tambahkan suara scan berhasil
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      };
      
      successSound();
    }
  }, [scanCount]);

  // --- RENDER ---
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 flex justify-between items-center shadow-xl z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center transition-colors"
            aria-label="Tutup scanner"
          >
            <i className="fa-solid fa-arrow-left text-white"></i>
          </button>
          <div>
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <i className="fa-solid fa-qrcode text-blue-400"></i> 
              Scanner Kamera
            </h3>
            <p className="text-xs text-slate-300">
              {isScanning ? 'Arahkan kamera ke QR/Barcode' : 'Menyiapkan kamera...'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isScanning && hasFlash && (
            <button
              onClick={toggleFlash}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                isFlashOn 
                  ? 'bg-yellow-500 text-black' 
                  : 'bg-slate-700 hover:bg-slate-600 text-white'
              }`}
              aria-label={isFlashOn ? 'Matikan flash' : 'Nyalakan flash'}
            >
              <i className={`fa-solid ${isFlashOn ? 'fa-bolt' : 'fa-bolt-lightning'} text-lg`}></i>
            </button>
          )}
          
          <div className="bg-slate-700 px-3 py-1 rounded-full">
            <span className="text-xs font-bold text-white">
              Scan: <span className="text-green-400">{scanCount}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Scanner Area */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {/* Scanner Container */}
        <div 
          id={containerId}
          className="absolute inset-0 w-full h-full"
        />
        
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <i className="fa-solid fa-camera text-blue-400 text-xl"></i>
              </div>
            </div>
            <p className="mt-4 text-white font-medium">Menyiapkan scanner...</p>
            <p className="text-sm text-slate-400 mt-2">
              {initializationAttemptRef.current > 0 
                ? `Mencoba lagi (${initializationAttemptRef.current})...` 
                : 'Mohon tunggu'}
            </p>
          </div>
        )}
        
        {/* Permission Error Overlay */}
        {permissionError && !isLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-black p-6">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full border border-slate-700">
              <div className="w-20 h-20 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
                <i className="fa-solid fa-camera-slash text-3xl text-red-400"></i>
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-2">
                Izin Kamera Diperlukan
              </h3>
              <p className="text-slate-300 text-center mb-6">
                Scanner memerlukan akses kamera untuk bekerja. 
                {isIOS && (
                  <span className="block text-sm text-yellow-300 mt-2">
                    📱 Tip iOS: Pastikan izin kamera diaktifkan di Settings &gt; Safari
                  </span>
                )}
              </p>
              <div className="space-y-3">
                <button
                  onClick={manualStartScanner}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-3"
                >
                  <i className="fa-solid fa-power-off"></i>
                  Coba Lagi
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                >
                  Muat Ulang Halaman
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Scanning Overlay */}
        {isScanning && !isLoading && !permissionError && (
          <>
            {/* Scanning Frame */}
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="relative w-[280px] h-[280px]">
                {/* Corner Borders */}
                <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-green-500 rounded-tl-xl"></div>
                <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-green-500 rounded-tr-xl"></div>
                <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-green-500 rounded-bl-xl"></div>
                <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-green-500 rounded-br-xl"></div>
                
                {/* Animated Scanning Line */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-scan"></div>
                
                {/* Overlay Mask */}
                <div className="absolute -inset-[100vh] border-[100vh] border-black/60 -z-10"></div>
              </div>
            </div>
            
            {/* Instructions */}
            <div className="absolute bottom-32 left-0 right-0 z-20 flex justify-center">
              <div className="bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10">
                <p className="text-white text-sm font-medium">
                  <i className="fa-solid fa-lightbulb text-yellow-400 mr-2"></i>
                  Arahkan kamera ke QR/Barcode
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Controls Footer */}
      <div className="bg-gradient-to-t from-slate-900 to-slate-800 p-4 border-t border-slate-700 z-30">
        {/* Camera Selection */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <i className="fa-solid fa-camera text-blue-400"></i>
            <span className="text-white font-medium text-sm">Pilih Kamera</span>
          </div>
          <div className="relative">
            <select
              className="w-full bg-slate-800 border border-slate-600 rounded-xl py-3 pl-4 pr-10 text-white text-sm font-medium appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              value={selectedCameraId}
              onChange={handleCameraChange}
              disabled={isLoading}
            >
              {cameras.map((camera, index) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label || `Kamera ${index + 1}`}
                  {selectedCameraId === camera.id && ' ✓'}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none">
              <i className="fa-solid fa-chevron-down"></i>
            </div>
          </div>
        </div>
        
        {/* Zoom Control */}
        {zoomCap && isScanning && (
          <div className="mb-4 bg-slate-800/50 rounded-xl p-3 border border-slate-700">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-magnifying-glass text-blue-400"></i>
                <span className="text-white text-sm font-medium">Zoom</span>
              </div>
              <span className="text-blue-300 font-bold">{zoom.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={zoomCap.min}
              max={zoomCap.max}
              step={zoomCap.step}
              value={zoom}
              onChange={(e) => applyZoom(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>Normal</span>
              <span>Maksimal</span>
            </div>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={restartScanner}
            disabled={isLoading}
            className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-rotate"></i>
            Restart
          </button>
          
          {isScanning && (
            <button
              onClick={() => {
                setScanCount(0);
                restartScanner();
              }}
              className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-barcode"></i>
              Scan Lagi
            </button>
          )}
        </div>
      </div>

      {/* iOS Specific Warning */}
      {isIOS && !isScanning && !isLoading && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 mx-4 mb-4 p-3 rounded-xl">
          <div className="flex items-start gap-2">
            <i className="fa-solid fa-mobile-screen text-yellow-400 mt-1"></i>
            <div>
              <p className="text-yellow-300 text-sm font-medium">Tips untuk iPhone/iPad:</p>
              <p className="text-yellow-200/80 text-xs">
                1. Pastikan izin kamera diaktifkan
                <br />
                2. Gunakan kamera belakang untuk hasil terbaik
                <br />
                3. Hindari cahaya terlalu terang/silau
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Tambahkan CSS untuk animasi scan
const style = document.createElement('style');
style.textContent = `
  @keyframes scan {
    0%, 100% {
      top: 0%;
      opacity: 1;
    }
    50% {
      top: 100%;
      opacity: 0.7;
    }
  }
  
  .animate-scan {
    animation: scan 2s ease-in-out infinite;
  }
  
  /* Styling untuk select dropdown */
  select {
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
    background-position: right 0.5rem center;
    background-repeat: no-repeat;
    background-size: 1.5em 1.5em;
    padding-right: 2.5rem;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  /* Custom range slider */
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    height: 1rem;
    width: 1rem;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }
  
  input[type="range"]::-moz-range-thumb {
    height: 1rem;
    width: 1rem;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }
`;

document.head.appendChild(style);