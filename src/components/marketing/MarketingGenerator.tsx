import React, { useState, useRef, useEffect } from 'react';
import { useToast } from '../Toast';
import { GoogleGenAI } from '@google/genai';
import { Clock, Image as ImageIcon, Send, Store, Info, LayoutTemplate, Sparkles, Edit2, Download } from 'lucide-react';
import { reviewDb, db as mainDb, auth } from '../../firebase';
import { collection, addDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

export function MarketingGenerator({ activeBrand }: { activeBrand: string | null }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState('기존 매장');
  const [targetPersona, setTargetPersona] = useState('가족 모임 (3050)');
  const [tone, setTone] = useState('전문적/신뢰감');
  const [openTime, setOpenTime] = useState('11:00');
  const [closeTime, setCloseTime] = useState('21:30');
  const [parkingType, setParkingType] = useState('건물 내 주차');
  const [promoDetails, setPromoDetails] = useState('');

  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  
  const [generatedResults, setGeneratedResults] = useState<{ n_text: string; i_text: string; d_text: string } | null>(null);
  const [collageUrl, setCollageUrl] = useState<string | null>(null);

  // ✅ 크롤링 데이터 연동용 상태
  const [roiData, setRoiData] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);

  // 💡 시스템 활동 로그 기록 센서
  const logActivity = async (action: string, details: string) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(mainDb, 'activity_logs'), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || auth.currentUser.email || '관리자',
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (e) { console.error('Failed to log activity', e); }
  };

  useEffect(() => {
    // roi_analysis: 실시간 불필요 — 1회 조회
    getDocs(collection(reviewDb, 'roi_analysis')).then(snap => {
      setRoiData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => {});

    // reviews: 전체 구독 → 최근 60일 + 최대 500건으로 제한
    const date60 = new Date();
    date60.setDate(date60.getDate() - 60);
    const date60Str = date60.toISOString().split('T')[0];
    getDocs(
      query(collection(reviewDb, 'reviews'), where('작성일', '>=', date60Str), limit(500))
    ).then(snap => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => {});
  }, []);

  const allStores = Array.from(new Set([...roiData.map(r => r.매장명), ...reviews.map(r => r.매장명)])).sort() as string[];

  // ✅ 리뷰 콜라주(겹침+모자이크) 자동 생성 로직
  useEffect(() => {
    if (reviewFiles.length === 0) {
      setCollageUrl(null);
      return;
    }

    const generateCollage = async () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imgs = await Promise.all(reviewFiles.map(file => {
        return new Promise<HTMLImageElement>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = e.target?.result as string;
          }
          reader.readAsDataURL(file);
        });
      }));

      const CANVAS_SIZE = 1080; // 1:1 정사각형 캔버스 (인스타 피드 최적화)
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;

      ctx.fillStyle = '#f8fafc'; // 깔끔한 배경
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const N = imgs.length;
      // 사진 개수에 따라 유동적으로 그리드(행/열) 수 계산
      const cols = Math.ceil(Math.sqrt(N));
      const rows = Math.ceil(N / cols);

      const cellW = CANVAS_SIZE / cols;
      const cellH = CANVAS_SIZE / rows;

      // 러프한 겹침(스크랩북) 스타일로 렌더링
      for (let i = 0; i < N; i++) {
        const img = imgs[i];

        // 1. 임시 캔버스에 이미지 + 닉네임 모자이크 처리
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tCtx = tempCanvas.getContext('2d');
        if (!tCtx) continue;

        tCtx.drawImage(img, 0, 0);
        const blurHeight = Math.floor(img.height * 0.15);
        tCtx.filter = 'blur(15px)';
        tCtx.drawImage(tempCanvas, 0, 0, img.width, blurHeight, 0, 0, img.width, blurHeight);
        tCtx.filter = 'none';

        // 2. 그리드 위치 계산 및 러프한 변형(오프셋, 회전)
        const col = i % cols;
        const row = Math.floor(i / cols);
        const isSingle = N === 1;

        // 약간의 랜덤 오프셋 적용
        const offsetX = isSingle ? 0 : (Math.random() - 0.5) * (cellW * 0.3);
        const offsetY = isSingle ? 0 : (Math.random() - 0.5) * (cellH * 0.3);
        const centerX = col * cellW + cellW / 2 + offsetX;
        const centerY = row * cellH + cellH / 2 + offsetY;

        // 그리드 셀보다 40% 크게 만들어 겹치게 설정
        const targetW = isSingle ? CANVAS_SIZE * 0.8 : cellW * 1.4;
        const scale = targetW / tempCanvas.width;
        const targetH = tempCanvas.height * scale;

        // 랜덤 회전 (-8도 ~ 8도)
        const angle = isSingle ? 0 : (Math.random() - 0.5) * 16 * Math.PI / 180;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);

        // 폴라로이드 사진처럼 입체적인 그림자
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 25;
        ctx.shadowOffsetY = 15;

        // 캔버스에 그리기
        ctx.drawImage(tempCanvas, -targetW / 2, -targetH / 2, targetW, targetH);
        ctx.restore();
      }

      setCollageUrl(canvas.toDataURL('image/jpeg', 0.8)); // DB 용량 최적화를 위해 압축률 0.8 적용
    };

    generateCollage();
  }, [reviewFiles]);

  // Handle Review Files (with Canvas Blur)
  const handleReviewFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setReviewFiles(files);
      toast.success(`${files.length}장의 리뷰 캡처가 업로드되었습니다. 생성 시 닉네임 자동 모자이크가 적용됩니다.`);
    }
  };

  const handlePhotoFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotoFiles(Array.from(e.target.files));
      toast.success(`${e.target.files.length}장의 메인 사진이 업로드되었습니다.`);
    }
  };

  // Process Images (Blur top 15%) for Gemini
  const processImageToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // [Cost-Down] Resize to thumbnail (800x800) before sending
          const MAX_DIM = 800;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_DIM) {
              height *= MAX_DIM / width;
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width *= MAX_DIM / height;
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(event.target?.result as string);

          ctx.drawImage(img, 0, 0, width, height);

          // Apply blur to top 15% (scaled to new dimensions)
          const blurHeight = Math.floor(height * 0.15);
          ctx.filter = 'blur(15px)';
          ctx.drawImage(canvas, 0, 0, width, blurHeight, 0, 0, width, blurHeight);
          ctx.filter = 'none'; // reset

          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Convert Base64 Data URL to InlineData for Gemini API
  const convertDataUrlToInlineData = (dataUrl: string) => {
    const [, base64Data] = dataUrl.split(',');
    return {
      inlineData: {
        data: base64Data,
        mimeType: 'image/jpeg'
      }
    };
  };

  const fileToInlineData = async (file: File) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const [, base64Data] = dataUrl.split(',');
        resolve({
          inlineData: {
            data: base64Data,
            mimeType: file.type
          }
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!storeName) {
      toast.error('매장명을 입력해주세요!');
      return;
    }
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      toast.error('API 키가 설정되지 않았습니다. Vercel 환경변수에 VITE_GEMINI_API_KEY를 등록해주세요.');
      return;
    }
    
    // ✅ AI 연동용 매장 크롤링 데이터 추출
    const storeRoi = roiData.find(r => r.매장명 === storeName);
    const storeReviews = reviews.filter(r => r.매장명 === storeName);
    
    let targetKeywords = storeRoi && storeRoi.세팅된_키워드 !== '키워드 미설정' ? storeRoi.세팅된_키워드 : '';
    const companions: Record<string, number> = {};
    const reactions: Record<string, number> = {};
    let topReactionNaver = '';
    
    storeReviews.forEach(r => {
      if (r.동반자) r.동반자.split(',').forEach((c: string) => { const t = c.trim(); if(t) companions[t] = (companions[t] || 0) + 1; });
      if (r.고객반응_포인트) r.고객반응_포인트.split(',').forEach((p: string) => { const t = p.trim(); if (t && t.toLowerCase() !== 'num' && isNaN(Number(t))) reactions[t] = (reactions[t] || 0) + 1; });
      if (r.매장_TOP인기반응 && !topReactionNaver) topReactionNaver = r.매장_TOP인기반응;
    });
    
    const topCompanions = Object.entries(companions).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]).join(', ');
    const topReactions = Object.entries(reactions).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => `#${e[0]}`).join(' ');
    
    let aiContext = '';
    if (targetKeywords || topCompanions || topReactions) {
      aiContext = `\n\n[💡 크롤링 기반 매장 실제 데이터 (원고 작성 시 소구점으로 자연스럽게 녹여낼 것)]\n`;
      if (targetKeywords) aiContext += `- 타겟 키워드: ${targetKeywords} (해시태그 및 본문에 활용)\n`;
      if (topCompanions) aiContext += `- 주 방문 타겟층: ${topCompanions} (해당 타겟층의 공감을 이끌어내는 멘트 작성)\n`;
      if (topReactions) aiContext += `- 고객 찐 반응 포인트: ${topReactions} (실제 방문객들이 극찬하는 매력 포인트 강조)\n`;
      if (topReactionNaver && topReactionNaver !== '없음') aiContext += `- 네이버 통계: ${topReactionNaver}\n`;
    }

    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey });

      const promptStr = `당신은 F&B 프랜차이즈 전문 마케터입니다.

[매장 정보]
매장명: ${storeName} / 유형: ${storeType} / 타겟 고객층: ${targetPersona} / 글쓰기 톤: ${tone}
영업시간: ${openTime}~${closeTime} / 주차: ${parkingType} / 이벤트: ${promoDetails}${aiContext}

[이미지 분석 — 원고 작성 전 반드시 수행]
첨부 이미지를 먼저 분석하라:
1. 고객 리뷰 이미지: 반복 등장하는 긍정 키워드, 고객이 강조한 메뉴·경험 요소 추출
2. 매장/음식 이미지: 색감·플레이팅·인테리어 스타일·시그니처 비주얼 요소 파악
분석 결과를 원고에 구체적 묘사로 직접 반영하라. 이미지에서 확인되지 않은 내용은 추측 금지.

[출력 형식]

[NAVER]
최소 1,200자 이상. 구성: ①방문 도입부 → ②메뉴/분위기 상세(이미지 묘사 포함) → ③고객 반응 인용 → ④아래 정보 박스.
※ 중요: 글의 흐름에 맞춰 문단 사이사이에 반드시 "[📸 이곳에 매장 외부/내부 사진 삽입]", "[📸 이곳에 메인 음식 사진 삽입]", "[📸 이곳에 리뷰 콜라주 이미지 삽입]" 등 정확한 사진 첨부 가이드를 3~5회 이상 배치할 것.
---
[매장 정보 안내]
매장명: ${storeName}
영업시간: ${openTime}~${closeTime}
주차: ${parkingType}
이벤트: ${promoDetails}
---

[INSTA]
<💡 썸네일 가이드: 1번째 사진으로 '리뷰 콜라주 이미지'를, 2번째부터 '매장/음식 사진'을 순서대로 올려주세요.>

본문 150~300자 + 해시태그 20개 이상. 감성 도입 → 핵심 매력 → 방문 유도 → 해시태그(브랜드/지역/메뉴/감성 혼합).

[DAANGN]
<💡 사진 가이드: 다운받은 '리뷰 콜라주 이미지'와 가장 먹음직스러운 '메뉴 사진'을 함께 첨부해 주세요.>

200~400자. 지역 주민 공감대 → 매장 핵심 매력 1~2가지 → 방문 유도. 지역명 반드시 포함. 친근한 구어체.

[주의] 과장 표현 금지. 구분자 [NAVER], [INSTA], [DAANGN] 필수.`;

      const parts: Array<any> = [{ text: promptStr }];

      // Process Review Images (apply mosaic)
      for (const file of reviewFiles) {
        const processedUrl = await processImageToDataUrl(file);
        parts.push(convertDataUrlToInlineData(processedUrl));
      }

      // [Cost-Down] Add Photo files with 800px resize
      for (const file of photoFiles) {
        const imgUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let w = img.width; let h = img.height;
              const max = 800;
              if (w > h) { if (w > max) { h *= max / w; w = max; } }
              else { if (h > max) { w *= max / h; h = max; } }
              canvas.width = w; canvas.height = h;
              canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
        parts.push(convertDataUrlToInlineData(imgUrl));
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: [{ role: 'user', parts }],
      });

      const fullText = response.text || '';

      const n_text = fullText.includes("[NAVER]") && fullText.includes("[INSTA]") ? fullText.split("[NAVER]")[1].split("[INSTA]")[0].trim() : "생성 실패";
      let i_text = "생성 실패";
      let d_text = "생성 실패";
      
      if (fullText.includes("[INSTA]") && fullText.includes("[DAANGN]")) {
        i_text = fullText.split("[INSTA]")[1].split("[DAANGN]")[0].trim();
        d_text = fullText.split("[DAANGN]")[1].trim();
      }

      setGeneratedResults({ n_text, i_text, d_text });
      toast.success('마케팅 원고 생성이 완료되었습니다.');
    } catch (err: any) {
      console.error(err);
      toast.error(`원고 생성 오류: ${err?.message || '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDb = async () => {
    if (!generatedResults) return;
    try {
      await addDoc(collection(reviewDb, 'marketing_schedules'), {
        brandId: activeBrand,
        storeName,
        naverText: generatedResults.n_text,
        instaText: generatedResults.i_text,
        daangnText: generatedResults.d_text,
        collageUrl: collageUrl || null,
        status: '대기중',
        createdAt: new Date().toISOString()
      });
      await logActivity('마케팅 원고 생성', `[${storeName}] AI 마케팅 원고 스케줄러 등록`);
      toast.success('스케줄러에 저장되었습니다!');
    } catch (err) {
      console.error(err);
      toast.error('스케줄 저장 실패');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 폼 영역 */}
      <div className="space-y-6">
        <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-700 p-6">
          <h3 className="text-lg font-black text-stone-900 dark:text-white flex items-center gap-2 mb-4 tracking-tight border-b-2 border-stone-800 dark:border-stone-400 pb-3">
            기본 정보 입력 <span className="text-[10px] font-bold text-stone-400 tracking-widest ml-2">매장 정보</span>
          </h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-stone-500 dark:text-stone-400 mb-1.5 tracking-widest">매장명</label>
                {allStores.length > 0 ? (
                  <select
                    value={storeName}
                    onChange={e => setStoreName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-sm focus:outline-none focus:border-stone-800 text-sm font-semibold text-stone-800"
                  >
                    <option value="">매장을 선택하세요</option>
                    {allStores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="예: 전주본점" className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-sm focus:outline-none focus:border-stone-800 text-sm font-semibold" />
                )}
                
                {storeName && (roiData.some(r => r.매장명 === storeName) || reviews.some(r => r.매장명 === storeName)) && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
                    <Sparkles size={12} /> 크롤링 데이터가 AI 프롬프트에 연동됩니다.
                  </p>
                )}
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-stone-500 dark:text-stone-400 mb-1.5 tracking-widest">매장 유형</label>
                <select value={storeType} onChange={e => setStoreType(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded-sm focus:outline-none focus:border-stone-800 text-sm font-semibold text-stone-800">
                  <option>기존 매장</option>
                  <option>신규 오픈</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-500 dark:text-stone-400 mb-2 tracking-widest">타겟 고객층 (페르소나)</label>
                <div className="flex flex-wrap gap-1.5">
                  {['가족 모임 (3050)', '데이트 (2030)', '직장인/회식', '혼밥/일상', '타겟 제한 없음'].map(p => (
                    <button key={p} onClick={() => setTargetPersona(p)} className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${targetPersona === p ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-500 dark:text-stone-400 mb-2 tracking-widest">글쓰기 톤앤매너</label>
                <div className="flex flex-wrap gap-1.5">
                  {['전문적/신뢰감', '친근한 이웃', '감성적/부드러움', '유쾌/파이팅'].map(t => (
                    <button key={t} onClick={() => setTone(t)} className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${tone === t ? 'bg-purple-50 border-purple-500 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="pt-4 mt-2 border-t border-stone-300 dark:border-stone-800">
              <h4 className="text-sm font-bold flex items-center gap-2 text-stone-800 dark:text-white mb-3">
                상세 팩트 정보
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold tracking-widest text-stone-500 mb-1">오픈 시간</label>
                  <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold tracking-widest text-stone-500 mb-1">마감 시간</label>
                  <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm text-sm font-medium" />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-[10px] font-bold tracking-widest text-stone-500 mb-1">주차장 형태</label>
                <select value={parkingType} onChange={e => setParkingType(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm text-sm font-medium">
                  <option>건물 내 주차</option><option>매장 앞 전용</option><option>기계식/타워형</option><option>공영주차장</option><option>주차 불가</option>
                </select>
              </div>
              <div className="mt-4">
                <label className="block text-[10px] font-bold tracking-widest text-stone-500 mb-1">이벤트/혜택</label>
                <input type="text" placeholder="예: 영수증 리뷰 시 음료 증정" value={promoDetails} onChange={e => setPromoDetails(e.target.value)} className="w-full px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-sm text-sm font-medium" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm border border-stone-300 dark:border-stone-700 p-6">
          <h3 className="text-lg font-black text-stone-900 dark:text-white flex items-center gap-2 mb-4 tracking-tight border-b-2 border-stone-800 dark:border-stone-400 pb-3">
            사진 업로드 <span className="text-[10px] font-bold text-stone-400 tracking-widest ml-2">사진 첨부</span>
          </h3>
          <div className="space-y-6">
            
            <div className="space-y-3">
              <div className="p-6 border-2 border-dashed border-stone-400 dark:border-stone-600 rounded-sm bg-stone-100 dark:bg-stone-800/50 relative overflow-hidden group hover:bg-stone-200 transition-colors">
                <input type="file" multiple accept="image/*" onChange={handleReviewFilesChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="text-center">
                  <LayoutTemplate className="mx-auto h-8 w-8 text-stone-400 group-hover:text-stone-600 transition-colors" />
                  <p className="mt-3 text-sm font-black text-stone-800 dark:text-stone-200 tracking-tight">1. 고객 리뷰 캡처 (필수)</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 font-medium">리뷰 2장 이상 첨부 시, 닉네임이 모자이크된 인스타용 겹침 콜라주를 자동 생성합니다.</p>
                  <p className="text-xs text-stone-700 font-bold mt-3 bg-stone-300 dark:bg-stone-700 inline-block px-3 py-1 rounded-sm">{reviewFiles.length > 0 ? `${reviewFiles.length}장 선택됨` : '여기를 클릭하여 리뷰 사진 업로드'}</p>
                </div>
              </div>
              
              {collageUrl && (
                <div className="relative group/collage rounded-xl overflow-hidden border border-indigo-200 dark:border-indigo-800 shadow-sm bg-indigo-50/50 dark:bg-indigo-900/10 flex flex-col items-center p-4">
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-3 text-left w-full flex items-center gap-1.5"><Sparkles size={14}/> 자동 생성된 리뷰 콜라주 이미지 (스케줄러 저장 시 함께 저장됨)</p>
                  <div className="w-full max-h-64 overflow-y-auto rounded border border-indigo-100 dark:border-indigo-800/50 shadow-inner">
                    <img src={collageUrl} alt="콜라주 미리보기" className="w-full" />
                  </div>
                  <a href={collageUrl} download="review_collage.jpg" className="mt-4 w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md flex items-center justify-center gap-2 transition-colors">
                     <Download size={16} /> 콜라주 썸네일 이미지 다운로드
                  </a>
                </div>
              )}
            </div>
            
            <div className="p-6 border-2 border-dashed border-stone-400 dark:border-stone-600 rounded-sm bg-stone-100 dark:bg-stone-800/50 relative overflow-hidden group hover:bg-stone-200 transition-colors">
              <input type="file" multiple accept="image/*" onChange={handlePhotoFilesChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div className="text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-stone-400 group-hover:text-stone-600 transition-colors" />
                <p className="mt-3 text-sm font-black text-stone-800 dark:text-stone-200 tracking-tight">2. 매장/메뉴 실제 사진 (선택)</p>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 font-medium">AI가 이 사진들을 보고 음식의 색감, 플레이팅, 분위기를 글에 생생하게 묘사합니다.</p>
                <p className="text-xs text-stone-700 font-bold mt-3 bg-stone-300 dark:bg-stone-700 inline-block px-3 py-1 rounded-sm">{photoFiles.length > 0 ? `${photoFiles.length}장 선택됨` : '여기를 클릭하여 매장/메뉴 사진 업로드'}</p>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full mt-6 bg-stone-900 hover:bg-stone-800 text-white font-bold py-3.5 px-4 rounded-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 border border-stone-800"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={18} />}
            {loading ? "채널별 문구 생성 중..." : "마케팅 문구 생성하기"}
          </button>
        </div>
      </div>

      {/* 결과 영역 */}
      <div className="bg-stone-100 dark:bg-stone-800/50 rounded-sm border border-stone-300 dark:border-stone-800 p-6 flex flex-col shadow-sm">
        <h3 className="text-lg font-black text-stone-900 dark:text-white flex items-center gap-2 mb-4 border-b-2 border-stone-800 dark:border-stone-400 pb-3 tracking-tight">
          결과 확인 및 시뮬레이션 <span className="text-[10px] font-bold text-stone-400 tracking-widest ml-2">미리보기</span>
          <span className="ml-auto text-[10px] font-bold bg-white text-stone-600 dark:bg-stone-900 dark:text-stone-400 px-2 py-0.5 rounded-sm border border-stone-300 dark:border-stone-700 flex items-center gap-1">
            <Edit2 size={10} /> 직접 수정 가능
          </span>
        </h3>
        
        {generatedResults ? (
          <div className="space-y-6 flex-1 overflow-auto">
             <div className="bg-white dark:bg-stone-900 rounded-sm p-4 shadow-sm border border-stone-300 dark:border-stone-700">
               <div className="flex items-center justify-between mb-3 border-b border-stone-200 dark:border-stone-800 pb-2">
                 <span className="text-sm font-black text-stone-900 tracking-tight">네이버 블로그</span>
               </div>
               <textarea value={generatedResults.n_text} onChange={e => setGeneratedResults({ ...generatedResults, n_text: e.target.value })} className="w-full min-h-[300px] resize-y whitespace-pre-wrap text-sm text-stone-800 dark:text-stone-300 leading-relaxed font-serif bg-stone-50 dark:bg-stone-950 p-4 rounded-sm border border-transparent focus:border-stone-400 focus:ring-1 focus:ring-stone-400 focus:outline-none transition-all" />
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div className="bg-white dark:bg-stone-900 rounded-sm p-4 shadow-sm border border-stone-300 dark:border-stone-700">
                 <div className="flex items-center justify-between mb-3 border-b border-stone-200 dark:border-stone-800 pb-2">
                   <span className="text-sm font-black text-stone-900 tracking-tight">인스타그램</span>
                 </div>
                 <textarea value={generatedResults.i_text} onChange={e => setGeneratedResults({ ...generatedResults, i_text: e.target.value })} className="w-full min-h-[200px] resize-y whitespace-pre-wrap text-xs text-stone-800 dark:text-stone-300 leading-relaxed font-serif bg-stone-50 dark:bg-stone-950 p-3 rounded-sm border border-transparent focus:border-stone-400 focus:ring-1 focus:ring-stone-400 focus:outline-none transition-all" />
               </div>
               <div className="bg-white dark:bg-stone-900 rounded-sm p-4 shadow-sm border border-stone-300 dark:border-stone-700">
                 <div className="flex items-center justify-between mb-3 border-b border-stone-200 dark:border-stone-800 pb-2">
                   <span className="text-sm font-black text-stone-900 tracking-tight">당근마켓</span>
                 </div>
                 <textarea value={generatedResults.d_text} onChange={e => setGeneratedResults({ ...generatedResults, d_text: e.target.value })} className="w-full min-h-[200px] resize-y whitespace-pre-wrap text-xs text-stone-800 dark:text-stone-300 leading-relaxed font-serif bg-stone-50 dark:bg-stone-950 p-3 rounded-sm border border-transparent focus:border-stone-400 focus:ring-1 focus:ring-stone-400 focus:outline-none transition-all" />
               </div>
             </div>

             <button
                onClick={handleSaveToDb}
                className="w-full bg-stone-800 hover:bg-stone-900 text-white font-bold py-3.5 px-4 rounded-sm shadow-md transition-all flex items-center justify-center gap-2 mt-4 border border-stone-900"
              >
                <Clock size={16} /> 이 원고들을 스케줄러에 저장
              </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-stone-400 dark:text-stone-600 pb-10">
            <LayoutTemplate size={48} className="mb-4 opacity-50" />
            <p className="text-center font-bold text-stone-600">채널별 원고 자동화를 시작해보세요!</p>
            <p className="text-sm text-center mt-2 font-medium">입력된 팩트 정보와 업로드된 사진을 분석하여<br/>플랫폼별 맞춤형 문구를 자동으로 생성합니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
