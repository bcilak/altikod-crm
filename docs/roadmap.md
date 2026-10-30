# IT SalesHub — Uygulama yol haritası

Tarih: 30 Ekim 2026. Durum: Faz 0–4 ve Faz 6 uygulandı ve yerelde doğrulandı (`docs/phase-6.md`); Faz 7 ürün sahibi kararıyla kapsam dışı. Faz 8 (ekip içi mesajlaşma ve belge paylaşımı): kararlar varsayılanlarla kabul edildi, F8-02 API çekirdeği, F8-03 ekranları ve F8-04 dosya ekleri/ClamAV taraması uygulandı; canlı akış ve bildirim henüz yok — `docs/phase-8-team-messaging.md`. Faz 5 yazılımı uygulandı; SMTP adaptörü ve en az yetkili DB rolü eklendi. Gerçek pilot ve canlı geçiş kapıları açık. Güncel kayıt: `docs/phases-4-5.md`. Güncel teslimat kaydı `docs/phases-1-3.md`; Faz 0 tarihsel kaydı `docs/phase-0-status.md`. Kaynak plan korunmuştur. Faz 1–3 yetki ve akış varsayımları kodda uygulanmıştır; teklif ve canlıya çıkış kararları ilgili faz öncesi kesinleştirilir.

## MVP sınırı

Firma → kişi → faaliyet → takip görevi → fırsat → teklif → onay → müşteri kararı → kazanım/kayıp → devir özeti.

MVP: oturum ve kullanıcılar, kayıt sahipliği/paylaşım, firma/kişi, faaliyetler, görev/toplantı, fırsatlar, temel ürün/hizmet kartları, teklif/PDF/revizyon, temel raporlar, sistem içi bildirimler, CSV, devir özeti ve görevi.

MVP dışı: akademi, kapsamlı bilgi yayın sistemi ve proje yönetimi, e-posta/takvim senkronizasyonu, AI, ERP/stok, elektronik imza, otomatik WhatsApp, çok kiracılı SaaS.

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
| 8 | Ekip içi mesajlaşma: kanal, grup, birebir, kayıt konuşması, dosya paylaşımı — **F8-02…04 uygulandı, F8-05…07 açık** | 6 | Kayıt kapsamı mesaj/dosya/arama/canlı akışta korunur; dosya taraması; pilot ekip WhatsApp yerine kullanır |

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
- F8-05…F8-07: Canlı akış/bildirim, arama ve düzenleme/saklama, pilot — açık.

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
