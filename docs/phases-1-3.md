# Faz 1–3 teslimat ve işletim notları

Tarih: 30 Ekim 2026. Kapsam, netleştirilmiş yol haritasına göredir: Faz 3 fırsatlar; teklif sistemi Faz 4'tedir.

## Uygulanan özellikler

- Faz 1: Argon2id parolalar; 8 saatlik DB oturumu; HttpOnly/SameSite cookie; production Secure/HTTPS; Origin + CSRF; DB rate limit; logout/hesap pasifleştirmede iptal; canlı rol kontrolü; davet/sıfırlama; ilk admin komutu.
- Firma/kişi oluşturma, arama, sayfalama, düzenleme, arşiv; görünür kayıtlar üzerinde mükerrer uyarısı; sahiplik ve READ/WRITE paylaşımı; yönetici sorumlu değişikliği.
- Faz 2: manuel kaynaklı faaliyetler, firma zaman çizelgesi, toplantılar/katılımcılar, görev atama/durum/hedef tarih/hatırlatma, günlük görev listesi ve aylık ajanda; UTC/İstanbul dönüşümü.
- Outbox, retry/backoff, unique dedupe, sistem içi bildirim ve okundu işlemi. Teknik görev erişimi firma ticari geçmişini açmaz.
- Faz 3: fırsat listesi/Kanban, sürükleme ve klavye kullanılabilir aşama seçici, filtreler, sorumlu, decimal tutar, para birimi, sonraki aksiyon ve gecikme filtresi; transaction içinde aşama+tarihçe; optimistic locking.
- LOST için gerekçe, WON için bu fazda yalnız yönetici manuel kazanım gerekçesi. Kapanmış fırsatı yeniden açma yalnız yönetici ve yeni aksiyonla yapılır.
- Redaksiyonlu audit ve ADMIN denetim ekranı. Audit'te parolalar, tokenlar ve serbest müşteri notları tutulmaz.

## İşletim

1. `npm ci`, `npm run setup`, `npm run admin:create`, `npm run dev`.
2. Yerel web origin'i `http://localhost:3000`; farklı host/port kullanılacaksa APP_ORIGIN ve web/API proxy birlikte ayarlanmalı.
3. Davet/sıfırlama `.local-mail` dosyalarındaki URL üzerinden denenir; servis gerçek e-posta sağlayıcısına bağlı değildir. Bu klasör ve veritabanı erişimi işletim sistemi izinleriyle korunmalı.
4. Outbox durumu DB'deki `OutboxEvent` üzerinden izlenir. FAILED olayın sebebi giderildikten sonra aynı satır `status=PENDING`, `attempts=0`, `runAt=now()` olarak yeniden kuyruğa alınabilir. Dedupe anahtarı değiştirilmemeli. Bu işletim aksiyonu için yönetim arayüzü sonraki fazdadır.
5. Yerelde IP bazlı rate limit var; reverse proxy güven sınırı ve proxy IP ayarları canlıya hazırlık fazında dağıtım topolojisiyle birlikte doğrulanmalı. X-Forwarded-For körlemesine güvenilir kabul edilmez.

## Test düzeni

Smoke testleri mock DB ile hata formatını, sağlık uçlarını, OpenAPI sözleşmesini ve PATCH varsayılanlarının gönderilmeyen alanları değiştirmediğini doğrular.

Entegrasyon testleri her çalışmada ayrı `saleshub_test_<random>` DB oluşturur. Test verileri DEMO veya `example.invalid` alan adlarıdır. Bu DB sonunda kaldırılır; uygulama DB'sine test kullanıcıları yazılmaz.

Test senaryoları: özel kayda direkt/list/search/nested erişim, READ/WRITE ve iptal, VIEWER/TECHNICAL ayrımı, rol değişikliği/hesap iptali, CSRF/origin, davet/sıfırlama token tekrarları, audit redaksiyonu, çapraz firma foreign key bağlama, UTC toplantılar, bildirim tekrarları, eşzamanlı stage conflict, manuel kazanım/kayıp ve yeniden açma.

Tarayıcı testi: giriş → firma → kişi → görüşme → görev → fırsat → aşama → mobil görev tamamlama → çıkış. Ekran görüntüleri `test-results` altındadır; test sırasında gerçek üçüncü tarafa mesaj gönderilmez.

## Bilinen sınırlar ve sonraki faz

- E-posta teslimatı yerel dosya adaptörüdür; gerçek bağlantı iddiası yoktur.
- MFA, maliyet/teklif/PDF, dosyalar, rapor/CSV, firma birleştirme, tam proje/akademi entegrasyonu yoktur.
- Liste sayfaları sayfalıdır; Kanban yalnız mevcut sayfayı gösterir. Form firma seçicileri ilk 100 erişilebilir firmayı listeler; daha büyük hacimde aramalı seçici eklenmeli. Firma detayından işlemler doğrudan ilgili firmada yapılabilir.
- Takvim aylık ajanda görünümüdür; görev tarafı ilgili aydaki ilk 100 kayıtla sınırlıdır. Tam sürüklenebilir takvim ve kapsamlı ekran okuyucu denetimi yapılmadı.
- Teknik görev açıklamalarına ticari sır yazılmaması içerik sorumlusunun görevidir; teknik kullanıcılara açık alanlar bilerek dar tutulur.
- Üretim yayını yapılmadı; yedek/restore, güvenlik değerlendirmesi, tedarikçi bağlantıları ve gerçek kullanıcı kabulü canlıya hazırlık fazında.

## Doğrulama sonuçları

- Yerel PostgreSQL migration başarılı; izole test DB'lerinde sıfırdan iki migration da başarıyla uygulandı.
- `npm run check`: ESLint, tüm workspace tip kontrolleri, 4 smoke/regresyon testi, API ve Next üretim derlemesi başarılı.
- `npm run test:integration`: 12 senaryo ve ana test dahil 13/13 başarılı. Test DB'leri sonunda kaldırıldı.
- `npm run test:e2e`: masaüstü satış akışı + 390px mobil görev tamamlama/çıkış testi başarılı. Masaüstü ve mobil ekran görüntüleri görsel olarak incelendi.
- `npm audit --audit-level=moderate`: 0 açık.
- İlk denemelerde PATCH şemalarının gönderilmeyen alanlara varsayılan değer eklemesi ve PostgreSQL advisory-lock dönüş tipinin okunması sorunları bulundu ve düzeltildi. Tarayıcıda form etiketleri erişilebilir adlarla eşleştirildi; testler yeniden geçti.
- Uzak CI henüz çalıştırılmadı; Git remote/PR veya üretim dağıtımı oluşturulmadı. Gerçek uygulama DB'sine yönetici/test/demo hesabı otomatik eklenmedi. İlk hesap `npm run admin:create` ile kullanıcı tarafından seçilen bilgilerle oluşturulur.
