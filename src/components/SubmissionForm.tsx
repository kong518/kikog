import React, { useState } from 'react';
import { Camera, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Client-side image compression helper with guaranteed resolution
const compressImage = (file: File): Promise<Blob | File> => {
  return new Promise((resolve) => {
    // 3-second timeout fallback
    const timeoutId = setTimeout(() => {
      console.warn("Image compression timed out, falling back to original file.");
      resolve(file);
    }, 3000);

    try {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const img = new Image();
          
          img.onload = () => {
            clearTimeout(timeoutId);
            try {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;

              // Max dimension 800px for instant uploads <= 50KB
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
                resolve(file);
                return;
              }

              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob(
                (blob) => {
                  if (blob) {
                    resolve(blob);
                  } else {
                    resolve(file);
                  }
                },
                'image/jpeg',
                0.60 // High clarity but very lightweight (typically 30-50KB)
              );
            } catch (canvasErr) {
              console.error("Canvas compression error:", canvasErr);
              resolve(file);
            }
          };

          img.onerror = (err) => {
            clearTimeout(timeoutId);
            console.error("Image load fail in compression:", err);
            resolve(file);
          };

          // CRITICAL BUG FIX: Set src AFTER onload / onerror to prevent cache race conditions on mobile browsers (like KakaoTalk/iOS Safari)
          img.src = event.target?.result as string;

        } catch (readerErr) {
          clearTimeout(timeoutId);
          console.error("Reader onload fail:", readerErr);
          resolve(file);
        }
      };

      reader.onerror = (err) => {
        clearTimeout(timeoutId);
        console.error("FileReader error in compression:", err);
        resolve(file);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("FileReader initiation error:", err);
      resolve(file);
    }
  });
};

export default function SubmissionForm({ onAdminAccess }: { onAdminAccess: () => void }) {
  const [senderName, setSenderName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.type.startsWith('image/')) {
        setError('이미지 파일만 업로드 가능합니다.');
        return;
      }
      setFile(selected);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selected);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !senderName.trim()) return;

    setStatus('uploading');
    try {
      // 1. Client-Side Image Compression
      let uploadData: Blob | File = file;
      try {
        uploadData = await compressImage(file);
      } catch (compressErr) {
        console.warn("Image compression failed, using original file", compressErr);
      }

      // 2. Convert compressed Blob/File to base64 string
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('파일 읽기 오류가 발생했습니다.'));
          }
        };
        reader.onerror = () => reject(reader.error);
      });
      reader.readAsDataURL(uploadData);
      const base64Image = await base64Promise;

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

      {/* AI Studio Iframe Warning and Share Tool */}
      {window.self !== window.top && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed font-sans shadow-sm">
          <span className="font-bold block text-sm text-amber-800 mb-1">📢 공유 주소 설정 안내</span>
          친구분들이 오류 없이 접근하여 사진을 보낼 수 있게 하려면, 주소창의 AI Studio 주소(aistudio.google.com)가 아닌 아래의 <strong className="text-amber-700">전용 공유 링크</strong>를 전달해야 합니다.<br />
          <button 
            type="button"
            onClick={() => {
              const rawUrl = window.location.origin;
              const cleanUrl = rawUrl.includes("-dev-") ? rawUrl.replace("-dev-", "-pre-") : rawUrl;
              const isTestUrl = cleanUrl.includes("-dev-") || cleanUrl.includes("-pre-");
              const copySuccess = () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
                if (isTestUrl) {
                  alert(
                    "⚠️ [주의] 이 주소는 구글 계정 보안(IAP) 제약이 걸린 '개발 단계용 임시 주소'입니다.\n\n" +
                    "다른 사람들이 구글 로그인 없이 실시간 사진을 전송하게 하려면,\n" +
                    "AI Studio 프로그램 우측 상단 의 [Share](공유) 또는 [Deploy to Cloud Run](배포)을 완료한 후 발급받은 정식 웹 주소를 친구들에게 전달해주십시오."
                  );
                }
              };
              
              if (navigator.clipboard) {
                navigator.clipboard.writeText(cleanUrl)
                  .then(() => {
                    copySuccess();
                  })
                  .catch(() => {
                    // Fallback
                    const textArea = document.createElement("textarea");
                    textArea.value = cleanUrl;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                      document.execCommand('copy');
                      copySuccess();
                    } catch (err) {
                      setError("복사가 불가능한 브라우저입니다. 직접 주소를 복사해주세요: " + cleanUrl);
                    }
                    document.body.removeChild(textArea);
                  });
              } else {
                const textArea = document.createElement("textarea");
                textArea.value = cleanUrl;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                  document.execCommand('copy');
                  copySuccess();
                } catch (err) {
                  setError("복사가 불가능한 브라우저입니다. 직접 주소를 복사해주세요: " + cleanUrl);
                }
                document.body.removeChild(textArea);
              }
            }}
            className="mt-3 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer max-w-max"
          >
            📋 전용 공유 링크 복사하기
          </button>

          <AnimatePresence>
            {copied && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 p-2 rounded-lg font-semibold flex items-center gap-1 shadow-sm"
              >
                ✓ 복사가 완료되었습니다! 카카오톡이나 문자 메시지로 이 주소를 전달하여 전송하게 하세요.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

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
                {preview ? (
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
            disabled={!file || !senderName || status === 'uploading'}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-200"
          >
            {status === 'uploading' ? (
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
