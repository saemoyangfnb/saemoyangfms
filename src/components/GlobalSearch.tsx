import React, { useState, useEffect, useRef, useMemo } from 'react';
import { salesDb } from '../firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { Search, X, Building2, Users, Bell, FileText, ChevronRight } from 'lucide-react';

type ResultType = 'store' | 'employee' | 'notice' | 'meeting';

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  section: string;
  brandId: string | null;
}

const TYPE_LABEL: Record<ResultType, string> = {
  store: '매장',
  employee: '직원',
  notice: '공지',
  meeting: '회의록',
};

const TYPE_ICON: Record<ResultType, React.ReactNode> = {
  store:    <Building2 size={13} />,
  employee: <Users size={13} />,
  notice:   <Bell size={13} />,
  meeting:  <FileText size={13} />,
};

const TYPE_COLOR: Record<ResultType, string> = {
  store:    'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
  employee: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
  notice:   'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
  meeting:  'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
};

interface RawStore { name: string; region?: string; ceoName?: string; status?: string }
interface RawEmployee { name: string; position?: string; department?: string }
interface RawNotice { title: string; category?: string }
interface RawMeeting { title: string; date?: string; meetingType?: string }

interface Props {
  onClose: () => void;
  onNavigate: (brandId: string | null, section: string) => void;
}

export function GlobalSearch({ onClose, onNavigate }: Props) {
  const [query_, setQuery_] = useState('');
  const [stores, setStores] = useState<Array<{ id: string } & RawStore>>([]);
  const [employees, setEmployees] = useState<Array<{ id: string } & RawEmployee>>([]);
  const [notices, setNotices] = useState<Array<{ id: string } & RawNotice>>([]);
  const [meetings, setMeetings] = useState<Array<{ id: string } & RawMeeting>>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    Promise.all([
      getDocs(collection(salesDb, 'stores')),
      getDocs(collection(salesDb, 'employees')),
      getDocs(query(collection(salesDb, 'notices'), orderBy('createdAt', 'desc'), limit(200))),
      getDocs(query(collection(salesDb, 'meetings'), orderBy('date', 'desc'), limit(200))),
    ]).then(([sSnap, eSnap, nSnap, mSnap]) => {
      setStores(sSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      setEmployees(eSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      setNotices(nSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      setMeetings(mSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const results = useMemo<SearchResult[]>(() => {
    const q = query_.trim().toLowerCase();
    if (!q || q.length < 1) return [];

    const hits: SearchResult[] = [];

    stores.forEach(s => {
      if (
        s.name?.toLowerCase().includes(q) ||
        s.region?.toLowerCase().includes(q) ||
        s.ceoName?.toLowerCase().includes(q)
      ) {
        hits.push({ id: s.id, type: 'store', title: s.name, subtitle: [s.region, s.status].filter(Boolean).join(' · '), section: 'stores', brandId: null });
      }
    });

    employees.forEach(e => {
      if (e.name?.toLowerCase().includes(q) || e.position?.toLowerCase().includes(q)) {
        hits.push({ id: e.id, type: 'employee', title: e.name, subtitle: [e.position, e.department].filter(Boolean).join(' · '), section: 'employees', brandId: null });
      }
    });

    notices.forEach(n => {
      if (n.title?.toLowerCase().includes(q)) {
        hits.push({ id: n.id, type: 'notice', title: n.title, subtitle: n.category, section: 'notice', brandId: null });
      }
    });

    meetings.forEach(m => {
      if (m.title?.toLowerCase().includes(q) || m.meetingType?.toLowerCase().includes(q)) {
        hits.push({ id: m.id, type: 'meeting', title: m.title, subtitle: m.date, section: 'meetings', brandId: null });
      }
    });

    return hits.slice(0, 30);
  }, [query_, stores, employees, notices, meetings]);

  const grouped = useMemo(() => {
    const map: Partial<Record<ResultType, SearchResult[]>> = {};
    results.forEach(r => {
      if (!map[r.type]) map[r.type] = [];
      map[r.type]!.push(r);
    });
    return map;
  }, [results]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const handleSelect = (result: SearchResult) => {
    onNavigate(result.brandId, result.section);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-16 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 rounded-sm shadow-2xl border border-stone-200 dark:border-stone-700 w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 검색 입력 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
          <Search size={16} className="text-stone-400 shrink-0" />
          <input
            ref={inputRef}
            value={query_}
            onChange={e => setQuery_(e.target.value)}
            onKeyDown={handleKey}
            placeholder="매장, 직원, 공지, 회의록 검색..."
            className="flex-1 text-sm bg-transparent text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none"
          />
          {query_ && (
            <button onClick={() => setQuery_('')} className="text-stone-400 hover:text-stone-700">
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:block text-[10px] font-bold text-stone-400 border border-stone-200 dark:border-stone-700 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* 결과 */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!loaded && (
            <div className="py-10 text-center text-xs font-bold text-stone-400">불러오는 중...</div>
          )}
          {loaded && query_.trim().length === 0 && (
            <div className="py-10 text-center text-xs font-bold text-stone-400">검색어를 입력하세요</div>
          )}
          {loaded && query_.trim().length > 0 && results.length === 0 && (
            <div className="py-10 text-center text-xs font-bold text-stone-400">"{query_}"에 해당하는 결과가 없습니다</div>
          )}
          {(Object.keys(grouped) as ResultType[]).map(type => (
            <div key={type}>
              <div className="px-4 py-2 bg-stone-50 dark:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800">
                <span className={`inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-sm ${TYPE_COLOR[type]}`}>
                  {TYPE_ICON[type]}{TYPE_LABEL[type]}
                </span>
              </div>
              {grouped[type]!.map(result => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 border-b border-stone-100 dark:border-stone-800 last:border-0 transition-colors group"
                >
                  <span className={`shrink-0 p-1.5 rounded-sm ${TYPE_COLOR[type]}`}>{TYPE_ICON[type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">{result.title}</p>
                    {result.subtitle && (
                      <p className="text-[11px] font-bold text-stone-400 truncate">{result.subtitle}</p>
                    )}
                  </div>
                  <ChevronRight size={13} className="text-stone-300 dark:text-stone-600 group-hover:text-stone-500 shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 하단 힌트 */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-stone-100 dark:border-stone-800 flex items-center gap-3">
            <span className="text-[10px] font-bold text-stone-400">{results.length}개 결과</span>
            <span className="text-[10px] text-stone-300 dark:text-stone-600">클릭하면 해당 화면으로 이동합니다</span>
          </div>
        )}
      </div>
    </div>
  );
}
