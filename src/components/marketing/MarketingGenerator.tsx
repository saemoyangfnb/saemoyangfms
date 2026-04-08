import React, { useState, useRef } from 'react';
import { useToast } from '../Toast';
import { GoogleGenAI } from '@google/genai';
import { Clock, Image as ImageIcon, Send, Store, Info, LayoutTemplate } from 'lucide-react';
import { db, reviewDb } from '../../firebase';
import { collection, addDoc } from 'firebase/firestore';

export function MarketingGenerator({ activeBrand }: { activeBrand: string | null }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState('기존 매장');
  const [tone, setTone] = useState('① 전문적이고 신뢰감 있는');
  const [openTime, setOpenTime] = useState('11:00');
  const [closeTime, setCloseTime] = useState('21:30');
  const [parkingType, setParkingType] = useState('건물 내 주차');
  const [promoDetails, setPromoDetails] = useState('');

  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  
  const [generatedResults, setGeneratedResults] = useState<{ n_text: string; i_text: string; d_text: string } | null>(null);

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
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(event.target?.result as string);

          ctx.drawImage(img, 0, 0);

          // Apply blur to top 15%
          const blurHeight = Math.floor(img.height * 0.15);
          ctx.filter = 'blur(15px)';
          ctx.drawImage(canvas, 0, 0, img.width, blurHeight, 0, 0, img.width, blurHeight);
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
    // Vite환경과 Vercel 일반 환경변수 모두 호환
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      toast.error('API 키가 설정되지 않았습니다.');
      return;
    }

    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey });

      const promptStr = `당신은 '달빛에 구운 고등어'의 전문 마케터입니다. 매장명: ${storeName}.
      아래 3가지 채널별 원고를 작성하세요.
      1. [NAVER]: 상세 설명과 위치 팩트 포함. 마지막에 [매장 정보 안내] 박스 포함.
      2. [INSTA]: 감성 문구와 해시태그.
      3. [DAANGN]: 지역 주민 타겟 친근한 말투.
      팩트: 영업 ${openTime}~${closeTime}, 주차 ${parkingType}, 이벤트: ${promoDetails}
      매장 유형: ${storeType}, 톤앤매너: ${tone}
      각 구분자는 반드시 [NAVER], [INSTA], [DAANGN] 키워드를 사용하세요.`;

      const contents: Array<any> = [{ text: promptStr }];

      // Process Review Images (apply mosaic)
      for (const file of reviewFiles) {
        const processedUrl = await processImageToDataUrl(file);
        contents.push(convertDataUrlToInlineData(processedUrl));
      }

      // Add Photo files unmodified
      for (const file of photoFiles) {
        const inlineData = await fileToInlineData(file);
        contents.push(inlineData);
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: contents,
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
    } catch (err) {
      console.error(err);
      toast.error('원고 생성 중 오류가 발생했습니다.');
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
        status: '대기중',
        createdAt: new Date().toISOString()
      });
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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
            <Store className="text-blue-500" size={20} /> 기본 정보 입력
          </h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">매장명</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  placeholder="예: 전주본점"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">매장 유형</label>
                <select value={storeType} onChange={e => setStoreType(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option>기존 매장</option>
                  <option>신규 오픈</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">톤앤매너 선택</label>
              <select value={tone} onChange={e => setTone(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-lg focus:ring-2 focus:ring-blue-500">
                <option>① 전문적이고 신뢰감 있는</option>
                <option>② 친근한 이웃 말투</option>
                <option>③ 감성적이고 부드러운</option>
                <option>④ 파이팅 넘치는 홍보형</option>
              </select>
            </div>
            
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-800 dark:text-white mb-3">
                <Info size={16} className="text-emerald-500" /> 상세 팩트 정보
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">오픈 시간</label>
                  <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">마감 시간</label>
                  <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm" />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs text-slate-500 mb-1">주차장 형태</label>
                <select value={parkingType} onChange={e => setParkingType(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm">
                  <option>건물 내 주차</option><option>매장 앞 전용</option><option>기계식/타워형</option><option>공영주차장</option><option>주차 불가</option>
                </select>
              </div>
              <div className="mt-4">
                <label className="block text-xs text-slate-500 mb-1">이벤트/혜택</label>
                <input type="text" placeholder="예: 영수증 리뷰 시 음료 증정" value={promoDetails} onChange={e => setPromoDetails(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
            <ImageIcon className="text-amber-500" size={20} /> 사진 업로드
          </h3>
          <div className="space-y-4">
            <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 relative overflow-hidden group">
              <input type="file" multiple accept="image/*" onChange={handleReviewFilesChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div className="text-center">
                <LayoutTemplate className="mx-auto h-8 w-8 text-slate-400 group-hover:text-blue-500 transition-colors" />
                <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">리뷰 캡처 (모자이크 대상)</p>
                <p className="text-xs text-slate-500 mt-1">{reviewFiles.length > 0 ? `${reviewFiles.length}장 선택됨` : '클릭하여 업로드'}</p>
              </div>
            </div>
            
            <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 relative overflow-hidden group">
              <input type="file" multiple accept="image/*" onChange={handlePhotoFilesChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div className="text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-slate-400 group-hover:text-blue-500 transition-colors" />
                <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">매장/음식 사진 (메인 배치)</p>
                <p className="text-xs text-slate-500 mt-1">{photoFiles.length > 0 ? `${photoFiles.length}장 선택됨` : '클릭하여 업로드'}</p>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={18} />}
            {loading ? "채널별 문구 생성 중..." : "마케팅 문구 생성하기"}
          </button>
        </div>
      </div>

      {/* 결과 영역 */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col">
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">결과 확인 및 시뮬레이션</h3>
        
        {generatedResults ? (
          <div className="space-y-6 flex-1 overflow-auto">
             <div className="bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
               <div className="flex items-center justify-between mb-2">
                 <span className="text-sm font-bold text-green-600">네이버 블로그 원고</span>
               </div>
               <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-sans bg-slate-50 dark:bg-slate-950 p-4 rounded-lg">{generatedResults.n_text}</pre>
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div className="bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                 <div className="flex items-center justify-between mb-2">
                   <span className="text-sm font-bold text-pink-500">인스타그램</span>
                 </div>
                 <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans bg-slate-50 dark:bg-slate-950 p-3 rounded-lg overflow-hidden text-ellipsis">{generatedResults.i_text}</pre>
               </div>
               <div className="bg-white dark:bg-slate-900 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                 <div className="flex items-center justify-between mb-2">
                   <span className="text-sm font-bold text-orange-500">당근마켓(Daangn)</span>
                 </div>
                 <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans bg-slate-50 dark:bg-slate-950 p-3 rounded-lg overflow-hidden text-ellipsis">{generatedResults.d_text}</pre>
               </div>
             </div>

             <button
                onClick={handleSaveToDb}
                className="w-full bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 mt-4"
              >
                <Clock size={16} /> 이 원고들을 스케줄러에 저장
              </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 pb-10">
            <LayoutTemplate size={48} className="mb-4 opacity-50" />
            <p className="text-center font-medium">채널별 자동화를 시작해보세요!</p>
            <p className="text-sm text-center mt-2">입력된 조건과 업로드된 사진을 분석하여<br/>플랫폼별 맞춤형 문구를 자동으로 생성해줍니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
