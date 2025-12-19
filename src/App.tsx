import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import SignatureCanvas from 'react-signature-canvas';

const API_BASE = 'http://localhost:5000/api'; 

// --- UTILITIES ---
const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('id-ID') : '-';
const formatMoney = (n: number) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR'}).format(n);

// --- COMPONENTS ---
const LoadingOverlay = ({ msg }: { msg: string }) => (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500 mb-4"></div>
        <h2 className="text-white text-xl font-bold animate-pulse">{msg}</h2>
    </div>
);

const PrintLayout = ({ data, type }: any) => {
    if (!data) return null;
    return (
        <div className="print-only p-8 bg-white text-black font-sans">
            <div className="border-b-2 border-black pb-4 mb-6 flex justify-between">
                <div>
                    <h1 className="text-3xl font-bold uppercase tracking-widest">{type === 'LOAN' ? 'FORM PEMINJAMAN' : 'FORM PENGEMBALIAN'}</h1>
                    <p className="text-sm uppercase tracking-wide">Wardrobe & Property Dept</p>
                </div>
                <div className="text-right">
                    <h2 className="text-xl font-bold">{data.invoice_no || 'RET-'+Date.now()}</h2>
                    <p className="text-xs">Dicetak: {new Date().toLocaleString()}</p>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-8 mb-6 text-sm border p-4 rounded">
                <div>
                    <table className="w-full">
                        <tbody>
                            <tr><td className="font-bold w-32">Peminjam</td><td>: {data.borrower_name}</td></tr>
                            {type === 'LOAN' && <tr><td className="font-bold">Program</td><td>: {data.program_name}</td></tr>}
                            <tr><td className="font-bold">Petugas Input</td><td>: {data.inputter_name}</td></tr>
                        </tbody>
                    </table>
                </div>
                <div className="text-right">
                    {type === 'LOAN' && (
                        <>
                            <p className="font-bold text-lg mb-1">DEADLINE (21 Hari)</p>
                            <p className="text-2xl font-bold text-red-600 border-2 border-red-600 inline-block px-2">{formatDate(data.due_date)}</p>
                        </>
                    )}
                </div>
            </div>

            <table className="w-full border-collapse border border-black mb-8 text-xs">
                <thead>
                    <tr className="bg-gray-200">
                        <th className="border border-black p-2 w-10">No</th>
                        <th className="border border-black p-2 w-32">Barcode</th>
                        <th className="border border-black p-2">Nama Barang</th>
                        <th className="border border-black p-2 w-32">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {data.items.map((item: any, idx: number) => (
                        <tr key={idx}>
                            <td className="border border-black p-2 text-center">{idx + 1}</td>
                            <td className="border border-black p-2 font-mono text-center">{item.barcode}</td>
                            <td className="border border-black p-2">{item.item_name}</td>
                            <td className="border border-black p-2 text-center">{type==='LOAN'?'Dipinjam':'Dikembalikan'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="flex justify-between mt-16 text-center text-sm break-inside-avoid">
                <div className="w-1/3">
                    <p className="mb-16">Petugas,</p>
                    <div className="border-b border-black"></div>
                    <p className="font-bold mt-2">{data.inputter_name}</p>
                </div>
                <div className="w-1/3">
                    <p className="mb-2">Peminjam,</p>
                    {data.signature ? <img src={data.signature} alt="TTD" className="h-16 mx-auto mb-2" /> : <div className="h-16"></div>}
                    <div className="border-b border-black"></div>
                    <p className="font-bold mt-2">{data.borrower_name}</p>
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP ---
const App: React.FC = () => {
    const [user, setUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState('DASHBOARD');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('');
    
    // Data
    const [stats, setStats] = useState({ total: 0, on_loan: 0, available: 0 });
    const [items, setItems] = useState<any[]>([]);
    const [borrowers, setBorrowers] = useState<any[]>([]);
    const [usersList, setUsersList] = useState<any[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    
    // Print
    const [printData, setPrintData] = useState<any>(null);
    const [printType, setPrintType] = useState<'LOAN'|'RETURN'>('LOAN');

    // Inputs
    const [loginForm, setLoginForm] = useState({ username: '', password: '' });
    const [scanInput, setScanInput] = useState('');
    const [filterInput, setFilterInput] = useState('');
    
    // Forms
    const [cart, setCart] = useState<any[]>([]);
    const [loanForm, setLoanForm] = useState({ program: '', reason: '', borrower_id: '' });
    const [newUser, setNewUser] = useState({ fullname: '', username: '', nik: '', password: '', role: 'staff' });
    const [newBorrower, setNewBorrower] = useState({ nik: '', name: '', phone: '', position: '' });
    
    const sigPad = useRef<any>(null);
    const api = axios.create({ baseURL: API_BASE });

    // Init
    useEffect(() => {
        const u = localStorage.getItem('wardrobe_user');
        if(u) setUser(JSON.parse(u));
    }, []);

    useEffect(() => {
        if(user) {
            if(activeTab === 'DASHBOARD') fetchStats();
            if(activeTab === 'ITEMS') fetchItems();
            if(['LOAN','RETURN','BORROWERS'].includes(activeTab)) fetchBorrowers();
            if(activeTab === 'USERS') fetchUsers();
            if(activeTab === 'LOGS') fetchLogs();
        }
    }, [user, activeTab]);

    // API Calls
    const fetchStats = async () => { try { const r = await api.get('/stats'); setStats(r.data); } catch(e){} };
    const fetchItems = async () => { try { const r = await api.get(`/items?search=${filterInput}`); setItems(r.data); } catch(e){} };
    const fetchBorrowers = async () => { try { const r = await api.get('/borrowers'); setBorrowers(r.data); } catch(e){} };
    const fetchUsers = async () => { try { const r = await api.get('/users'); setUsersList(r.data); } catch(e){} };
    const fetchLogs = async () => { try { const r = await api.get('/logs'); setLogs(r.data); } catch(e){} };

    // Handlers
    const handleLogin = async (e: any) => {
        e.preventDefault();
        setLoadingMsg("Login..."); setIsLoading(true);
        try {
            const r = await api.post('/login', loginForm);
            setUser(r.data.user);
            localStorage.setItem('wardrobe_user', JSON.stringify(r.data.user));
        } catch(e) { alert("Login Gagal"); }
        finally { setIsLoading(false); }
    };

    const handleUpload = async (e: any) => {
        const file = e.target.files[0];
        if(!file) return;
        const fd = new FormData(); fd.append('file', file);
        setLoadingMsg("Mengupload & Memproses Data..."); setIsLoading(true);
        try {
            const r = await api.post('/items/upload', fd);
            alert(`Sukses! ${r.data.count} data diproses.`);
            if(activeTab==='ITEMS') fetchItems();
        } catch(e: any) { alert("Upload Gagal: " + e.response?.data?.detail || e.message); }
        finally { setIsLoading(false); e.target.value = null; }
    };

    const handleCreateUser = async (e:any) => {
        e.preventDefault(); setIsLoading(true);
        try { await api.post('/users', newUser); alert("User dibuat!"); fetchUsers(); setNewUser({fullname:'', username:'', nik:'', password:'', role:'staff'}); }
        catch(e) { alert("Gagal"); } finally { setIsLoading(false); }
    };

    const handleCreateBorrower = async (e:any) => {
        e.preventDefault(); setIsLoading(true);
        try { await api.post('/borrowers', newBorrower); alert("Peminjam ditambahkan!"); fetchBorrowers(); setNewBorrower({nik:'', name:'', phone:'', position:''}); }
        catch(e) { alert("Gagal"); } finally { setIsLoading(false); }
    };

    const handleScanLoan = async (bc: string) => {
        if(!bc) return;
        if(cart.find(c=>c.barcode===bc)) return alert("Sudah ada di keranjang");
        try {
            const r = await api.get(`/items/${bc}`);
            if(r.data.found && r.data.data.status==='Available') setCart([...cart, r.data.data]);
            else alert("Barang tidak tersedia / tidak ditemukan");
        } catch(e){}
    };

    const submitLoan = async () => {
        if(!loanForm.borrower_id || cart.length===0 || sigPad.current.isEmpty()) return alert("Data Belum Lengkap!");
        const borrower = borrowers.find(b=>b.id==loanForm.borrower_id);
        setLoadingMsg("Memproses Transaksi..."); setIsLoading(true);
        try {
            const r = await api.post('/loan', {
                ...loanForm, borrower_name: borrower.name, inputter_name: user.fullname, inputter_nik: user.nik,
                signature_base64: sigPad.current.getCanvas().toDataURL(), items: cart.map(c=>c.barcode)
            });
            setPrintType('LOAN');
            setPrintData({ invoice_no: r.data.invoice_no, program_name: loanForm.program, borrower_name: borrower.name, inputter_name: user.fullname, due_date: r.data.due_date, signature: sigPad.current.getCanvas().toDataURL(), items: cart });
            setCart([]); setLoanForm({...loanForm, program:'', reason:''}); sigPad.current.clear();
            setTimeout(()=>window.print(), 1000);
        } catch(e:any) { alert("Gagal: " + e.response?.data?.message); }
        finally { setIsLoading(false); }
    };

    const handleReturn = async (bc: string) => {
        if(!bc) return;
        setLoadingMsg("Memproses Pengembalian..."); setIsLoading(true);
        try {
            const r = await api.post('/return', { barcode: bc, inputter_name: user.fullname });
            setPrintType('RETURN');
            setPrintData({ borrower_name: r.data.data.borrower_name, inputter_name: user.fullname, items: [{barcode: bc, item_name: r.data.data.item_name}] });
            alert("Barang Dikembalikan!");
            setTimeout(()=>window.print(), 1000);
        } catch(e:any) { alert(e.response?.data?.message || "Gagal"); }
        finally { setIsLoading(false); }
    };

    if(!user) return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
            <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-xl w-96">
                <h1 className="text-2xl font-bold text-center mb-6">LOGIN WARDROBE</h1>
                <input className="w-full p-3 mb-3 border rounded" placeholder="Username" value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username:e.target.value})} />
                <input className="w-full p-3 mb-6 border rounded" type="password" placeholder="Password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password:e.target.value})} />
                <button className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">LOGIN</button>
            </form>
            {isLoading && <LoadingOverlay msg={loadingMsg} />}
        </div>
    );

    return (
        <div className="flex min-h-screen bg-gray-100 font-sans text-gray-800">
            {isLoading && <LoadingOverlay msg={loadingMsg} />}
            <PrintLayout data={printData} type={printType} />

            {/* SIDEBAR */}
            <div className="w-64 bg-gray-900 text-gray-300 fixed h-full flex flex-col no-print">
                <div className="p-6 border-b border-gray-800">
                    <h1 className="text-xl font-bold text-white">WARDROBE<span className="text-blue-500">SYS</span></h1>
                    <p className="text-sm mt-2">{user.fullname}</p>
                    <p className="text-xs text-gray-500">{user.role.toUpperCase()} | NIK: {user.nik || '-'}</p>
                </div>
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {[{id:'DASHBOARD',l:'Dashboard',i:'fa-home'}, {id:'LOAN',l:'Peminjaman',i:'fa-cart-plus'}, {id:'RETURN',l:'Pengembalian',i:'fa-undo'}, 
                      {id:'ITEMS',l:'Data Barang',i:'fa-shirt'}, {id:'UPLOAD',l:'Upload Stock',i:'fa-upload'}, {id:'BORROWERS',l:'Data Peminjam',i:'fa-address-book'},
                      {id:'LOGS',l:'Riwayat Log',i:'fa-history'}, ...(user.role==='admin'?[{id:'USERS',l:'Kelola Staff',i:'fa-users-gear'}]:[])]
                    .map(m=>(
                        <button key={m.id} onClick={()=>setActiveTab(m.id)} className={`w-full text-left p-3 rounded flex items-center gap-3 ${activeTab===m.id?'bg-blue-600 text-white shadow-lg':'hover:bg-gray-800'}`}>
                            <i className={`fa-solid ${m.i} w-5`}></i> {m.l}
                        </button>
                    ))}
                </nav>
                <div className="p-4"><button onClick={()=>{setUser(null); localStorage.removeItem('wardrobe_user');}} className="w-full bg-red-900/50 text-red-300 py-2 rounded hover:bg-red-600 hover:text-white transition">LOGOUT</button></div>
            </div>

            {/* MAIN */}
            <main className="ml-64 p-8 flex-1 no-print overflow-hidden">
                <header className="flex justify-between items-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-700">{activeTab.replace('_',' ')}</h2>
                    <div className="text-right text-sm text-gray-500"><p>{new Date().toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}</p></div>
                </header>

                {/* CONTENT */}
                {activeTab === 'DASHBOARD' && (
                    <div className="grid grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500">
                            <p className="text-gray-400 text-sm font-bold">TOTAL ASSETS</p>
                            <p className="text-4xl font-bold text-gray-800">{stats.total}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-orange-500">
                            <p className="text-gray-400 text-sm font-bold">DIPINJAM</p>
                            <p className="text-4xl font-bold text-orange-600">{stats.on_loan}</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-green-500">
                            <p className="text-gray-400 text-sm font-bold">TERSEDIA</p>
                            <p className="text-4xl font-bold text-green-600">{stats.available}</p>
                        </div>
                    </div>
                )}

                {activeTab === 'ITEMS' && (
                    <div className="bg-white rounded-xl shadow h-[calc(100vh-150px)] flex flex-col">
                        <div className="p-4 border-b flex gap-4">
                            <input className="flex-1 p-2 border rounded" placeholder="Cari..." value={filterInput} onChange={e=>setFilterInput(e.target.value)} />
                            <button onClick={fetchItems} className="bg-gray-800 text-white px-4 rounded">Cari</button>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 sticky top-0"><tr><th className="p-3">Barcode</th><th className="p-3">Name</th><th className="p-3">Receive No</th><th className="p-3">Brand</th><th className="p-3">Sex</th><th className="p-3">Size</th><th className="p-3">Price</th><th className="p-3">Status</th></tr></thead>
                                <tbody>{items.map(i=>(
                                    <tr key={i.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-mono text-blue-600">{i.barcode}</td>
                                        <td className="p-3 font-bold">{i.item_name}</td>
                                        <td className="p-3 text-gray-500">{i.receive_no}</td>
                                        <td className="p-3">{i.brand}</td>
                                        <td className="p-3">{i.sex}</td>
                                        <td className="p-3">{i.size}</td>
                                        <td className="p-3">{formatMoney(i.price)}</td>
                                        <td className="p-3"><span className={`px-2 py-1 rounded text-xs ${i.status==='Available'?'bg-green-100 text-green-800':'bg-orange-100 text-orange-800'}`}>{i.status}</span></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'UPLOAD' && (
                    <div className="max-w-lg mx-auto mt-10 bg-white p-10 rounded-2xl shadow-lg text-center border-2 border-dashed border-blue-300">
                        <i className="fa-solid fa-cloud-arrow-up text-6xl text-blue-200 mb-6"></i>
                        <h2 className="text-xl font-bold mb-4">Upload Excel Stock</h2>
                        <input type="file" onChange={handleUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                        <p className="text-xs text-gray-400 mt-4">*Format sesuai Excel: Receive No., Receive Date, Barcode, Name, Sex, Color, Size, Brand, Price</p>
                    </div>
                )}

                {activeTab === 'LOAN' && (
                    <div className="flex gap-6 h-[calc(100vh-150px)]">
                        <div className="w-1/3 bg-white p-6 rounded-xl shadow overflow-y-auto">
                            <h3 className="font-bold text-blue-600 mb-4">Form Peminjaman</h3>
                            <div className="space-y-4">
                                <input list="borrowers" className="w-full p-2 border rounded" placeholder="Cari Peminjam..." onChange={e=>{const b=borrowers.find(x=>x.name===e.target.value); if(b) setLoanForm({...loanForm, borrower_id:b.id})}} />
                                <datalist id="borrowers">{borrowers.map(b=><option key={b.id} value={b.name}>{b.nik} - {b.position}</option>)}</datalist>
                                <input className="w-full p-2 border rounded" placeholder="Program" value={loanForm.program} onChange={e=>setLoanForm({...loanForm, program:e.target.value})} />
                                <textarea className="w-full p-2 border rounded" placeholder="Keperluan" value={loanForm.reason} onChange={e=>setLoanForm({...loanForm, reason:e.target.value})} />
                                <div className="border border-dashed p-2 rounded text-center"><p className="text-xs text-gray-400">Tanda Tangan</p><SignatureCanvas ref={sigPad} canvasProps={{className:'w-full h-24 bg-white rounded'}} /><button onClick={()=>sigPad.current.clear()} className="text-xs text-red-500">Clear</button></div>
                                <button onClick={submitLoan} className="w-full bg-blue-600 text-white py-3 rounded font-bold">PROSES</button>
                            </div>
                        </div>
                        <div className="w-2/3 flex flex-col gap-4">
                            <div className="bg-white p-4 rounded-xl shadow"><input autoFocus className="w-full p-3 border-2 border-blue-400 rounded text-lg font-mono" placeholder="Scan Barcode..." value={scanInput} onChange={e=>setScanInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){handleScanLoan(scanInput); setScanInput('');}}} /></div>
                            <div className="bg-white flex-1 rounded-xl shadow p-4 overflow-auto"><h3 className="font-bold mb-4">Keranjang ({cart.length})</h3><table className="w-full text-sm text-left"><thead className="bg-gray-50"><tr><th className="p-2">Barcode</th><th className="p-2">Nama</th><th className="p-2">Aksi</th></tr></thead><tbody>{cart.map((c,i)=>(<tr key={i} className="border-b"><td className="p-2 font-mono text-blue-600">{c.barcode}</td><td className="p-2">{c.item_name}</td><td className="p-2"><button onClick={()=>setCart(cart.filter(x=>x.barcode!==c.barcode))} className="text-red-500"><i className="fa-solid fa-trash"></i></button></td></tr>))}</tbody></table></div>
                        </div>
                    </div>
                )}

                {activeTab === 'RETURN' && (
                    <div className="max-w-lg mx-auto mt-10 bg-white p-10 rounded-2xl shadow text-center">
                        <h2 className="text-2xl font-bold mb-4">Scan Pengembalian</h2>
                        <input autoFocus className="w-full p-4 border-2 border-green-500 rounded-xl text-center text-xl font-mono" placeholder="Scan Barcode..." value={scanInput} onChange={e=>setScanInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){handleReturn(scanInput); setScanInput('');}}} />
                    </div>
                )}
                
                {/* Simplified Logs & Users View for brevity in full code */}
                {activeTab === 'LOGS' && <div className="bg-white p-6 rounded-xl shadow h-[calc(100vh-150px)] overflow-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-100 sticky top-0"><tr><th className="p-3">Waktu</th><th className="p-3">User</th><th className="p-3">Aksi</th><th className="p-3">Deskripsi</th></tr></thead><tbody>{logs.map(l=>(<tr key={l.id} className="border-b"><td className="p-3 text-gray-500">{new Date(l.created_at).toLocaleString()}</td><td className="p-3 font-bold">{l.user_name}</td><td className="p-3">{l.action_type}</td><td className="p-3">{l.description}</td></tr>))}</tbody></table></div>}
                
                {activeTab === 'USERS' && <div className="bg-white p-6 rounded-xl shadow"><h3 className="font-bold mb-4">Buat User Staff</h3><form onSubmit={handleCreateUser} className="grid grid-cols-5 gap-2 mb-6"><input className="p-2 border rounded" placeholder="Username" value={newUser.username} onChange={e=>setNewUser({...newUser, username:e.target.value})} /><input className="p-2 border rounded" type="password" placeholder="Pass" value={newUser.password} onChange={e=>setNewUser({...newUser, password:e.target.value})} /><input className="p-2 border rounded" placeholder="Nama" value={newUser.fullname} onChange={e=>setNewUser({...newUser, fullname:e.target.value})} /><input className="p-2 border rounded" placeholder="NIK" value={newUser.nik} onChange={e=>setNewUser({...newUser, nik:e.target.value})} /><button className="bg-blue-600 text-white rounded font-bold">ADD</button></form><table className="w-full text-sm text-left"><thead className="bg-gray-100"><tr><th className="p-2">User</th><th className="p-2">Nama</th><th className="p-2">NIK</th></tr></thead><tbody>{usersList.map(u=>(<tr key={u.id} className="border-b"><td className="p-2">{u.username}</td><td className="p-2">{u.fullname}</td><td className="p-2">{u.nik}</td></tr>))}</tbody></table></div>}
                
                {activeTab === 'BORROWERS' && <div className="bg-white p-6 rounded-xl shadow"><h3 className="font-bold mb-4">Buat Peminjam</h3><form onSubmit={handleCreateBorrower} className="grid grid-cols-5 gap-2 mb-6"><input className="p-2 border rounded" placeholder="NIK" value={newBorrower.nik} onChange={e=>setNewBorrower({...newBorrower, nik:e.target.value})} /><input className="p-2 border rounded" placeholder="Nama" value={newBorrower.name} onChange={e=>setNewBorrower({...newBorrower, name:e.target.value})} /><input className="p-2 border rounded" placeholder="HP" value={newBorrower.phone} onChange={e=>setNewBorrower({...newBorrower, phone:e.target.value})} /><input className="p-2 border rounded" placeholder="Jabatan" value={newBorrower.position} onChange={e=>setNewBorrower({...newBorrower, position:e.target.value})} /><button className="bg-green-600 text-white rounded font-bold">ADD</button></form><div className="h-96 overflow-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-100 sticky top-0"><tr><th className="p-2">NIK</th><th className="p-2">Nama</th><th className="p-2">Jabatan</th></tr></thead><tbody>{borrowers.map(b=>(<tr key={b.id} className="border-b"><td className="p-2">{b.nik}</td><td className="p-2 font-bold">{b.name}</td><td className="p-2">{b.position}</td></tr>))}</tbody></table></div></div>}

            </main>
        </div>
    );
};

export default App;