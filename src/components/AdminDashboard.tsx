import { useState, useEffect, FormEvent } from 'react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Grid, List, Search, Trash2, Cpu, Printer, ExternalLink, Lock, Image as ImageIcon, Download } from 'lucide-react';

interface Submission {
  id: string;
  senderName: string;
  photoUrl: string;
  submittedAt: any;
  status: string;
  aiAnalysis?: string;
  groupName?: string;
}

export default function AdminDashboard() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // States for simple password authentication
  const [isAdmin, setIsAdmin] = useState<boolean>(() => sessionStorage.getItem('isAdminAuth') === 'true');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const formatTimestamp = (submittedAt: any) => {
    if (!submittedAt) return '';
    try {
      const d = submittedAt.toDate ? submittedAt.toDate() : new Date(submittedAt);
      return d.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    if (!isAdmin) return;

    // Sort by senderName ascending (가나다 순)
    const q = query(collection(db, 'submissions'), orderBy('senderName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Submission[];
      setSubmissions(data);
    }, (error) => {
      console.error("Firestore subscription error:", error);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handlePasswordLogin = (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (password === '5612') {
      setIsAdmin(true);
      sessionStorage.setItem('isAdminAuth', 'true');
      setPassword('');
    } else {
      setLoginError('비밀번호가 올바르지 않습니다.');
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('isAdminAuth');
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({ path: cleanUrl }, '', cleanUrl);
    window.dispatchEvent(new Event('popstate'));
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (e) {
      alert('인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단 설정을 확인하거나, 앱을 새 탭에서 열어주세요.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('정말로 이 사진을 삭제하시겠습니까?')) {
      await deleteDoc(doc(db, 'submissions', id));
    }
  };

  const activeSubmissions = submissions.filter(s => 
    s.senderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.groupName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
        <div className="w-full max-w-md bg-white p-10 rounded-3xl shadow-2xl shadow-slate-200 border border-slate-100 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center text-white shadow-lg shadow-blue-200 mb-2">
              <Cpu size={28} />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">포토수집 프로</h1>
            <p className="text-xs text-slate-500">자동화 모니터링 캠페인 관리 시스템</p>
          </div>

          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">관리자 비밀번호</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-mono text-center tracking-widest text-lg" 
                placeholder="••••"
                required
              />
            </div>

            {loginError && (
              <div className="text-[10px] text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-lg leading-relaxed font-semibold">
                ⚠️ {loginError}
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all text-xs cursor-pointer shadow-md"
            >
              대시보드 로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100 text-slate-900">
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-100">
            <ImageIcon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">포토수집 프로</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">자동 모니터링</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full uppercase tracking-tighter">실시간 연동</span>
            <p className="text-xs text-slate-500 font-medium mt-1">총 수신 사진: {submissions.length}장</p>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">kong@suwonrehab.or.kr</p>
              <button 
                onClick={handleLogout}
                className="text-[10px] font-bold text-red-500 uppercase flex items-center gap-1 hover:underline justify-end"
              >
                로그아웃
              </button>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
              <Lock size={16} className="text-slate-400" />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-50 border-r border-slate-200 p-6 flex flex-col gap-8 shrink-0 print:hidden">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">빠른 필터</label>
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="이름으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">화면 레이아웃</label>
            <div className="mt-3 flex p-1 bg-white rounded-lg border border-slate-200 shadow-sm">
              <button 
                onClick={() => setView('grid')}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-md text-[10px] font-bold transition-all ${view === 'grid' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Grid size={14} className="mr-1.5" /> 그리드
              </button>
              <button 
                onClick={() => setView('list')}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-md text-[10px] font-bold transition-all ${view === 'list' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <List size={14} className="mr-1.5" /> 리스트
              </button>
            </div>
          </div>



          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">클라우드 경로</label>
            <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-[10px] font-mono break-all text-slate-500 italic shadow-sm">
              /submissions/{new Date().toISOString().split('T')[0]}
            </div>
          </div>



          <div className="mt-auto space-y-2">
             {window.self !== window.top && (
               <button 
                 onClick={() => window.open(window.location.href, '_blank')}
                 className="w-full py-3 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl font-bold text-[10px] shadow-sm hover:bg-blue-100 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
               >
                 <ExternalLink size={14} /> 새 탭에서 열기 (인쇄 권장)
               </button>
             )}
             <button 
               onClick={handlePrint}
               className="w-full py-3 bg-white border border-slate-200 text-slate-800 rounded-xl font-bold text-[11px] shadow-sm hover:bg-slate-50 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
             >
               <Printer size={14} /> 증빙자료 인쇄
             </button>
             <button className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold text-[11px] shadow-lg shadow-slate-200 hover:bg-slate-900 transition-all uppercase tracking-widest">
               CSV 로그 내보내기
             </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 bg-white overflow-hidden flex flex-col">
          <div className="p-8 flex items-end justify-between border-b border-slate-50 shrink-0">
            <div className="print:block hidden print:mb-8">
              <h1 className="text-2xl font-bold">서비스 모니터링 증빙자료 ({new Date().toLocaleDateString('ko-KR')})</h1>
            </div>
            <div className="print:hidden">
              <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">수신된 사진</h2>
              <p className="text-xs text-slate-400 font-medium mt-1">총 {activeSubmissions.length}개의 제출물을 실시간으로 모니터링하고 있습니다.</p>
            </div>
            
            <div className="text-right print:hidden">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 font-mono">전체 사진 수</p>
              <p className="text-2xl font-black text-slate-800 tracking-tighter">
                {activeSubmissions.length}장
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar print:p-0 print:overflow-visible">
            <AnimatePresence mode="wait">
              {view === 'grid' ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 print:grid-cols-2 print:gap-4"
                >
                  {activeSubmissions.map((sub) => (
                    <motion.div 
                      key={sub.id}
                      layoutId={sub.id}
                      className="group bg-white rounded-xl overflow-hidden border border-slate-200 hover:shadow-2xl hover:shadow-slate-200 hover:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all flex flex-col print:shadow-none print:border-slate-300 print:break-inside-avoid"
                    >
                      <div 
                        className="aspect-square relative overflow-hidden bg-slate-50 border-b border-slate-100 cursor-zoom-in print:cursor-default"
                        onClick={() => setSelectedImage(sub.photoUrl)}
                      >
                        <img 
                          src={sub.photoUrl} 
                          alt={sub.senderName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 print:scale-100"
                        />
                        {/* Overlay sender name on image */}
                        <div className="absolute top-3 left-3 flex flex-col gap-1 print:top-2 print:left-2">
                          <span className="px-2 py-1 bg-white/90 backdrop-blur-sm text-slate-900 text-[10px] font-black rounded-md shadow-sm border border-slate-100 print:bg-white print:border-slate-300 print:text-xs">
                            {sub.senderName}
                          </span>
                        </div>
                      </div>
                      
                      <div className="p-4 flex-1 flex flex-col justify-center print:p-2">
                        <div className="flex flex-col gap-1.5 justify-center">
                          <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">보낸 사람</h4>
                          <h3 className="font-extrabold text-slate-800 text-sm truncate print:text-base">{sub.senderName}</h3>
                          <div className="h-px bg-slate-100 my-1"></div>
                          <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">전송 시간</h4>
                          <span className="text-[11px] font-mono font-bold text-slate-500 print:text-slate-700">
                            {sub.submittedAt ? formatTimestamp(sub.submittedAt) : '전송 중...'}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  
                  {/* Empty state slots to match design mockup */}
                  {activeSubmissions.length < 8 && Array.from({ length: 8 - activeSubmissions.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="rounded-xl border-2 border-dashed border-slate-100 h-64 flex flex-col items-center justify-center bg-slate-50 opacity-40">
                      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">제출 대기 중...</p>
                    </div>
                  ))}
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
                >
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">미리보기</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">발신인</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">전송 시간</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">작업</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeSubmissions.map((sub) => (
                        <tr key={sub.id} className="hover:bg-slate-50/50 group transition-all">
                          <td className="px-6 py-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200">
                              <img src={sub.photoUrl} className="w-full h-full object-cover" />
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span className="font-bold text-slate-800 text-sm">{sub.senderName}</span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="text-xs font-mono text-slate-500">
                              {sub.submittedAt ? formatTimestamp(sub.submittedAt) : '전송 중...'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <button 
                              onClick={() => handleDelete(sub.id)}
                              className="p-2 text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>

            {activeSubmissions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32 opacity-20 text-slate-500">
                <ImageIcon size={48} className="mb-4" />
                <p className="font-bold uppercase tracking-[0.2em] text-xs">첫 수신 대기 중</p>
              </div>
            )}
          </div>

          {/* Footer Summary Bar */}
          <footer className="mt-auto border-t border-slate-100 p-6 flex items-center justify-between bg-slate-50/50 print:hidden">
            <div className="flex gap-10">
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">총 수신 사진 수</p>
                <p className="text-sm font-bold text-slate-800">{activeSubmissions.length}장</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">저장소 상태</p>
                <p className="text-sm font-bold text-slate-800">안정적 (실시간 연동)</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-200"></div>
                <div className="w-7 h-7 rounded-full border-2 border-white bg-blue-600 flex items-center justify-center text-[9px] text-white font-bold tracking-tighter">AI</div>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">시스템 가동 중</p>
            </div>
          </footer>
        </main>
      </div>

      {/* Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 bg-slate-900/95 z-[100] flex items-center justify-center p-8 backdrop-blur-sm cursor-zoom-out"
          >
            <motion.div
              layoutId={submissions.find(s => s.photoUrl === selectedImage)?.id}
              className="relative max-w-full max-h-full"
            >
              <img 
                src={selectedImage} 
                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
              />
              <div className="absolute top-6 right-6 text-white font-mono text-xs uppercase tracking-widest bg-white/10 px-4 py-2 rounded-full backdrop-blur">
                아무 곳이나 클릭하여 닫기
              </div>
              <div className="mt-4 flex justify-between items-center bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10">
                <p className="text-white font-bold text-sm">
                  {submissions.find(s => s.photoUrl === selectedImage)?.senderName}
                </p>
                <a 
                  href={selectedImage} 
                  download 
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 bg-white text-slate-900 px-4 py-2 rounded-lg text-xs font-bold shadow-lg hover:bg-slate-100 transition-all"
                >
                  <Download size={14} /> 원본 다운로드
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
