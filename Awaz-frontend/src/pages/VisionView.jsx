import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, Clipboard, FileImage, ImagePlus, Languages, ScanText, Upload, Volume2 } from 'lucide-react';
import { LANGUAGES } from '../data/languages';
import { translateText } from '../lib/api';
import { addHistory } from '../lib/storage';
import { useImageOCR } from '../hooks/useImageOCR';
import { useSpeechSynthesis } from '../hooks/useSpeech';
import { useAppSettings } from '../hooks/useAppSettings';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export default function VisionView() {
  const settings = useAppSettings();
  const videoRef = useRef(null);
  const cameraStream = useRef(null);
  const fileRef = useRef(null);
  const previewRef = useRef('');
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('hi-IN');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [extracted, setExtracted] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [translated, setTranslated] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { processImage, isProcessing, progress, status: ocrStatus } = useImageOCR();
  const { speak } = useSpeechSynthesis();

  const setImagePreview = (value) => {
    if (previewRef.current.startsWith('blob:')) URL.revokeObjectURL(previewRef.current);
    previewRef.current = value;
    setPreview(value);
  };

  useEffect(() => () => {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    if (previewRef.current.startsWith('blob:')) URL.revokeObjectURL(previewRef.current);
  }, []);

  const chooseImage = (file) => {
    if (!file) return;
    setError('');
    setNotice('');
    setExtracted('');
    setTranslated('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Images must be 10 MB or smaller.');
      return;
    }
    if (fileRef.current) fileRef.current.value = '';
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      cameraStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch (cameraError) {
      setError(cameraError.name === 'NotAllowedError' ? 'Camera access was blocked. Allow camera access in your browser settings.' : 'Camera is unavailable. Upload an image instead.');
    }
  };

  const stopCamera = () => {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraOn(false);
  };

  const captureCamera = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) chooseImage(new File([blob], 'awaz-camera-capture.jpg', { type: 'image/jpeg' }));
      stopCamera();
    }, 'image/jpeg', 0.92);
  };

  const extractText = async () => {
    if (!image) return;
    setError('');
    setNotice('');
    try {
      const output = await processImage(image, sourceLang);
      setExtracted(output.text);
      setConfidence(output.confidence);
      if (!output.text) setNotice('No readable text was found. Try a sharper photo with better lighting.');
    } catch {
      setError('OCR could not process this image. Try a different file or check your connection for language data.');
    }
  };

  const translateExtracted = async () => {
    if (!extracted.trim()) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const result = await translateText(extracted, sourceLang, targetLang, settings.contextMode);
      setTranslated(result.translatedText);
      const savedLocally = addHistory({ sourceText: extracted, translatedText: result.translatedText, sourceLang, targetLang, engine: result.engine, latencyMs: result.latencyMs });
      if (!savedLocally) setNotice('Translation completed, but browser storage could not save it.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(false);
    }
  };

  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); setNotice('Copied to clipboard.'); }
    catch { setNotice('Clipboard access was blocked by your browser.'); }
  };

  return (
    <div className="workspace-stack horizontal-workspace vision-page">
      <section className="feature-intro surface-card">
        <div className="feature-intro-mark blue-mark"><ScanText size={21} /></div>
        <div><div className="eyebrow accent-eyebrow">ON DEVICE OCR</div><h2>Bring the outside world into focus.</h2><p>Capture or upload an image. Text extraction runs in your browser, then you choose whether to translate the result.</p></div>
        <span className="capability-tag"><FileImage size={14} /> IMAGE → TEXT</span>
      </section>

      <div className="vision-layout">
        <section className="surface-card vision-input-card">
          <div className="vision-controls">
            <label className="field-label">TEXT IN IMAGE<select value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>
              {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}
            </select></label>
            <label className="field-label">TRANSLATE TO<select value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
              {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag} {language.name}</option>)}
            </select></label>
          </div>
          {cameraOn && <div className="camera-preview"><video ref={videoRef} autoPlay playsInline muted aria-label="Camera preview" /><div className="camera-actions"><button className="primary-button" onClick={captureCamera}><Camera size={16} /> Capture photo</button><button className="secondary-button" onClick={stopCamera}><CameraOff size={16} /> Close</button></div></div>}
          {!cameraOn && !preview && <div className="image-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseImage(event.dataTransfer.files[0]); }}>
            <span className="drop-icon"><ImagePlus size={23} /></span><strong>Drop an image here</strong><span>JPG, PNG or WebP · up to 10 MB</span>
            <div className="drop-actions"><button className="primary-button" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose image</button><button className="secondary-button" onClick={startCamera} disabled={!navigator.mediaDevices?.getUserMedia}><Camera size={15} /> Use camera</button></div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => chooseImage(event.target.files?.[0])} />
          </div>}
          {preview && !cameraOn && <div className="image-preview-wrap"><img src={preview} alt="Selected image for OCR" /><div className="image-preview-tools"><span>{image?.name || 'Captured photo'}</span><button className="link-button" onClick={() => { setImage(null); setImagePreview(''); setExtracted(''); setTranslated(''); }}>Remove image</button></div></div>}
          {cameraOn && <div className="camera-guide"><Camera size={15} /> Keep printed text inside the frame. Capture when it looks clear.</div>}
          <button className="primary-button full-button" onClick={extractText} disabled={!image || isProcessing}>{isProcessing ? <><span className="spinner" /> {ocrStatus || 'Preparing OCR'}{ocrStatus === 'Reading text' ? ` · ${progress}%` : ''}</> : <><ScanText size={16} /> Extract text</>}</button>
          {error && <div className="inline-message message-error" role="alert">{error}</div>}
          {notice && <div className="inline-message" role="status">{notice}</div>}
          <p className="micro-disclosure">OCR runs in your browser. The first use of a recognition language may download language data. Your image is not uploaded by AWAZ.</p>
        </section>

        <section className="surface-card vision-result-card">
          <div className="pane-heading"><span>EXTRACTED TEXT</span>{confidence !== null && <span className="confidence-tag">OCR confidence {Math.round(confidence)}%</span>}</div>
          <textarea value={extracted} onChange={(event) => setExtracted(event.target.value)} placeholder="Extracted text will appear here. You can edit it before translating." aria-label="Extracted image text" />
          <div className="vision-actions"><button className="secondary-button" disabled={!extracted} onClick={() => copy(extracted)}><Clipboard size={15} /> Copy text</button><button className="primary-button" disabled={!extracted.trim() || working} onClick={translateExtracted}>{working ? <span className="spinner" /> : <Languages size={15} />}{working ? 'Translating' : 'Translate text'}</button></div>
          {translated && <div className="vision-translation"><div className="pane-heading"><span>TRANSLATION</span><span className="language-caption">{targetLang}</span></div><p>{translated}</p><div className="vision-actions"><button className="secondary-button" onClick={() => copy(translated)}><Clipboard size={15} /> Copy</button><button className="text-icon-button" onClick={() => speak(translated, targetLang)} aria-label="Play translated text"><Volume2 size={16} /></button></div></div>}
          <div className="vision-disclaimer"><Check size={14} /> OCR confidence is the recognizer's estimate of text readability, not translation accuracy.</div>
        </section>
      </div>
    </div>
  );
}
