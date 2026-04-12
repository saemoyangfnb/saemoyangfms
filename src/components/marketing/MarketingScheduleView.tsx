import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, where, updateDoc, doc } from 'firebase/firestore';
import { reviewDb } from '../../firebase';
import { MarketingSchedule } from '../../types';
import { useToast } from '../Toast';
import { Copy, Clock, CheckCircle, Download, Image as ImageIcon } from 'lucide-react';

// ✅ Vercel 에러 방지: 기존 타입에 status 속성 추가 인정해주기
interface ExtendedSchedule extends MarketingSchedule {
  status?: string;
  collageUrl?: string | null;
}

export function MarketingScheduleView({ activeBrand }: { activeBrand: string | null }) {
  const [schedules, setSchedules] = useState<ExtendedSchedule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const toast = useToast();

  useEffect(() => {
    let q = query(collection(reviewDb, 'marketing_schedules'), orderBy('createdAt', 'desc'));
    if (activeBrand) {
      q = query(collection(reviewDb, 'marketing_schedules'), where('brandId', '==', activeBrand), orderBy('createdAt', 'desc'));
    }

    const unsub = onSnapshot(q, (snap) => {
      const data: ExtendedSchedule[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as ExtendedSchedule);
      });
      setSchedules(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    });

    return () => unsub();
  }, [activeBrand]);

  const selectedItem = schedules.find(s => s.id === selectedId);

  const copyToClipboard = (text: string, platform: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${platform} 텍스트가 클립보드에 복사되었습니다.`);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(reviewDb, 'marketing_schedules', id), { status: newStatus });
      toast.success('상태가 변경되었습니다.');
    } catch (error) {
      toast.error('상태 변경에 실패했습니다.');
    }
  };

  const filteredSchedules = schedules.filter(s => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return s.status === 'pending' || !s.status;
    return s.status === statusFilter;
  });

  return (
    <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-800 shadow-none overflow-hidden flex flex-col lg:flex-row min-h-[600px]">
      
      {/* 리스트 패널 */}
      <div className="w-full lg:w-1/3 border-r border-stone-300 dark:border-stone-800 flex flex-col bg-stone-100 dark:bg-stone-900">
        <div className="p-4 border-b-2 border-stone-800 dark:border-stone-600 bg-white dark:bg-stone-900 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-stone-900 dark:text-white flex items-center gap-2 tracking-tight">
              <Clock size={16} /> 보관된 원고 ({filteredSchedules.length}건)
            </h3>
          </div>
          <div className="flex bg-stone-200 dark:bg-stone-800 p-1 rounded-sm border border-stone-300">
            {(['all', 'pending', 'completed'] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`flex-1 text-xs font-bold py-1.5 rounded-sm transition-colors ${statusFilter === f ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm border border-stone-300' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}>
                {f === 'all' ? '전체' : f === 'pending' ? '대기중' : '발행완료'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredSchedules.length === 0 ? (
             <div className="p-6 text-center text-sm font-medium text-stone-500">저장된 스케줄이 없습니다.</div>
          ) : (
            <div className="divide-y divide-stone-200 dark:divide-stone-800/60">
              {filteredSchedules.map(item => {
                const isPending = item.status === 'pending' || !item.status;
                return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left p-4 transition-colors hover:bg-stone-200 dark:hover:bg-stone-800 ${selectedId === item.id ? 'bg-white dark:bg-stone-900/20 border-l-[3px] border-stone-800' : 'border-l-[3px] border-transparent'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`font-bold text-sm text-stone-900 dark:text-stone-200 ${selectedId === item.id ? 'font-black' : ''}`}>{item.storeName}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold border ${isPending ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                      {isPending ? '대기중' : '발행완료'}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
                    {new Date(item.createdAt).toLocaleString('ko-KR')}
                  </div>
                </button>
              )})}
            </div>
          )}
        </div>
      </div>

      {/* 디테일 뷰어 패널 */}
      <div className="w-full lg:w-2/3 p-6 flex flex-col bg-[#FDFBF7] dark:bg-stone-900">
        {selectedItem ? (
          <div className="flex-1 flex flex-col space-y-6">
            <div className="flex items-center justify-between pb-4 border-b-2 border-stone-800 dark:border-stone-600">
              <h2 className="text-xl font-black text-stone-900 dark:text-white tracking-tight">
              {selectedItem.storeName} <span className="font-medium text-stone-500 text-sm ml-2 tracking-widest">마케팅 원고</span>
              </h2>
              <div className="flex gap-2">
                {(selectedItem.status === 'pending' || !selectedItem.status) ? (
                  <button onClick={() => handleStatusChange(selectedItem.id, 'completed')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 rounded-sm transition-colors"><CheckCircle size={14}/> 발행 완료로 변경</button>
                ) : (
                  <button onClick={() => handleStatusChange(selectedItem.id, 'pending')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-300 dark:border-amber-800 rounded-sm transition-colors"><Clock size={14}/> 대기중으로 변경</button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
              {/* Naver */}
              <div className="flex flex-col bg-white dark:bg-stone-800/50 rounded-sm border border-stone-300 dark:border-stone-700 shadow-sm">
                <div className="p-3 border-b border-stone-300 dark:border-stone-700 flex justify-between items-center">
                  <span className="font-black text-sm text-stone-900 tracking-tight">네이버 블로그</span>
                  <button onClick={() => copyToClipboard(selectedItem.naverText, '네이버')} className="p-1 text-stone-400 hover:text-stone-800 dark:hover:text-white"><Copy size={14}/></button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto">
                   <pre className="text-xs text-stone-800 dark:text-stone-300 whitespace-pre-wrap font-serif leading-relaxed">{selectedItem.naverText}</pre>
                </div>
              </div>

               {/* Insta */}
               <div className="flex flex-col bg-white dark:bg-stone-800/50 rounded-sm border border-stone-300 dark:border-stone-700 shadow-sm">
                <div className="p-3 border-b border-stone-300 dark:border-stone-700 flex justify-between items-center">
                  <span className="font-black text-sm text-stone-900 tracking-tight">인스타그램</span>
                  <button onClick={() => copyToClipboard(selectedItem.instaText, '인스타그램')} className="p-1 text-stone-400 hover:text-stone-800 dark:hover:text-white"><Copy size={14}/></button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto">
                   <pre className="text-xs text-stone-800 dark:text-stone-300 whitespace-pre-wrap font-serif leading-relaxed">{selectedItem.instaText}</pre>
                </div>
              </div>

               {/* Daangn */}
               <div className="flex flex-col bg-white dark:bg-stone-800/50 rounded-sm border border-stone-300 dark:border-stone-700 shadow-sm">
                <div className="p-3 border-b border-stone-300 dark:border-stone-700 flex justify-between items-center">
                  <span className="font-black text-sm text-stone-900 tracking-tight">당근마켓</span>
                  <button onClick={() => copyToClipboard(selectedItem.daangnText, '당근마켓')} className="p-1 text-stone-400 hover:text-stone-800 dark:hover:text-white"><Copy size={14}/></button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto">
                   <pre className="text-xs text-stone-800 dark:text-stone-300 whitespace-pre-wrap font-serif leading-relaxed">{selectedItem.daangnText}</pre>
                </div>
              </div>
            </div>

            {/* 저장된 콜라주 이미지가 있는 경우 표시 */}
            {selectedItem.collageUrl && (
              <div className="mt-6 flex flex-col bg-white dark:bg-stone-800/50 rounded-sm border border-stone-300 dark:border-stone-700 shadow-sm">
                <div className="p-3 border-b border-stone-300 dark:border-stone-700 flex justify-between items-center">
                  <span className="font-black text-sm text-stone-900 flex items-center gap-1.5 tracking-tight"><ImageIcon size={14}/> 저장된 콜라주 이미지</span>
                  <a href={selectedItem.collageUrl} download={`${selectedItem.storeName}_리뷰콜라주.jpg`} className="p-1 text-stone-500 hover:text-stone-900 dark:hover:text-stone-400 flex items-center gap-1 text-xs font-bold transition-colors"><Download size={14}/> 다운로드</a>
                </div>
                <div className="p-4 flex items-center justify-center bg-stone-100 dark:bg-stone-900/50">
                   <img src={selectedItem.collageUrl} alt="저장된 콜라주" className="max-h-[300px] object-contain border border-stone-300 dark:border-stone-700 shadow-sm" />
                </div>
              </div>
            )}
            
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-stone-400 dark:text-stone-600 font-bold">
             스케줄을 선택하면 내용을 확인할 수 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}
