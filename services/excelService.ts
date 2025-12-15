import { read, utils } from 'xlsx';

// Helper: Cari value di row berdasarkan kata kunci (case insensitive)
const findValue = (row: any, keywords: string[]): any => {
  const keys = Object.keys(row);
  const foundKey = keys.find(key => 
    keywords.some(keyword => key.toLowerCase().trim() === keyword.toLowerCase())
  );
  return foundKey ? row[foundKey] : null;
};

// LOGIKA BARU: Membersihkan Harga dengan Agresif
const parsePrice = (price: any): number => {
  if (typeof price === 'number') return price;
  
  if (typeof price === 'string') {
    let clean = price.trim();
    
    // 1. Hapus ",00" atau ".00" di ujung (sen/desimal nol)
    clean = clean.replace(/[,.]00$/, '');
    
    // 2. Hapus semua karakter KECUALI angka (0-9)
    // Ini mengubah "250.000" -> "250000" dan "Rp 250,000" -> "250000"
    clean = clean.replace(/[^0-9]/g, '');

    // 3. Parse ke number
    return parseFloat(clean) || 0;
  }
  return 0;
};

export const parseExcelFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        
        // Baca Excel
        const workbook = read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // defval: '' memastikan kolom kosong tidak undefined
        const rawData = utils.sheet_to_json(worksheet, { defval: '' });
        
        if (rawData.length === 0) {
            throw new Error("File Excel kosong.");
        }

        const formattedData = rawData.map((row: any) => {
            // Pencarian Kolom yang lebih pintar
            const barcode = findValue(row, ['barcode', 'bar code', 'kode', 'sku', 'item id']) || '';
            const name = findValue(row, ['item name', 'name', 'nama', 'nama barang', 'description', 'desc']) || 'No Name';
            const brand = findValue(row, ['brand', 'merk', 'vendor']) || '-';
            const color = findValue(row, ['color', 'warna']) || '-';
            const status = findValue(row, ['status', 'sts', 'state']) || '-';
            const type = findValue(row, ['type', 'tipe', 'kategori', 'group']) || 'Sistem';
            const priceRaw = findValue(row, ['price', 'harga', 'rp', 'amount', 'sales price']) || 0;

            return {
              barcode: String(barcode).trim(),
              item_name: String(name).trim(),
              brand: String(brand).trim(),
              color: String(color).trim(),
              status: String(status).trim(),
              type: String(type).trim(),
              price: parsePrice(priceRaw), // Menggunakan logika parsePrice baru
              is_scanned: false,
            };
        }).filter((item: any) => item.barcode.length > 0 && item.barcode !== 'undefined');

        if (formattedData.length === 0) {
            throw new Error("Gagal membaca Barcode. Pastikan kolom header benar (Barcode, Name, Price, dll).");
        }

        resolve(formattedData);
      } catch (error) {
        console.error("Parse Error:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};