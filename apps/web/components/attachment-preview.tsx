'use client';
import { useEffect, useRef, useState } from 'react';
import { attachmentUrl, type Attachment } from '../lib/messaging';
import { fileSize } from '../lib/delivery';

export function AttachmentPreview({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState(''); const [text, setText] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const image = ['image/png', 'image/jpeg'].includes(file.mimeType);
  const pdf = file.mimeType === 'application/pdf';
  const plain = ['text/plain', 'text/csv'].includes(file.mimeType);
  useEffect(() => {
    const element = dialog.current!; element.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    if (!image && !pdf && !plain) return;
    void (async () => {
      try {
        const response = await fetch(attachmentUrl(file.id), { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Dosya açılamadı. Oturumunuzu ve dosyaya erişiminizi kontrol edin.');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        if (plain) setText(await blob.slice(0, 200_000).text());
        else { objectUrl = URL.createObjectURL(new Blob([blob], { type: file.mimeType })); setUrl(objectUrl); }
        setLoading(false);
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'Ön izleme yüklenemedi.'); setLoading(false); } }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.id, file.mimeType, image, pdf, plain]);
  return <dialog ref={dialog} className="attachment-preview" aria-label={`${file.name} ön izleme`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="preview-shell">
      <header className="preview-header"><div><strong>{file.name}</strong><small className="block">{fileSize(file.size)}</small></div><button type="button" onClick={onClose} aria-label="Ön izlemeyi kapat">Kapat</button></header>
      <div className="preview-content">
        {error ? <p role="alert">{error}</p> : !image && !pdf && !plain ? <p>Bu dosya türü için ön izleme desteklenmiyor. Dosyayı indirip cihazınızdaki uygulamada açabilirsiniz.</p> : loading ? <p role="status">Ön izleme yükleniyor…</p> : image ? <img src={url} alt={file.name} onError={() => setError('Görsel görüntülenemedi. Dosyayı indirebilirsiniz.')} /> : plain ? <div><pre>{text}</pre>{file.size > 200_000 && <p>İlk 200 KB gösteriliyor. Tamamını görmek için dosyayı indirin.</p>}</div> : <object data={url} type="application/pdf" aria-label="PDF ön izleme"><p>Tarayıcınız PDF ön izlemesini desteklemiyor. Dosyayı indirerek açabilirsiniz.</p></object>}
      </div>
      <footer className="preview-footer">{pdf && <small>PDF görünmüyorsa indirerek açabilirsiniz.</small>}<a className="button" href={attachmentUrl(file.id)} download={file.name}>İndir</a></footer>
    </div>
  </dialog>;
}
