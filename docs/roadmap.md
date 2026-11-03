# IT SalesHub — Uygulama yol haritası

3 Kasım düzeltmeleri: [oturum yenileme ve mesaj okundu bildirim eşlemesi](session-notification-fixes.md). Kullanıcının sohbet tarzı toplantı notları ve toplu bildirim okuma değişiklikleri korunmuştur.

## Güncel plan — 2 Kasım 2026

Toplantı notlarına ilk/son kaydeden kişi ve UTC tarih bilgisi, ayrı mobil okuma sayfası eklendi. Eski kayıtlara yazar/tarih uydurulmaz. Migration ve kabul: [toplantı notları](meeting-notes.md).

Kullanıcı talebiyle e-postasız hesap oluşturma, yönetici geçici parola atama ve ilk girişte zorunlu parola değiştirme eklendi. API, migration ve kabul koşulları: [kullanıcı yönetimi](managed-users.md). Bu geliştirme SMTP kurulumu gerektirmez.

İlk sunucu kurulumu kararı: boş veritabanı ve e-posta kapalı mod; mevcut Apache/Virtualmin kullanılacak. [Kurulum ve kabul koşulları](apache-deployment.md). SMTP ve tam ekip pilotu sonraki iş olarak açık kalır.

Faz 0–6'nın yazılımı, Faz 8 mesajlaşma ve Faz 9 PWA/Web Push uygulandı. Faz 5'in gerçek pilot/canlı kabulü, F8-07 ekip pilotu ve Faz 9 gerçek cihaz kabulü açık. Faz 7 ürün sahibi kararıyla kapsam dışı kalır. Aşağıdaki tarihsel faz kayıtları yazılım teslimatını anlatır; canlıya hazır olma onayı değildir.

Mobil kullanım iyileştirmeleri de tamamlandı: alt gezinme, görev başlat/tamamla, hızlı toplantı notu, sayfalar arasında bellekte taslak koruma ve telefon mesaj yazma düzeni. Kabul kaydı: [mobil iş akışları](mobile-workflows.md). Taslaklar yeniden yükleme/oturum kapanmasında korunmaz; çevrimdışı çalışma uygulanmış değildir. iPhone/Android için mevcut teslimat PWA'dır, mağazadan indirilen native uygulama değildir.

### Doğrulama durumu

- Yerelde lint, tip kontrolü, web üretim derlemesi ve mobil senaryo dahil 8 Playwright senaryosu geçti. Önceki backend doğrulamasında gerçek ClamAV ile 85 PostgreSQL entegrasyon kontrolü geçti.
- GitHub Actions tanımı var; bu plan hazırlanırken son uzak çalıştırmanın başarılı sonucu doğrulanmadı.
- Son bağımlılık denetiminde geliştirme araç zincirinde 11 orta seviye bulgu vardı; yüksek/kritik bulgu yoktu. Güncelleme ve tekrar denetim işi açık.
- Mesaj/bilgi bankası eklerini de içeren güncel yedek-kurtarma tatbikatı açık. Önceki DB/PDF doğrulaması bunun yerine sayılmaz. Docker artık yerelde kullanılabilir; eski “Docker yok” notu tarihsel engeldir.
- Gerçek SMTP teslimi, HTTPS üzerinden cihaz bildirimi ve fiziksel telefon klavyesi henüz doğrulanmadı.

### Bundan sonraki iş sırası

| Sıra | İş paketi / sorumlu | Tamamlanma koşulu | Bağımlılık |
|---|---|---|---|
| 1 | Teknik kabul açıkları — geliştirme | Son commit için uzak CI sonucu; bağımlılık bulgularının değerlendirilmesi; izole test verisiyle DB + PDF + bilgi bankası + mesaj dosyası geri yükleme ve hash doğrulaması kayıtlı | Mevcut depo ve test ortamı |
| 2 | Staging hazırlığı — işletim + ürün sahibi | Sunucu/alan adı, TLS, SMTP, VAPID, ClamAV, ayrı DB rolleri ve sır yönetimi hazır; davet/parola sıfırlama gerçek posta kutusuna ulaşıyor; proxy üzerinden SSE çalışıyor | Altyapı ve e-posta sağlayıcısı kararı |
| 3 | Gerçek mobil kabul — geliştirme + pilot ekip | iPhone Safari/PWA ve Android Chrome/PWA'da iş başlatma, not kaydı, mesaj/dosya gönderme; açık klavye, yatay ekran, arka plandan dönüş, bağlantı kesilmesi, bildirim ve oturum iptali sonuçları kayıtlı | HTTPS staging ve test cihazları |
| 4 | İşletim kabulü — işletim | Zamanlanmış ve sunucu dışı yedek, kalıcı kurtarma provası, anahtar erişimi, disk/hazırlık/mail/push/tarama alarmları; hedef kullanıcı yükünde ölçüm ve container taraması | Staging; kabul edilen veri kaybı/kurtarma süresi ve yük hedefleri |
| 5 | Ekip pilotu — ürün sahibi + satış/teknik ekip | 4–6 kişiyle 10 iş günü; CRM satış→teklif→devir ve mesajlaşma senaryoları; yetki ihlali/veri kaybı yok, kritik/yüksek sorunlar kapalı, pilot ölçümleri doldurulmuş | 1–4; rol/veri paylaşımı ve saklama kararları |
| 6 | Canlı geçiş — ürün sahibi + işletim | Veri aktarım örneği, kullanıcı eğitimi, sorumlular ve geri dönüş planı hazır; [canlı kontrol listesi](go-live-checklist.md) tamam; ayrıca açık dağıtım talimatı alınmış | Pilot kabulü |

2 hazırlanırken 1 yürütülebilir; 3 ve 4 staging üzerinde paralel planlanabilir. Takvim, sunucu/sağlayıcı erişimi ve ekip müsaitliği netleşince belirlenir; 10 iş günlük pilot geliştirme süresine dahil değildir.

### Planlama için netleştirilecek kararlar

1. Kullanılacak sunucu, CRM alan adı, SMTP sağlayıcısı ve işletim sorumlusu.
2. Pilot katılımcıları, başlangıç tarihi, gerçek iPhone ve Android test cihazları.
3. Eşzamanlı kullanıcı/veri hacmi hedefi, kabul edilebilir veri kaybı ve kurtarma süresi, yedek saklama ve alarm alıcısı.
4. Rol/paylaşım, teklif onay eşikleri ve mesaj saklama/aydınlatma kararlarının pilot öncesi teyidi.

Yeni bir faz başlatmak yerine önce bu kabul açıklarını kapatmak önerilir. E-posta/takvim senkronizasyonu, AI, ERP, native mağaza uygulaması ve kalıcı çevrimdışı taslaklar bu planla otomatik olarak kapsam içine alınmaz. Hukuki talep için özel mesaj dışa aktarımı ayrıca gereksinim kararı bekler.

## Tarihsel faz kayıtları

Tarih: 30 Ekim 2026. Durum: Faz 0–4 ve Faz 6 uygulandı ve yerelde doğrulandı (`docs/phase-6.md`); Faz 7 ürün sahibi kararıyla kapsam dışı. Faz 9 (telefon bildirimleri, tepkiler, iPhone/Android uygulaması) uygulandı; canlıya geçiş listesi `docs/go-live-checklist.md`. Faz 8 (ekip içi mesajlaşma ve belge paylaşımı): kararlar varsayılanlarla kabul edildi, F8-02…F8-06 yazılımı uygulandı (mesajlaşma, dosyalar ve ClamAV, canlı akış, bahsetme/bildirim, düzenleme/silme/moderasyon/sabitleme/sessize alma/arama/saklama/bilgi bankası önerisi); gerçek kullanıcı pilotu (F8-07) ve ön koşulları açık — `docs/pilot-messaging.md` — `docs/phase-8-team-messaging.md`. Faz 5 yazılımı uygulandı; SMTP adaptörü ve en az yetkili DB rolü eklendi. Gerçek pilot ve canlı geçiş kapıları açık. Güncel kayıt: `docs/phases-4-5.md`. Güncel teslimat kaydı `docs/phases-1-3.md`; Faz 0 tarihsel kaydı `docs/phase-0-status.md`. Kaynak plan korunmuştur. Faz 1–3 yetki ve akış varsayımları kodda uygulanmıştır; teklif ve canlıya çıkış kararları ilgili faz öncesi kesinleştirilir.

## İlk MVP sınırı (tarihsel)

Firma → kişi → faaliyet → takip görevi → fırsat → teklif → onay → müşteri kararı → kazanım/kayıp → devir özeti.

MVP: oturum ve kullanıcılar, kayıt sahipliği/paylaşım, firma/kişi, faaliyetler, görev/toplantı, fırsatlar, temel ürün/hizmet kartları, teklif/PDF/revizyon, temel raporlar, sistem içi bildirimler, CSV, devir özeti ve görevi.

MVP dışı: akademi, kapsamlı bilgi yayın sistemi ve proje yönetimi, e-posta/takvim senkronizasyonu, AI, ERP/stok, elektronik imza, otomatik WhatsApp, çok kiracılı SaaS.

Akademi, bilgi bankası ve proje teslimatı daha sonra Faz 6 ile uygulandı; yukarıdaki ifade yalnız ilk MVP sınırını gösterir.

## Fazlar ve çıkış koşulları

| Faz | İşler | Bağımlılık | Kabul koşulu |
|---|---|---|---|
| 0 | Karar belgeleri, repo, CI, geliştirme ortamı, health, OpenAPI, Prisma temel | Yok | Kurulum, typecheck, test ve build doğrulanır; ortam engelleri açıklanır |
| 1 | Auth, davet/sıfırlama, kullanıcılar, firma/kişi, sahiplik/paylaşım, audit | 0 | SALES-A, SALES-B'nin özel verisini detay/liste/arama yoluyla göremez; oturum iptali işler |
| 2 | Faaliyet, zaman çizelgesi, toplantı, görev, outbox, hatırlatma | 1 | Görüşmeden takip görevi açılır; retry çift bildirim üretmez; UTC dönüşümleri doğru |
| 3 | Fırsatlar, liste/Kanban, aşama geçmişi, kapanış kuralları | 2 | Geçiş ve tarihçe atomik; LOST gerekçeli; açık fırsatta sorumlu ve sonraki aksiyon var |
| 4 | Temel katalog, teklif hesapları, onay, sürüm, PDF, müşteri kararı | 3 | Decimal hesaplar, değişmez içerik/PDF, eşzamanlılık ve maliyet erişim testleri geçer |
| 5 | Dashboard, CSV import/export, devir özeti/görev, pilot, canlı hazırlığı | 4 | Gerçek pilot, izin/E2E testleri ve DB+dosya geri yükleme tatbikatı tamamlanır |
| 6 | Bilgi bankası, akademi, proje teslimatı | 5 | Onaylı içerik ve eğitim ilerlemesi; tek fırsata tek proje |
| 7 | İhtiyaca göre entegrasyonlar, ardından AI — **kapsam dışı (ürün sahibi kararı)** | 6 | — |
| 8 | Ekip içi mesajlaşma: kanal, grup, birebir, kayıt konuşması, dosya paylaşımı — **yazılım tamam (F8-02…06); pilot (F8-07) açık** | 6 | Kayıt kapsamı mesaj/dosya/arama/canlı akışta korunur; dosya taraması; pilot ekip WhatsApp yerine kullanır |
| 9 | Telefon/bilgisayar bildirimleri (Web Push), mesaj tepkileri, iPhone/Android ana ekran uygulaması — **yazılım tamam; gerçek cihaz testi açık** | 8 | Gerçek iPhone ve Android'de kurulum, izin, bildirim ve tıklama doğrulanır; `docs/go-live-checklist.md` |

Süre tahmini, Faz 0 doğrulaması ve ekip kapasitesi görüldükten sonra yapılacak. Her iş küçük, gözden geçirilebilir bir teslimat olmalı.

## İlk iş kuyruğu

- F0-01: MVP sınırı, mimari, izin matrisi, durum makineleri ve API taslağı — belgeler oluşturuldu.
- F0-02: Monorepo, web/API, ortak şema, ortam doğrulama — tamamlandı.
- F0-03: PostgreSQL Compose, Prisma bağlantı temeli, OpenAPI, health — yerelde doğrulandı.
- F0-04: Typecheck, smoke test, build ve çalıştırma rehberi — tamamlandı; CI tanımı hazır, uzak çalıştırma henüz yok.
- F1-01: Kullanıcı/rol/izin/oturum/davet/sıfırlama şemaları ve migration; ilk admin komutu — tamamlandı.
- F1-02: Argon2id, güvenli cookie, CSRF, rate limit, oturum iptali ve canlı rol denetimi — doğrulandı.
- F1-03: Firma/kişi, sahiplik/paylaşım, arşiv, mükerrer uyarısı; bağlı kayıt tutarlılığı — tamamlandı.
- F1-04: Kullanıcı yönetimi ve firma ekranları; izinli liste/arama; audit redaksiyonu — tamamlandı.
- F1-05: İki SALES, MANAGER, TECHNICAL ve VIEWER ile pozitif/negatif API testleri — geçti.
- F2: Faaliyet, toplantı, görev, zaman çizelgesi, UTC, outbox ve bildirim — uygulandı ve test edildi.
- F3: Liste/Kanban, fırsat düzenleme, atomik aşama geçmişi, sürüm kontrolü, WON/LOST/yeniden açma — uygulandı ve test edildi.
- F4: Katalog, Decimal teklif, onay politikası, değişmez sürüm/PDF ve müşteri kararı — uygulandı ve doğrulandı.
- F5: Dashboard, CSV, devir ve şifreli DB+PDF restore — yerelde doğrulandı.
- F5-06: SMTP e-posta adaptörü ve ayrı migration/uygulama DB rolleri — uygulandı ve entegrasyon testleriyle doğrulandı. Gerçek pilot, sağlayıcı seçimi ve canlı geçiş açık; `docs/operations.md`.
- F6: Proje teslimatı (devirden otomatik proje, kilometre taşı, proje görevleri), sürümlü bilgi bankası ve dosyalar, akademi (ders, test, ilerleme) — uygulandı ve doğrulandı; `docs/phase-6.md`.
- F7: Ürün sahibi kararıyla yapılmayacak.
- F8-01: Mesajlaşma kararları — ürün sahibi önerilen varsayılanları kabul etti (yönetici erişimi ve saklama için hukuki görüş ayrıca alınmalı).
- F8-02: Konuşma/üyelik/mesaj şeması ve migration, izinler, kayıt kapsamı, idempotent gönderim, okundu, OpenAPI — uygulandı ve entegrasyon testleriyle doğrulandı; `docs/phase-8-team-messaging.md`.
- F8-03: Mesajlar sayfası, menüde okunmamış sayacı, firma/fırsat/proje sayfalarında “Konuşma” bölümü, 10/15 sn yoklama — uygulandı; entegrasyon ve Playwright testleriyle doğrulandı.
- F8-04: Mesaj ekleri (içerikten tür tespiti, makro reddi, 20 MB/5 dosya), ClamAV taraması ve karantina, Dosyalar listesi, yedek kapsamı — uygulandı; gerçek clamd (yerel test imzası) ve Playwright ile doğrulandı. Yedek tatbikatı Docker olmadığı için bu ortamda çalıştırılamadı.
- F8-05: SSE + PostgreSQL LISTEN/NOTIFY canlı akış, @bahsetme, bahsetme/birebir/yanıt bildirimleri, yeniden bağlanma — uygulandı; entegrasyon ve Playwright testleriyle doğrulandı.
- F8-06: Düzenleme geçmişi (DB tetikleyicisi), yumuşak silme, gerekçeli moderasyon, sabitleme, sessize alma, Türkçe tam metin arama, saklama işi, “Bilgi bankasına öner” — uygulandı; entegrasyon ve Playwright testleriyle doğrulandı.
- F8-07: Otomatik testler ve 390 px mobil kontrol yapıldı. Gerçek ekiple pilot yapılmadı; plan ve kayıt şablonu `docs/pilot-messaging.md`. Hukuki talep için özel yazışma dışa aktarımı hukuki görüş beklediği için uygulanmadı.
- F9: Web Push (VAPID, şifreli içerik, izin listeli servisler, cihaz başına önizleme, tam bir kez gönderim), tepkiler, PWA manifesti/simgeler/service worker, iPhone güvenli alanları ve ana ekran rehberi — uygulandı; entegrasyon ve Playwright testleriyle doğrulandı. Gerçek cihaz ve üretim alan adı testi açık: `docs/phase-9-mobile.md`, `docs/go-live-checklist.md`.

## Faz başlamadan kesinleştirilecek iş kararları

| Karar | Önerilen varsayılan | Son tarih |
|---|---|---|
| MANAGER özel firma erişimi | Tüm satış kayıtları; maliyet için ayrıca izin | Faz 1 |
| Teknik personel erişimi | Atanmış işin gerekli müşteri alanları; ticari detaylar kapalı | Faz 1 |
| Onay politikası | Her sürüm kontrol edilir; eşik içinde otomatik, dışında yönetici onayı | Faz 4 |
| İndirim/marj eşikleri | Ürün sahibi belirler; yapılandırılmamış politika otomatik onay vermez | Faz 4 |
| Para/yuvarlama | Teklif başına tek para birimi; kur dönüşümü MVP dışında | Faz 4 |
| Gönderim | PDF indirme + manuel gönderildi kaydı; teslim doğrulaması iddiası yok | Faz 4 |
| Bulut ve e-posta sağlayıcısı | Bulut seçilmedi; e-posta için sağlayıcıdan bağımsız SMTP adaptörü hazır, sağlayıcı seçilmedi | Canlı geçiş öncesi |
| Veri aktarımı | Sabit CSV, önizleme, satır hatası ve mükerrer kontrolü | Faz 5 |
| Mesaj gizliliği, saklama, dosya türleri, antivirüs | Önerilen varsayılanlar kabul edildi (`docs/phase-8-team-messaging.md`) | Faz 8 — karar verildi |

Canlı geçiş; staging, sır yönetimi, yedek/restore, kullanıcı kabulü, veri işleme değerlendirmesi ve ürün sahibinin onayından sonra. Bu belge hukuki değerlendirme sunmaz.
