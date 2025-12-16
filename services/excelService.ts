import { read, utils } from 'xlsx';

// Helper pencari kolom fleksibel (case insensitive)
const findValue = (row: any, keywords: string[]): any => {
  const keys = Object.keys(row);
  const foundKey = keys.find(key => 
    keywords.some(keyword => key.toLowerCase().trim() === keyword.toLowerCase())
  );
  return foundKey ? row[foundKey] : null;
};

// PEMBERSIH HARGA AGRESIF (Hapus titik, koma, Rp, dll)
// Mengubah "Rp 150.000,00" menjadi integer 150000
const parsePrice = (price: any): number => {
  if (typeof price === 'number') return Math.floor(price);
  
  if (typeof price === 'string') {
    // Hapus desimal nol di belakang (,00 atau .00) agar tidak bingung
    let clean = price.replace(/[,.]00$/, '');
    // Hapus SEMUA karakter KECUALI angka 0-9
    clean = clean.replace(/[^0-9]/g, '');
    return parseInt(clean, 10) || 0;
  }
  return 0;
};

export const parseExcelFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        
        // Baca Workbook
        const workbook = read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert ke JSON dengan default value kosong
        const rawData = utils.sheet_to_json(worksheet, { defval: '' });
        
        if (rawData.length === 0) throw new Error("File Excel Kosong.");

        // Mapping Data agar sesuai Database Supabase
        const formattedData = rawData.map((row: any) => {
            const barcode = findValue(row, ['barcode', 'bar code', 'kode', 'sku']) || '';
            const name = findValue(row, ['item name', 'name', 'nama', 'desc', 'description']) || 'No Name';
            const brand = findValue(row, ['brand', 'merk']) || '-';
            const color = findValue(row, ['color', 'warna']) || '-';
            const status = findValue(row, ['status', 'sts']) || '-';
            const type = findValue(row, ['type', 'tipe', 'kategori']) || 'Sistem';
            const priceRaw = findValue(row, ['price', 'harga', 'rp', 'amount']) || 0;

            // Validasi: Barcode wajib ada & bersihkan spasi
            const cleanBarcode = String(barcode).trim();
            
            // Skip jika barcode kosong atau tulisan 'undefined'
            if(!cleanBarcode || cleanBarcode.toLowerCase() === 'undefined') return null;

            return {
              barcode: cleanBarcode,
              // Hapus tanda kutip (') atau (") pada nama barang agar tidak merusak SQL
              item_name: String(name).trim().replace(/['"]/g, ''), 
              brand: String(brand).trim(),
              color: String(color).trim(),
              status: String(status).trim(),
              type: String(type).trim(),
              price: parsePrice(priceRaw), // Pakai pembersih harga
              is_scanned: false,
            };
        }).filter(item => item !== null); // Buang baris yang null

        if (formattedData.length === 0) throw new Error("Tidak ada data valid (Barcode tidak ditemukan).");
        
        resolve(formattedData);

      } catch (error) {
        console.error("Excel Parse Error:", error);
        reject(error);
      }
    };

    reader.onerror = (err) => reject(err);
    // Gunakan ArrayBuffer untuk performa terbaik
    reader.readAsArrayBuffer(file);
  });
};