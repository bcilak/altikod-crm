# Canlıya geçiş kontrol listesi

30 Ekim 2026. Bu liste kodun hazır olduğunu, **ortamın ve kararların** neyi beklediğini toplar. Hiçbir madde bu geliştirme ortamında üretime dağıtım yapılarak doğrulanmadı; dağıtım ürün sahibinin ayrı talimatıyla yapılır (AGENTS.md). Ayrıntılar: `docs/operations.md`, `docs/pilot-messaging.md`, `docs/phase-8-team-messaging.md`, `docs/phase-9-mobile.md`.

## 1. Altyapı ve sırlar

- [ ] Sunucu: Docker Compose, en az 4 GB RAM (ClamAV ~1,5–2 GB), alan adı DNS'i sunucuya yönlü, 80/443 açık.
- [ ] `deploy/compose.production.yml` için sır deposundan: `DOMAIN`, `POSTGRES_PASSWORD`, `MIGRATION_DATABASE_URL`, `APP_DB_USER`/`APP_DB_PASSWORD`, `DATABASE_URL`, SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USER`/`SMTP_PASSWORD`, `MAIL_FROM`), Web Push (`WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` — `npm run push:keys` ile **bir kez** üretin), `BACKUP_KEY`. `.env` dosyası Git'e girmez.
- [ ] API'nin dışarı HTTPS erişimi: SMTP sağlayıcısı ve bildirim servisleri (`web.push.apple.com`, `*.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`). ClamAV imza güncellemesi için `database.clamav.net`.
- [ ] İlk açılış: `docker compose -f deploy/compose.production.yml up -d` → migration + yetki rolü otomatik; ClamAV sağlıklı olana kadar API bekler (ilk imza indirmesi birkaç dakika). `npm run admin:create` ile ilk yönetici.
- [ ] Caddy sertifikası alındı; `https://<alan adı>/api/v1/ready` 200.

## 2. Ortamda doğrulanacaklar (bu geliştirme ortamında yapılamadı)

- [ ] Şifreli yedek + geri yükleme tatbikatı mesaj ekleri ve bilgi bankası dosyalarıyla (`npm run backup:drill`, Docker gerekir). Zamanlanmış yedek ve sunucu dışı kopya kuruldu.
- [ ] ClamAV gerçek imzalarla: EICAR test dosyası yüklemede reddediliyor.
- [ ] Canlı akış Caddy arkasında anında çalışıyor (iki tarayıcıda mesaj gecikmesiz görünüyor; üst çubukta “canlı bağlantı yok” yazmıyor).
- [ ] Davet e-postası gerçek kutuya ulaşıyor (SPF/DKIM/DMARC).
- [ ] **iPhone (iOS 16.4+)**: Safari → Ana Ekrana Ekle → uygulamadan giriş → Bildirimler → bildirimleri aç → izin → **Test bildirimi** kilit ekranında görünüyor; bir birebir mesaj bildirimi geliyor, dokununca konuşma açılıyor; uygulama simgesinde sayı görünüyor; çentik ve alt çubuk içeriği kapatmıyor.
- [ ] **Android (Chrome)**: Uygulamayı yükle → bildirimleri aç → test ve gerçek bildirim; dokununca doğru sayfa.
- [ ] Bilgisayar (Chrome/Edge): bildirim ve tıklama.
- [ ] Bir cihazdan çıkış yapınca o cihaza bildirim gitmiyor; pasifleştirilen kullanıcının cihazlarına gitmiyor.

## 3. Kararlar ve hukuk

- [ ] KVKK aydınlatma metni (taslak: `docs/pilot-messaging.md`) hukuk incelemesinden geçti ve çalışanlara duyuruldu; telefon bildirimlerinin kilit ekranı davranışı (varsayılan içeriksiz) metne eklendi.
- [ ] Mesaj saklama süresi (varsayılan 2 yıl) ve yöneticinin özel yazışmalara erişmemesi kararı hukuken onaylandı. Hukuki talep için dışa aktarım uygulanmadı; gerekiyorsa ayrı iş olarak planlanmalı.
- [ ] Gerçek müşteri verisinin bu ortamda işlenmesi onaylandı (veri işleme değerlendirmesi).

## 4. Kullanıcıya geçiş

- [ ] Kullanıcılar davet edildi; roller ve firma paylaşımları kontrol edildi.
- [ ] Kısa pilot önerilir (`docs/pilot-messaging.md`, 1–2 hafta, 4–6 kişi). Pilot atlanacaksa ürün sahibi bu riski yazılı kabul eder.
- [ ] Ekip duyurusu: iPhone'da “Ana Ekrana Ekle” adımları, bildirimleri açma, iş yazışmasının CRM'e taşınması kuralı.
- [ ] İzleme: `/api/v1/ready`, disk (özel dosyalar ve ClamAV), yedek başarısı, e-posta ve bildirim hataları için alarm.

## 5. Ürün sahibinin canlıya çıkış talimatı

- [ ] Yukarıdaki maddeler tamam ya da riski kabul edildi; dağıtım talimatı verildi (tarih/sorumlu).
