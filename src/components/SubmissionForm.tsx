import React, { useState } from 'react';
import { Camera, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Robust File Reader with Retries & Initial Delay to bypass Android OS locks & KakaoTalk/In-App browser issues
const readFileAsDataURLWithRetry = (file: File, retries = 3, delayMs = 500): Promise<string> => {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryRead = () => {
      attempt++;
      const reader = new FileReader();
      
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string') {
          resolve(e.target.result);
        } else {
          reject(new Error('이미지 데이터를 읽을 수 없습니다.'));
        }
      };

      reader.onerror = (err) => {
        console.warn(`File read attempt ${attempt} failed:`, reader.error || err);
        if (attempt < retries) {
          setTimeout(tryRead, delayMs);
        } else {
          reject(reader.error || new Error('이미지 파일을 읽을 수 없습니다. (권한 또는 파일 상태 오류)'));
        }
      };

      try {
        reader.readAsDataURL(file);
      } catch (e) {
        console.warn(`File read trigger attempt ${attempt} threw:`, e);
        if (attempt < retries) {
          setTimeout(tryRead, delayMs);
        } else {
          reject(e);
        }
      }
    };

    // 250ms initial delay to let the camera/gallery finish flushing file locks
    setTimeout(tryRead, 250);
  });
};

// Client-side image compression helper returning base64 directly
const compressImageToBase64 = async (file: File): Promise<string> => {
  // Read file into memory immediately and robustly (Once in memory, OS permission revocation can no longer affect us)
  const originalBase64 = await readFileAsDataURLWithRetry(file);

  return new Promise((resolve) => {
    // 3-second timeout fallback to original image
    const timeoutId = setTimeout(() => {
      console.warn("Image compression timed out, falling back to original base64.");
      resolve(originalBase64);
    }, 3000);

    try {
      const img = new Image();
      
      img.onload = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Max dimension 800px for high clarity but extremely lightweight base64
          const MAX_DIM = 800;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(originalBase64);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          
          // Get compressed Base64 directly
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.60);
          resolve(compressedDataUrl);
        } catch (canvasErr) {
          console.error("Canvas compression error:", canvasErr);
          resolve(originalBase64);
        }
      };

      img.onerror = (err) => {
        clearTimeout(timeoutId);
        console.error("Image load fail in compression, using original:", err);
        resolve(originalBase64);
      };

      // Set src from the robustly loaded dataUrl
      img.src = originalBase64;

    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Compression flow error, using original:", err);
      resolve(originalBase64);
    }
  });
};

export default function SubmissionForm({ onAdminAccess }: { onAdminAccess: () => void }) {
  const [senderName, setSenderName] = useState('');
  const [compressedBase64, setCompressedBase64] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.type.startsWith('image/')) {
        setError('이미지 파일만 업로드 가능합니다.');
        return;
      }
      
      setIsCompressing(true);
      setError(null);
      setPreview(null);
      setCompressedBase64(null);

      try {
        const base64 = await compressImageToBase64(selected);
        setCompressedBase64(base64);
        setPreview(base64);
      } catch (err: any) {
        console.error("Image loading/compression failed completely:", err);
        setError(err?.message || '이미지를 불러올 수 없습니다. 카메라 권한 또는 파일 권한을 확인해주세요.');
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compressedBase64 || !senderName.trim()) return;

    setStatus('uploading');
    try {
      // Use the pre-compressed, memory-cached base64 image directly (no permission loss risk)
      const base64Image = compressedBase64;

      // 3. Request Gemini AI analysis from Server (Pure AI endpoint)
      let aiAnalysis = "";
      let groupName = "기타";
      
      try {
        const response = await fetch('/api/organize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderName: senderName.trim(),
            image: base64Image
          })
        });

        if (response.ok) {
          const aiResult = await response.json();
          aiAnalysis = aiResult.analysis || "";
          groupName = aiResult.groupName || "기타";
        } else {
          console.warn("Server AI analysis responded with error status");
        }
      } catch (aiErr) {
        console.warn("AI analysis failed or timed out, performing direct client write as pending fallback", aiErr);
      }

      // 4. Save directly to Firestore from Client SDK (Guaranteed success with deployed rules & Web api key)
      await addDoc(collection(db, 'submissions'), {
        senderName: senderName.trim(),
        photoUrl: base64Image,
        submittedAt: serverTimestamp(),
        status: aiAnalysis ? "organized" : "pending",
        aiAnalysis,
        groupName
      });

      setStatus('success');

    } catch (err: any) {
      console.error("Client transmission failed:", err);
      setError(err?.message || '사진 전송 중 오류가 발생했습니다. 인터넷 연결이나 파일 크기를 확인해주시기 바랍니다.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
        <motion.div 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }} 
          className="mb-4 text-green-500"
        >
          <CheckCircle2 size={64} />
        </motion.div>
        <h2 className="text-2xl font-bold mb-2 text-slate-800">제출 완료!</h2>
        <p className="text-slate-500">사진이 성공적으로 전송되었습니다. 감사합니다.</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-all font-semibold shadow-md"
        >
          추가 제출하기
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 pt-12">
      <div className="mb-10 flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
          <Camera className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">서비스 모니터링</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">PHOTO COLLECT PRO</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 p-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">보내시는 분 성함</label>
            <input
              type="text"
              required
              placeholder="이름을 입력하세요"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-700"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">사진 선택</label>
            
            {/* Guide/Permission Info Notice */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl text-[11px] text-blue-900 leading-relaxed font-sans shadow-sm mb-3">
              <span className="font-bold block text-xs text-blue-800 mb-1">📸 카메라 / 갤러리 접근 안내</span>
              카메라 사용 권한 팝업이 뜨면 <strong className="text-blue-700">'허용'</strong>을 꼭 눌러주세요.<br />
              만약 카메라 촬영이 되지 않거나 기기 오류가 발생할 경우, 권한 승인 후 <strong>갤러리(앨범)</strong>에서 찍어둔 사진을 직접 선택하여 전송하실 수 있습니다.
            </div>

            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="photo-upload"
              />
              <label
                htmlFor="photo-upload"
                className="flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed border-slate-200 rounded-xl overflow-hidden hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer transition-all bg-slate-50"
              >
                {isCompressing ? (
                  <div className="flex flex-col items-center gap-3 text-blue-600 animate-pulse">
                    <Loader2 className="animate-spin text-blue-500" size={24} />
                    <span className="text-sm font-bold">사진 처리 및 최적화 중...</span>
                  </div>
                ) : preview ? (
                  <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
                      <Upload size={20} />
                    </div>
                    <span className="text-sm font-semibold">사진 촬영 또는 업로드</span>
                  </div>
                )}
              </label>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-xs font-medium p-3 bg-red-50 rounded-lg animate-shake">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!compressedBase64 || !senderName || status === 'uploading' || isCompressing}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-200"
          >
            {isCompressing ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>사진 최적화 중...</span>
              </>
            ) : status === 'uploading' ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>전송 중...</span>
              </>
            ) : (
              <>
                <Upload size={20} />
                <span>사진 전송하기</span>
              </>
            )}
          </button>
        </form>
      </div>

      <div className="mt-12 text-center flex flex-col items-center gap-2">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          SYSTEM VERSION 2.0.1 • © 2024 MONITORING TEAM
        </p>
        <button 
          onClick={onAdminAccess}
          className="text-[9px] text-slate-300 hover:text-slate-500 transition-colors uppercase font-mono tracking-tighter cursor-pointer"
        >
          관리자 접속
        </button>
      </div>
    </div>
  );
}
