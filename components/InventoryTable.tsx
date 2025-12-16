import React, { useState, useEffect, useRef } from 'react';
import { InventoryItem } from '../types';
import { fetchRecentInventory } from '../services/inventoryService';

interface InventoryTableProps {
  items: InventoryItem[];
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ items }) => {
  const [search, setSearch] = useState('');
  const [localItems, setLocalItems] = useState<InventoryItem[]>(items);
  const prevFirstItemId = useRef<string>('');

  // 1. Sinkronisasi Data dari App.tsx ke Tabel Lokal
  useEffect(() => {
    setLocalItems(items);

    // LOGIKA ALERT & BUNYI
    // Jika ada item baru di urutan pertama (index 0) dan statusnya scanned:
    if (items.length > 0) {
      const firstItem = items[0];
      
      // Cek apakah item paling atas berubah (artinya ada scan baru)
      if (firstItem.id !== prevFirstItemId.current) {
        prevFirstItemId.current = firstItem.id;

        // Jika item tersebut hasil scan (is_scanned = true), mainkan efek
        if (firstItem.is_scanned) {
            playSuccessSound();
        }
      }
    }
  }, [items]);

  // Helper: Suara Scan Sukses (Backup jika di App.tsx tidak bunyi)
  const playSuccessSound = () => {
    try {
        // Nada 'Pop' ringan agar tidak berisik
        const audio = new Audio('https://actions.google.com/sounds/v1/science_fiction/scifi_laser.ogg'); 
        audio.volume = 0.5;
        audio.play().catch(() => {}); // Catch error jika browser memblokir autoplay
    } catch (e) {}
  };

  // 2. Handle Pencarian (Server Side Search)
  const handleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        // Tampilkan loading indicator kecil (opsional, lewat opacity)
        const input = e.target as HTMLInputElement;
        input.disabled = true; 
        
        try {
            // Request ke Server Supabase (Cari di 25.000 data)
            const res = await fetchRecentInventory(search);
            setLocalItems(res);
        } catch(err) { 
            console.error(err); 
        } finally {
            input.disabled = false;
            input.focus();
        }
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full relative overflow-hidden">
      
      {/* CSS Injection untuk Animasi Baris */}
      <style>{`
        @keyframes flashGreen {
            0% { background-color: #d1fae5; transform: scale(1.02); }
            50% { background-color: #ecfdf5; transform: scale(1.01); }
            100% { background-color: transparent; transform: scale(1); }
          }
        .animate-flash {
            animation: flashGreen 1s ease-out;
        }
        .pop-icon {
            animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes popIn {
            0% { transform: scale(0); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Header Tabel */}
      <div className="p-3 border-b border-slate-100 flex flex-col gap-2 bg-slate-50 rounded-t-xl z-10">
        <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-700 text-sm flex items-center">
                <i className="fa-solid fa-clock-rotate-left mr-2 text-indigo-500"></i> 
                Riwayat & Pencarian
            </h3>
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 py-1 px-2 rounded-full shadow-sm">
             50 Terakhir
            </span>
        </div>
        
        <div className="relative">
            <i className="fa-solid fa-search absolute left-3 top-2.5 text-slate-400 text-xs"></i>
            <input 
                type="text" 
                placeholder="Ketik Nama/Barcode lalu Enter..." 
                className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearch}
            />
        </div>
      </div>
      
      {/* Body Tabel */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-xs font-bold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="p-3 w-12 text-center">STS</th>
              <th className="p-3">Detail Barang</th>
              <th className="hidden sm:table-cell p-3 text-right">Harga</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {localItems.length === 0 ? (
               <tr>
                   <td colSpan={3} className="p-10 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                       <i className="fa-regular fa-folder-open text-2xl opacity-50"></i>
                       <span>Data tidak ditemukan.</span>
                   </td>
               </tr>
            ) : (
              localItems.map((item, index) => {
                // Logic Animasi: Jika ini item pertama di list, beri efek Flash
                const isFirstRow = index === 0;
                const rowClass = isFirstRow && item.is_scanned ? 'animate-flash bg-green-50/50' : 'hover:bg-slate-50';
                
                return (
                    <tr key={item.id} className={`transition-colors duration-300 ${rowClass}`}>
                      {/* Kolom Status (Icon) */}
                      <td className="p-3 align-top text-center">
                        {item.is_scanned ? (
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mx-auto pop-icon shadow-sm">
                                <i className="fa-solid fa-check text-green-600 text-sm"></i>
                            </div>
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
                                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                            </div>
                        )}
                      </td>

                      {/* Kolom Detail */}
                      <td className="p-3 align-top">
                        <div className="font-bold text-slate-800 text-sm leading-tight mb-1">
                            {item.item_name}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] sm:text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                <i className="fa-solid fa-barcode mr-1 text-slate-400"></i>
                                {item.barcode}
                            </span>
                            
                            {/* Tampilkan Badge Brand/Warna */}
                            {item.brand !== '-' && (
                                <span className="text-[10px] text-slate-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                    {item.brand}
                                </span>
                            )}
                        </div>

                        {/* Info Tambahan di Mobile (Harga & Tipe) */}
                        <div className="sm:hidden text-[10px] text-slate-400 mt-1.5 flex justify-between items-center pr-2 border-t border-slate-50 pt-1">
                            <span>{item.type}</span>
                            <span className="font-mono font-medium text-slate-600">
                                Rp {Number(item.price).toLocaleString('id-ID')}
                            </span>
                        </div>
                      </td>

                      {/* Kolom Harga (Desktop) */}
                      <td className="hidden sm:table-cell p-3 align-top text-right font-mono text-xs font-medium text-slate-600">
                          Rp {Number(item.price).toLocaleString('id-ID')}
                      </td>
                    </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};