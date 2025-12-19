// components/CameraScanner.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (barcode: string) => void;
  onClose: () => void;
  onError: (error: string) => void;
}

const CameraScanner: React.FC<CameraScannerProps> = ({ 
  onScanSuccess, 
  onClose, 
  onError 
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraId, setCameraId] = useState<string>('');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Initialize scanner
  useEffect(() => {
    const initScanner = async () => {
      try {
        // Request camera permissions and get list
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera if available
          const backCamera = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear')
          );
          setCameraId(backCamera?.deviceId || devices[0].deviceId);
        } else {
          onError('No cameras found on this device');
        }
      } catch (error: any) {
        console.error('Camera initialization error:', error);
        onError(`Camera error: ${error.message}`);
      }
    };

    initScanner();

    // Cleanup on unmount
    return () => {
      stopScanning();
    };
  }, []);

  // Start scanning when camera is selected
  useEffect(() => {
    if (cameraId && !isScanning) {
      startScanning();
    }
  }, [cameraId]);

  // Start scanning
  const startScanning = async () => {
    if (!cameraId || !previewRef.current) return;

    try {
      setIsScanning(true);
      
      // Create scanner instance
      scannerRef.current = new Html5Qrcode("camera-preview", {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.AZTEC,
          Html5QrcodeSupportedFormats.PDF_417,
          Html5QrcodeSupportedFormats.RSS_14,
          Html5QrcodeSupportedFormats.RSS_EXPANDED
        ]
      });

      // Start scanning
      await scannerRef.current.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          disableFlip: false
        },
        (decodedText) => {
          // Success callback
          console.log('Scanned:', decodedText);
          onScanSuccess(decodedText);
          stopScanning();
        },
        (errorMessage) => {
          // Error callback (ignore decoding errors)
          if (!errorMessage.includes('No QR code found')) {
            console.debug('Scan error:', errorMessage);
          }
        }
      );

    } catch (error: any) {
      console.error('Scan start error:', error);
      setIsScanning(false);
      onError(`Failed to start camera: ${error.message}`);
    }
  };

  // Stop scanning
  const stopScanning = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (error) {
        console.error('Stop scanning error:', error);
      } finally {
        setIsScanning(false);
        scannerRef.current = null;
      }
    }
  };

  // Toggle torch
  const toggleTorch = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ torch: !torchEnabled } as any]
        });
        setTorchEnabled(!torchEnabled);
      } catch (error) {
        console.warn('Torch not supported:', error);
      }
    }
  };

  // Switch camera
  const switchCamera = async (deviceId: string) => {
    if (deviceId === cameraId) return;
    
    await stopScanning();
    setCameraId(deviceId);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 bg-black/80 text-white p-4 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <i className="fa-solid fa-arrow-left text-xl"></i>
          </button>
          <h2 className="text-xl font-bold">Camera Scanner</h2>
        </div>
        <div className="flex items-center gap-2">
          {isScanning && (
            <div className="flex items-center gap-2 text-green-400">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-sm">Scanning...</span>
            </div>
          )}
        </div>
      </div>

      {/* Camera Preview */}
      <div className="relative w-full max-w-2xl aspect-square rounded-xl overflow-hidden shadow-2xl">
        <div 
          id="camera-preview"
          ref={previewRef}
          className="w-full h-full bg-black"
        />
        
        {/* Scan Frame Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top overlay */}
          <div className="absolute top-0 left-0 right-0 h-1/4 bg-black/50"></div>
          
          {/* Center frame */}
          <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 border-2 border-white/80 rounded-xl">
            {/* Corner markers */}
            <div className="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl-lg"></div>
            <div className="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr-lg"></div>
            <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl-lg"></div>
            <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br-lg"></div>
            
            {/* Scanning animation */}
            {isScanning && (
              <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-scan"></div>
            )}
          </div>
          
          {/* Bottom overlay */}
          <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-black/50"></div>
        </div>

        {/* Scan Instructions */}
        <div className="absolute bottom-8 left-0 right-0 text-center text-white">
          <p className="text-lg font-bold mb-2">Position barcode within frame</p>
          <p className="text-sm text-gray-300">Ensure good lighting and steady hands</p>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap gap-4 justify-center">
        {/* Camera Selector */}
        {cameras.length > 1 && (
          <div className="bg-black/70 rounded-xl p-4">
            <p className="text-white text-sm font-medium mb-2">Select Camera:</p>
            <div className="flex gap-2">
              {cameras.map((camera) => (
                <button
                  key={camera.deviceId}
                  onClick={() => switchCamera(camera.deviceId)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    cameraId === camera.deviceId
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {camera.label.includes('back') ? 'Back' : 
                   camera.label.includes('front') ? 'Front' : 
                   `Camera ${cameras.indexOf(camera) + 1}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          {/* Torch Button */}
          <button
            onClick={toggleTorch}
            className={`p-4 rounded-full ${
              torchEnabled
                ? 'bg-yellow-500 text-black hover:bg-yellow-600'
                : 'bg-gray-800 text-white hover:bg-gray-700'
            } transition-colors`}
            title="Toggle Flashlight"
          >
            <i className="fa-solid fa-lightbulb text-xl"></i>
          </button>

          {/* Scan Button */}
          <button
            onClick={isScanning ? stopScanning : startScanning}
            className={`px-6 py-4 rounded-xl font-bold flex items-center gap-2 transition-all ${
              isScanning
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isScanning ? (
              <>
                <i className="fa-solid fa-stop"></i>
                Stop Scanning
              </>
            ) : (
              <>
                <i className="fa-solid fa-play"></i>
                Start Scanning
              </>
            )}
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="px-6 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold flex items-center gap-2 transition-colors"
          >
            <i className="fa-solid fa-times"></i>
            Close
          </button>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 max-w-2xl bg-black/70 rounded-xl p-4 text-white">
        <p className="font-medium mb-2 flex items-center gap-2">
          <i className="fa-solid fa-tips"></i>
          Scanning Tips:
        </p>
        <ul className="text-sm text-gray-300 space-y-1">
          <li>• Hold device steady, 15-30 cm from barcode</li>
          <li>• Ensure barcode is clean and undamaged</li>
          <li>• Use torch in low-light conditions</li>
          <li>• Try different angles if scan fails</li>
          <li>• Use back camera for better quality</li>
        </ul>
      </div>

      {/* Scanner Status */}
      <div className="mt-4 text-sm text-gray-400">
        {isScanning ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span>Scanner active - looking for barcodes...</span>
          </div>
        ) : (
          <span>Scanner paused - click Start to begin</span>
        )}
      </div>
    </div>
  );
};

export default CameraScanner;