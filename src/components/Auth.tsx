import React, { useState } from 'react';
import { useToast } from './Toast';
import { auth, db } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  sendPasswordResetEmail,
  updatePassword,
  signInWithPopup,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore';
import { User } from '../types';

export const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  
  const [email, setEmail] = useState(localStorage.getItem('rememberedEmail') || '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(!!localStorage.getItem('rememberedEmail'));
  const [autoLogin, setAutoLogin] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const createUserDocument = async (user: any, displayName?: string) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        const isAdminEmail = user.email === 'saemoyang_official@naver.com' || user.email === 'wnsdl9331@gmail.com';
        const newUser: User = {
          uid: user.uid,
          email: user.email || '',
          name: displayName || user.displayName || '사용자',
          role: isAdminEmail ? 'admin' : 'user',
          isApproved: isAdminEmail ? true : false,
          isActive: true,
          createdAt: new Date().toISOString()
        };
        await setDoc(userDocRef, newUser);
        return newUser;
      }
      return userDoc.data() as User;
    } catch (err: any) {
      const message = err.message || String(err);
      if (message.includes('Quota exceeded') || message.includes('resource-exhausted')) {
        setError('Firestore 무료 할당량(Quota)을 모두 소진했습니다. 내일 다시 시도해 주세요.');
      } else {
        setError(message);
      }
      throw err;
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const userDoc = await createUserDocument(result.user);
      await addDoc(collection(db, 'activity_logs'), {
        userId: result.user.uid,
        userName: userDoc.name || result.user.displayName || '사용자',
        action: '로그인',
        details: 'Google 계정 시스템 접속',
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      setError(err.message || '구글 로그인 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isForgotPassword) {
        await sendPasswordResetEmail(auth, email);
        setMessage('비밀번호 재설정 이메일이 발송되었습니다.');
        setIsForgotPassword(false);
      } else if (isLogin) {
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
        
        // Set persistence based on autoLogin preference
        await setPersistence(auth, autoLogin ? browserLocalPersistence : browserSessionPersistence);
        
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          setError('이메일 인증이 필요합니다. 메일함을 확인해주세요.');
          await auth.signOut();
        } else {
          const userDoc = await createUserDocument(userCredential.user);
          await addDoc(collection(db, 'activity_logs'), {
            userId: userCredential.user.uid,
            userName: userDoc.name || '사용자',
            action: '로그인',
            details: '이메일 계정 시스템 접속',
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // Signup
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        
        // Create user document
        await createUserDocument(userCredential.user, name);
        
        setMessage('회원가입이 완료되었습니다. 이메일 인증 후 관리자 승인을 기다려주세요.');
        await auth.signOut();
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message || '인증 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex items-center justify-center p-4 font-sans transition-colors">
      <div className="bg-[#FDFBF7] dark:bg-stone-900 p-8 sm:p-10 rounded-sm shadow-none border-[3px] border-double border-stone-800 dark:border-stone-400 w-full max-w-sm relative">
        
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-stone-900 dark:text-white tracking-tighter mb-3">SAEMOYANG F&B</h1>
          <div className="border-b border-stone-300 dark:border-stone-700 w-16 mx-auto mb-4"></div>
          <p className="text-[11px] font-bold tracking-widest text-stone-500 dark:text-stone-400">
            {isForgotPassword ? '비밀번호 찾기' : isLogin ? '관리자 시스템 로그인' : '새로운 계정 등록'}
          </p>
        </div>
        
        {error && <div className="mb-5 p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-400 text-xs font-bold rounded-sm border border-rose-200 dark:border-rose-800 tracking-wide">{error}</div>}
        {message && <div className="mb-5 p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 text-xs font-bold rounded-sm border border-emerald-200 dark:border-emerald-800 tracking-wide">{message}</div>}

        <div className="space-y-4">
          <button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 py-2.5 rounded-sm hover:bg-stone-50 dark:hover:bg-stone-700 font-bold transition-colors text-sm disabled:opacity-50 shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
            Google로 계속하기
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-200 dark:border-stone-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#FDFBF7] dark:bg-stone-900 px-3 text-[10px] font-bold tracking-widest text-stone-400">또는</span>
            </div>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-stone-500 dark:text-stone-400 mb-1.5">이메일</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-stone-300 dark:border-stone-700 px-3 py-2.5 rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-300 focus:border-stone-900 dark:focus:border-stone-300 transition-all text-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white font-medium"
                placeholder="이메일을 입력하세요"
              />
            </div>
            
            {!isForgotPassword && (
              <div>
                <label className="block text-[10px] font-bold tracking-widest text-stone-500 dark:text-stone-400 mb-1.5 mt-2">비밀번호</label>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-stone-300 dark:border-stone-700 px-3 py-2.5 rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-300 focus:border-stone-900 dark:focus:border-stone-300 transition-all text-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white font-medium"
                  placeholder="비밀번호를 입력하세요"
                />
              </div>
            )}

            {isLogin && !isForgotPassword && (
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded-sm border-stone-300 text-stone-900 focus:ring-stone-900"
                    />
                    <span className="text-[11px] font-bold text-stone-500 group-hover:text-stone-800 transition-colors">아이디 저장</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={autoLogin}
                      onChange={e => setAutoLogin(e.target.checked)}
                      className="w-3.5 h-3.5 rounded-sm border-stone-300 text-stone-900 focus:ring-stone-900"
                    />
                    <span className="text-[11px] font-bold text-stone-500 group-hover:text-stone-800 transition-colors">자동 로그인</span>
                  </label>
                </div>
              </div>
            )}

            {!isLogin && !isForgotPassword && (
              <div>
                <label className="block text-[10px] font-bold tracking-widest text-stone-500 dark:text-stone-400 mb-1.5 mt-2">이름</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full border border-stone-300 dark:border-stone-700 px-3 py-2.5 rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-300 focus:border-stone-900 dark:focus:border-stone-300 transition-all text-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white font-medium"
                  placeholder="이름을 입력하세요"
                />
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-3 rounded-sm hover:bg-stone-800 dark:hover:bg-white font-bold transition-colors mt-6 shadow-sm border border-stone-900 dark:border-stone-100 disabled:opacity-50"
            >
              {loading ? '처리 중...' : isForgotPassword ? '비밀번호 재설정 메일 보내기' : isLogin ? '로그인' : '가입하기'}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center text-xs font-bold text-stone-500 dark:text-stone-400 space-y-3">
          {isForgotPassword ? (
            <button onClick={() => setIsForgotPassword(false)} className="text-stone-900 dark:text-stone-300 hover:underline underline-offset-4">
              로그인으로 돌아가기
            </button>
          ) : (
            <>
              <div>
                <button onClick={() => setIsForgotPassword(true)} className="text-stone-900 dark:text-stone-300 hover:underline underline-offset-4">
                  비밀번호를 잊으셨나요?
                </button>
              </div>
              <div>
                {isLogin ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
                <button onClick={() => setIsLogin(!isLogin)} className="text-stone-900 dark:text-stone-300 font-black hover:underline underline-offset-4 ml-1">
                  {isLogin ? '회원가입' : '로그인'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const ChangePasswordModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    try {
      await updatePassword(auth.currentUser, newPassword);
      toast.success('비밀번호가 변경되었습니다.');
      onClose();
    } catch (err: any) {
      setError(err.message || '비밀번호 변경 실패. (최근 로그인한 상태여야 합니다)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#FDFBF7] dark:bg-stone-900 rounded-sm shadow-2xl w-full max-w-sm overflow-hidden p-6 border-[3px] border-double border-stone-800 dark:border-stone-400">
        <h2 className="text-lg font-black mb-5 text-stone-900 dark:text-white tracking-tight">비밀번호 변경</h2>
        {error && <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-400 text-xs font-bold rounded-sm border border-rose-200 dark:border-rose-800">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold tracking-widest text-stone-500 dark:text-stone-400 mb-1.5 uppercase">새 비밀번호</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full border border-stone-300 dark:border-stone-700 rounded-sm px-3 py-2 text-sm bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-300 font-medium"
              placeholder="새 비밀번호 입력"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-stone-200 dark:border-stone-800 mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-sm transition-colors">취소</button>
            <button type="submit" disabled={loading} className="px-5 py-2.5 text-xs font-bold text-white bg-stone-900 dark:bg-stone-100 dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-white rounded-sm disabled:opacity-50 transition-colors border border-stone-900 dark:border-stone-100">
              변경
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
