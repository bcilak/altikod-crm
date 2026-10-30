# IT SalesHub — Ürün Gereksinimleri ve Codex Geliştirme Planı

Sürüm: 1.0 | Tarih: 30 Ekim 2026 | Hedef: Türkiye'de faaliyet gösteren 1–10 kişilik IT şirketi | Dağıtım: Cloud

## 1. Ürün vizyonu

Müşterileri, müşteri temsilcilerini, iletişim geçmişini, satış fırsatlarını, teklifleri, toplantıları, görevleri, teknoloji portföyünü, eğitim materyallerini ve kazanılan işlerin teslimatını ortak bağlamda yönetmek. İlk sürüm tek şirkete özeldir; multi-tenant SaaS özellikleri bu kapsama dahil değildir.

### Başarı ölçütleri
- Yeni müşteri → görüşme → fırsat → teklif → onay → kazanıldı/kaybedildi → proje devir akışı uçtan uca çalışır.
- Her açık fırsat için sorumlu kişi ve sonraki aksiyon belirlenebilir.
- Yetkisiz kullanıcı başka kullanıcının özel müşterisini veya maliyet bilgilerini API üzerinden dahi göremez.
- Her teklif için değiştirilemez revizyon geçmişi ve PDF çıktısı vardır.
- Teknoloji kartı ile teklif kalemi ilişkilendirilebilir; satış personeli uygun ürün anlatımına ulaşır.
- Yönetici açılan fırsatları, gönderilen teklifleri, kazanılan işleri ve geciken takipleri görebilir.

## 2. Roller

- **ADMIN:** kullanıcı yönetimi, yapılandırma, tüm veriler; audit log görüntüleme.
- **MANAGER:** ekip raporları, tüm satış fırsatları, teklif onayları, ürün bilgileri.
- **SALES:** kendisine atanmış veya açıkça paylaşılmış müşteri/fırsatlar, faaliyet ve teklif taslakları.
- **TECHNICAL:** atanmış teknik çözüm talepleri, ürün teknik detayları ve proje görevleri; ticari maliyetler varsayılan olarak kapalı.
- **VIEWER:** atanmış kayıtların okuma yetkisi.

Permission modeli: role_permissions(action, resource), ayrıca resource ownership; varsayılan ret, hizmet katmanında ve sorgu katmanında koşullu denetim. Her hassas aksiyon için audit log. Hassas marj ve maliyet ayrı izin. Rol değişikliği mevcut oturum izinlerini anında etkiler.

## 3. Fonksiyonel gereksinimler

### FR-01 Kimlik ve kullanıcı yönetimi [P0]
- Davet bağlantısıyla kullanıcı oluşturma, giriş/çıkış, parola sıfırlama, hesap pasifleştirme, MFA hazırlığı.
- Oturum: güvenli, HttpOnly, Secure, SameSite cookie; sunucu tarafı oturum iptali; istek oran sınırlaması.
- Roller ve kullanıcı bazlı işlem kayıtları.
- Kabul: SALES, başka SALES kullanıcısının izinsiz özel müşteri kaydını GET, liste araması veya dışa aktarmayla göremez.

### FR-02 Firma ve kişiler [P0]
- Firma CRUD; alanlar: ad, ticari unvan, sektör, web, telefon, adres, firma türü, kaynak, durum, sorumlu, etiketler, notlar.
- Bir firmada birden çok kişi: ad, rol/unvan, e-posta, telefon, karar verici bayrağı, iletişim tercihleri.
- Firma birleştirme / mükerrer kontrol: unvan, alan adı, vergi no (işleniyorsa gizli/erişim kontrollü).
- Silme yerine arşiv; diğer kayıtlara bağlı firmayı fiziksel silmeme.
- Kabul: Firma detayında faaliyet, fırsat, teklif, görev ve proje zaman çizelgesi görünür.

### FR-03 Faaliyetler [P0]
- Türler: arama, e-posta, WhatsApp, ziyaret, çevrim içi toplantı, iç not; `happened_at`, sonuç, özet, katılan kişi, kaydeden.
- Firma ve opsiyonel fırsat ilişkisi; takip görevi oluşturabilme.
- Kullanıcının elle girdiği faaliyet ile entegrasyonla doğrulanmış faaliyet ayrı `source` alanında tutulur.
- Kabul: Her görüşme firmaya bağlanır; fırsat üzerinden filtrelenir; hatalı otomatik 'arama yapıldı' iddiaları yoktur.

### FR-04 Satış fırsatları [P0]
- Başlık, firma, sorumlu, ürünler, tahmini değer, para birimi, tahmini kapanış, kazanma olasılığı, kaynak, durum, kayıp nedeni, rakip.
- Aşamalar: NEW_LEAD, QUALIFICATION, NEEDS_ANALYSIS, SOLUTION_DESIGN, PROPOSAL, NEGOTIATION, WON, LOST.
- Kanban ve liste görünümü, filtreleme, sürükle-bırak; her aşama değişikliği tarihçeye kaydedilir.
- WON için onaylanmış teklif ya da manuel kazanım gerekçesi; LOST için kayıp nedeni zorunlu.
- `next_action_at` geçmişse takip uyarısı.
- Kabul: Aşama değişikliği hem backend durumunu hem tarihçeyi atomik günceller; yetkisiz işlem reddedilir.

### FR-05 Teklifler [P0]
- Firma/fırsat ilişkisi, teklif numarası, sürüm, para birimi, geçerlilik, açıklama, vergi/indirim ve para hesapları.
- Teklif kalemi: ürün bağlantısı (opsiyonel), ad, açıklama, miktar, birim fiyat, iskonto, KDV oranı, maliyet (yetkili erişimi), sıralama.
- Durum: DRAFT, PENDING_APPROVAL, APPROVED, SENT, ACCEPTED, REJECTED, EXPIRED, WITHDRAWN.
- Onay sınırı konfigürasyonu: indirim yüzdesi ve marj tabanı; limitleri aşan teklif gönderilemez.
- Revizyon: yeni sürüm yaratılır, eski sürüm salt okunur; PDF, sürüm anlık görüntüsünden üretilir.
- Hesap: server-side decimal (float değil), toplama/tax/discount kuralı belgelendirilir; döviz kuru bir sürüme sabitlenir veya toplam orijinal para biriminde tutulur.
- Kabul: Revizyon sonrası eski PDF ve kalemler değişmez; toplam doğru; onaysız teklif SENT yapılamaz.

### FR-06 Toplantı ve görevler [P0]
- Toplantı: müşteri, katılımcılar, zaman ve saat dilimi, gündem, not, sonuç, bağlantı/konum.
- Görev: başlık, sorumlu, hedef tarih, öncelik, durum, firma/fırsat/proje bağlantısı, hatırlatıcı.
- Görev tamamlanması ve gecikme takibi; günlük görev listesi.
- Kabul: Saatler UTC depolanır, Europe/Istanbul gösterilir; hatırlatmalar çift gönderilmez.

### FR-07 Teknoloji portföyü [P1]
- Kategori, ürün/servis, marka, sürüm, teknik nitelikler, kullanım alanı, ideal müşteri, satış cümlesi, ihtiyaç keşif soruları, itiraz yanıtları, kısıtlar, ekler.
- Taslak/onaylı/yayından kaldırıldı içerik durumları; etiket, versiyon, içerik sahibi, güncelleme tarihi.
- Teklif kalemi ürün kartına bağlanır; fiyat katalogla ilişkili olabilir ancak fiyat değişikliği geçmiş teklifi değiştirmez.
- Kabul: SALES yalnızca onaylı içerikleri görür; ürün üzerinde değişiklik eski teklifi etkilemez.

### FR-08 Eğitim akademisi [P1]
- Kurs, ders, sıralama, ek dosya, tamamlanma ve kısa test; ders içeriği ürünle ilişkilendirilebilir.
- Eğitim yöneticisi ilerleme raporu; test sorularının cevap anahtarı satış kullanıcısına sızdırılmaz.
- Kabul: İlerleme sadece yetkili kullanıcı için güncellenir; tamamlanan dersler izlenir.

### FR-09 İş/proje teslimatı [P1]
- WON fırsattan proje oluşturma; proje sorumlusu, görev listesi, kilometre taşı, durum, hedef teslim.
- Devir özetinde müşteri ihtiyacı, kabul edilen teklif sürümü ve sözleşme bağlantıları yer alır.
- Kabul: Aynı kazanılmış fırsat için çift proje yaratılması engellenir.

### FR-10 Yönetim paneli ve raporlama [P0]
- Yeni firmalar, aktif fırsatlar, pipeline toplamı (para birimine göre ayrı), bekleyen teklifler, kazanım oranı, kapanan işler, geciken takipler.
- Kişi/faaliyet/ürün/sektör bazlı filtre; tarih aralığı; CSV dışa aktarma yetki kontrolü.
- KPI tanımları: `win_rate = WON / (WON + LOST)` seçili kapanma dönemi için; pipeline toplamı yalnızca açık fırsatlar; ağırlıklı pipeline = açık tutar × olasılık.
- Farklı para birimleri kuru tanımlanmadan tek toplamda birleştirilmez.
- Kabul: KPI API ve kartlar aynı filtrelerle tutarlı sonuç verir.

### FR-11 Bildirim ve denetim [P0]
- Sistem içi bildirim: görev ataması, gecikmiş takip, teklif onayı, yaklaşan teklif geçerlilik tarihi.
- Audit: kim/ne/zaman/hangi kayıt; kritik eski/yeni değerler güvenli redaksiyonlu; sır ve parola asla kaydedilmez.
- Kullanıcı olayları: iptal edilen oturumlar, başarısız girişler, izin ihlalleri.

## 4. Veri modelinin omurgası

Tüm id'ler UUID; tüm zamanlar `timestamptz`; para `numeric(18,4)`; fiyat ve miktar için belirlenen hassasiyet sözleşmesi; soft-delete `archived_at` gerekli yerlerde; `created_at`, `updated_at` her tabloda. En azından aşağıdaki tablolar:

- `users(id, email UNIQUE, name, password_hash, role_id, is_active, created_at, updated_at)`
- `roles(id, code UNIQUE, name)`; `role_permissions(role_id, resource, action)`
- `sessions(id, user_id FK, expires_at, revoked_at, created_at)`
- `companies(id, legal_name, display_name, domain, sector, status, source, owner_id FK users, archived_at, ...)`
- `contacts(id, company_id FK, first_name, last_name, title, email, phone, decision_maker, archived_at, ...)`
- `company_access(id, company_id, user_id, permission)` (özel paylaşım)
- `activities(id, company_id FK, opportunity_id FK NULL, contact_id FK NULL, type, source, summary, outcome, happened_at, created_by FK, ...)`
- `opportunities(id, company_id FK, owner_id FK, title, stage, estimated_value NUMERIC, currency CHAR(3), probability, expected_close_at, next_action_at, lost_reason, won_at, lost_at, ...)`
- `opportunity_stage_history(id, opportunity_id FK, from_stage, to_stage, changed_by, changed_at, note)`
- `products(id, sku UNIQUE, category_id FK, name, type, status, list_price, currency, description, ...)`
- `product_categories(id, parent_id FK NULL, name, slug)`
- `knowledge_articles(id, product_id FK NULL, title, slug, body, status, version, author_id, approved_by, approved_at, ...)`
- `attachments(id, entity_type, entity_id, storage_key, original_name, mime_type, size_bytes, uploaded_by, ...)` (erişim kontrolü `entity_type/id` bazında)
- `quotes(id, opportunity_id FK, company_id FK, quote_number UNIQUE, current_version_id, created_by, ...)`
- `quote_versions(id, quote_id FK, version_number, status, currency, issued_at, valid_until, subtotal, discount_total, tax_total, total, approval_requested_at, approved_by, approved_at, sent_at, snapshot_json, ...)`; unique `(quote_id, version_number)`
- `quote_items(id, quote_version_id FK, product_id FK NULL, description, quantity NUMERIC, unit_price NUMERIC, discount_pct NUMERIC, tax_pct NUMERIC, line_total NUMERIC, position)`
- `meetings(id, company_id FK, opportunity_id FK NULL, starts_at, ends_at, timezone, title, agenda, notes, outcome, created_by, ...)`
- `meeting_attendees(id, meeting_id FK, user_id FK NULL, contact_id FK NULL, external_email NULL)`
- `tasks(id, title, description, assignee_id FK, company_id FK NULL, opportunity_id FK NULL, project_id FK NULL, due_at, priority, status, completed_at, ...)`
- `notifications(id, user_id FK, type, payload_json, read_at, dedupe_key UNIQUE, created_at)`
- `projects(id, opportunity_id FK UNIQUE, company_id FK, accepted_quote_version_id FK NULL, owner_id FK, status, start_at, due_at, ...)`
- `project_milestones(id, project_id FK, title, due_at, completed_at, position)`
- `courses(id, title, status, created_by, ...)`; `lessons(id, course_id FK, product_id FK NULL, title, body, position, ...)`; `lesson_progress(id, lesson_id FK, user_id FK, completed_at)` with unique lesson/user
- `audit_logs(id, actor_id FK NULL, action, entity_type, entity_id, at, metadata_redacted_json, ip_hash)`
- `outbox_events(id, type, payload_json, status, attempts, next_run_at, created_at)` for reliable asynchronous workflows.

### İndeksler, bütünlük, eşzamanlılık
- Index: `companies(owner_id,status)`, `contacts(company_id)`, `activities(company_id,happened_at DESC)`, `opportunities(owner_id,stage,expected_close_at)`, `tasks(assignee_id,status,due_at)`, `quote_versions(quote_id,version_number)`.
- Unique constraints `users.email`, `quotes.quote_number`, `products.sku`, `projects.opportunity_id`.
- `CHECK probability BETWEEN 0 AND 100`, `CHECK estimated_value >= 0`, `CHECK quantity > 0`; geçerli enum/check durumlar.
- Teklif sürümünde optimistic locking veya transaction; onay ve durum değişimleri yarış koşullarına karşı korunur.
- Veri bütünlüğü: yumuşak silme, audit, özel veriler redaksiyonu, şifrelenmiş yedek, dosya checksum.

## 5. Genel API sözleşmesi

Prefix `/api/v1`, JSON, ISO-8601 datetime, cursor veya sayfa bazlı pagination, `sort`, `filter`, `search`.

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`
- `GET/POST /companies`, `GET/PATCH /companies/:id`, `GET/POST /companies/:id/contacts`, `GET /companies/:id/timeline`
- `GET/POST /activities`, `GET/PATCH /activities/:id`
- `GET/POST /opportunities`, `GET/PATCH /opportunities/:id`, `POST /opportunities/:id/stage-transitions`
- `GET/POST /quotes`, `GET /quotes/:id`, `POST /quotes/:id/versions`, `POST /quote-versions/:id/request-approval`, `POST /quote-versions/:id/approve`, `POST /quote-versions/:id/send`, `GET /quote-versions/:id/pdf`
- `GET/POST /tasks`, `PATCH /tasks/:id`, `GET/POST /meetings`
- `GET/POST /products`, `GET/POST /knowledge-articles`, `GET /reports/overview`, `GET /reports/pipeline`
- `GET /notifications`, `POST /notifications/:id/read`, `GET /audit-logs` (admin)
- `POST /projects/from-opportunity/:id` (P1), `GET/POST /courses` (P1)

API örnek hata biçimi: `{ "error": { "code": "FORBIDDEN", "message": "Bu kayda erişim izniniz yok", "requestId": "..." } }`.
OpenAPI dokümantasyonu otomatik üretilir. Komutlarda idempotency key değerlendirilmeli (proje oluşturma, teklif gönderimi, bildirim).

## 6. İş akışı kuralları

1. SALES müşteri oluşturur; firma sahibi otomatik mevcut kullanıcı olur.
2. Görüşme `activity` ve gerekirse `meeting` olarak kaydedilir; iletişim kanalı ve gerçek sonuç korunur.
3. İhtiyaç somutlaştığında `opportunity` açılır; `owner_id`, `next_action_at` atanır.
4. Teknik talep gerekiyorsa TECHNICAL kullanıcısına görev açılır.
5. Teklif taslağı ürün portföyünden veya serbest kalemle hazırlanır; hesap ve kısıtlar sunucuda yapılır.
6. Eşiği aşan indirim/marj için MANAGER onayı alınır; onaysız sürüm gönderilemez.
7. Gönderilen sürüm salt okunur; değişiklik yeni versiyondur.
8. Müşteri kabul ettiğinde fırsat WON; proje devir görevi başlar; proje oluşturma isteği idempotenttir.
9. Müşteri reddettiğinde LOST sebebi zorunlu; kapatılan fırsat raporlarda yer alır.
10. Hatırlatmalar yalnızca yetkili kullanıcıya ve aynı olay için en fazla bir kez gider.

## 7. UI / sayfa haritası

- `/login` — giriş
- `/dashboard` — KPI, geciken görevler, son faaliyetler, yaklaşan toplantılar
- `/companies` — filtrelenebilir müşteri listesi, yeni müşteri
- `/companies/[id]` — genel bakış, kişiler, zaman çizelgesi, fırsatlar, teklifler, dosyalar
- `/opportunities` — Kanban/liste, pipeline filtreleri
- `/opportunities/[id]` — ayrıntı ve aşama geçmişi
- `/quotes` — liste, taslaklar, onay bekleyenler
- `/quotes/[id]` — satır kalemleri, versiyonlar, onay ve PDF
- `/calendar` — toplantı, görev takvimi
- `/tasks` — görevlerim, ekip görevleri
- `/catalog` — ürünler/teknolojiler
- `/catalog/[id]` — teknik bilgi ve satış anlatımı
- `/academy` — kurslar (P1)
- `/projects` — proje teslimatı (P1)
- `/reports` — filtreli KPI'lar
- `/settings/users` — kullanıcılar, roller
- `/settings/company` — şirket, teklif şablonu, varsayılan ayarlar

Tasarım: responsive, masaüstü sol sidebar + üst arama, mobil drawer, erişilebilir formlar, tablo filtreleri, tutarlı boş/hata/yükleme durumları, toast bildirimleri, klavye kullanımı. UI yalnızca API'ye göre yetkilendirilmiş veri gösterir.

## 8. Teknoloji yığını

- Web: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod.
- API: NestJS, TypeScript, OpenAPI, class-validator veya Zod (tek yaklaşım seçilmeli).
- DB: PostgreSQL, Prisma ORM ve migration.
- Auth: güvenli server-side session; Argon2id parola hash'i; CSRF koruması (cookie auth için); MFA'nın sonradan eklenebilmesi.
- Job: başlangıçta PostgreSQL outbox + worker; ihtiyaç doğarsa Redis/BullMQ.
- Files: S3-uyumlu private object storage, kısa ömürlü imzalı URL, MIME/size validation, zararlı dosya kontrolü.
- PDF: sunucuda sabit HTML şablonu + Playwright/Chromium veya uyumlu renderer.
- Test: Vitest/Jest, Supertest, Playwright E2E, test veritabanı.
- Infra: Docker, Docker Compose, reverse proxy + HTTPS, CI/CD, secret manager, error monitoring, DB backups.

## 9. Bulut dağıtımı ve güvenlik

Öneri: başlangıçta tek bölgeli küçük VPS (uygulama, web, reverse proxy) + yönetilen PostgreSQL ve özel nesne depolama; bütçe uygunsa DB ayrı sunucuda. Tek düğümün kesinti riski kabul edilmeli, geri yükleme prosedürü test edilmeli. Cloud sağlayıcısının veri işleme lokasyonu ve sözleşmeleri kontrol edilmeli.

Güvenlik gereksinimleri: TLS, güvenli cookie, RBAC+ownership, veri tabanı en az yetki, doğrulama/sanitizasyon, şifreli yedek, üretim gizli anahtar yönetimi, giriş ve API rate limiting, denetim logları, hata ayıklama verilerinde kişisel veri maskeleme, özel depolama, dosya taraması, düzenli dependency ve container taraması.

Türkiye için KVKK kapsamında müşteri iletişim bilgileri işlenirken aydınlatma, işleme hukuki sebebi, erişim, saklama-imha, tedarikçi sözleşmeleri incelenmeli. Yurt dışına veri aktarımı gündeme gelirse KVKK m.9 kapsamındaki güncel aktarım mekanizmaları ayrıca hukuken değerlendirilmeli. Bu belge hukuki görüş yerine geçmez.

Önerilen ilk SLO: aylık erişilebilirlik hedefi %99.5; RPO 24 saatten az, RTO 8 saatten az hedefleri bütçe/altyapıya göre teyit edilmeli. Test ortamı ile üretim ayrılmalı.

## 10. Geliştirme fazları, kabul kriterleri ve bağımlılıklar

### Faz 0 — keşif ve temel (ön koşul)
- Ürün kapsamı, roller, bilgi mimarisi, durum makineleri, Figma/komponent çizimleri.
- Monorepo, CI, docker compose, lint, test, environment örnekleri, veritabanı, migration, OpenAPI.
- Tamamlanma: temiz ortamda tek komutla dev kurulumu, API healthcheck ve web login placeholder.

### Faz 1 — kimlik, kullanıcı, firma (P0)
- Auth, roller, izinler, şirket/kişiler, firma sahipliği, arama ve CSV import.
- Tamamlanma: izinsiz API isteği 403; firma CRUD; duplicate kontrol; entegrasyon testleri.

### Faz 2 — faaliyet, toplantı, görev (P0)
- Görüşme kaydı, firma zaman çizelgesi, toplantılar, takip görevleri, gecikme görünümü.
- Tamamlanma: firma içindeki tüm faaliyetler tarih sıralı; yalnız izinli kullanıcı erişir.

### Faz 3 — fırsat ve teklif (P0)
- Pipeline Kanban, stage history, teklif sürümleri, kalem ve matematik, teklif onayı, PDF.
- Tamamlanma: end-to-end müşteri → fırsat → teklif → onay → WON/LOST; eski versiyon değiştirilemez.

### Faz 4 — dashboard ve canlıya çıkış (P0)
- KPI, filtreler, bildirimler, audit, staging, güvenlik/performans/yedek/restore testleri.
- Tamamlanma: rol bazlı panel, başarılı deploy, geri yükleme testi, kullanıcı kabul testi.

### Faz 5 — ürün portföyü ve eğitim (P1)
- Kategori/ürün, yayın akışı, bilgi kartları, dokümanlar, kurslar, ilerleme.
- Tamamlanma: onaylı bilgi erişimi, ürün bağlama, eğitim ilerlemesi.

### Faz 6 — proje devir ve entegrasyonlar (P1/P2)
- WON → proje, görevler, hatırlatmalar, e-posta/takvim OAuth entegrasyonları.
- Tamamlanma: çift proje engeli, senkronizasyon hataları için retry ve audit.

### Faz 7 — AI bilgi asistanı (P2)
- Onaylı portföy belgelerinde retrieval/RAG; alıntılı yanıtlar; izin filtresi; kullanıcı geri bildirimi.
- Tamamlanma: veri dışına sızdırmama, ürün özelliği/fiyat uydurmama testleri, maliyet limiti.

## 11. Codex çalışma biçimi

Her faz için: önce repo incele → bağımlılık analizi → kısa plan → yalnız istenen kapsamda değişiklik → migration → test → dokümantasyon → uygulama doğrulaması → değişiklik özeti. Var olan dosyaları gereksiz yere yeniden yazma. `AGENTS.md` ile kalıcı kurallar. Her faz ayrı branch/PR. Test başarısızlığını gizleme. Üretime manuel onaysız çıkma.

### Codex Master Prompt

```text
You are the lead engineer for IT SalesHub, an internal cloud CRM for a 1–10-person IT solutions company in Türkiye.
Read this entire project specification and inspect the repository before coding. Build a clean, secure, maintainable production-oriented modular monolith.
Stack: Next.js App Router + TypeScript + Tailwind + shadcn/ui frontend; NestJS + TypeScript REST API; PostgreSQL + Prisma; Docker Compose development; OpenAPI; Jest/Vitest and Playwright. Avoid microservices and premature complexity.
Business scope: companies, contacts, activity timelines, meetings, tasks, sales opportunities with state history, versioned quotes with server-side Decimal arithmetic and manager approvals, product knowledge cards, reporting, and later project handoff/training.
Use a clear module layout, RBAC plus record ownership, deny-by-default API authorization, redacted audit logging, safe file uploads, migrations and indexes, environment validation, timezone-aware timestamps (UTC storage / Europe-Istanbul display), and currency-safe business calculations.
Never mark unimplemented features complete. Do not fabricate integration data or credentials. Ask only if an essential secret or external service credential is necessary; otherwise use local adapters and documented stubs.
First produce: architecture plan, ERD, API contract, task breakdown, and acceptance tests. Then implement only the phase I explicitly give you. For each phase provide affected files, migrations, tests executed, known limitations, and next-phase dependencies.
```

### Prompt 0 — Proje iskeleti

```text
Implement Phase 0 only. Create apps/web, apps/api, packages/shared (or an equivalent maintainable monorepo), Docker Compose for PostgreSQL, environment example, README, basic CI, healthcheck, design tokens, API route and schema infrastructure, Prisma baseline, AGENTS.md, and smoke tests. Show commands to start the full stack locally. Do not implement CRM business modules yet.
```

### Prompt 1 — Auth ve müşteriler

```text
Implement Phase 1 only. Build secure session auth, user invitation, password hashing, role/permission enforcement, owner-based company access, company/contact CRUD, duplicate warnings, filters, search, client and server validation, user management, migrations, seed with DEMO-only records, and authorization integration tests. Do not use fake auth bypasses or rely only on UI permissions.
```

### Prompt 2 — Faaliyet ve görevler

```text
Implement Phase 2 only. Add activities, company timeline, meetings, meeting attendees, tasks, reminders/outbox model, status transitions, list/calendar views and overdue filters. Every record requires company-scoped access. Make timezone handling explicit and test it. Use local notification delivery adapter; no external API keys are available yet.
```

### Prompt 3 — Pipeline ve teklifler

```text
Implement Phase 3 only. Add opportunity pipeline Kanban/list, guarded stage transitions and history, quote aggregates with immutable versions, quote line items and server-side decimal calculations, discount/approval policy, management approval, template-based PDFs, and business integration tests. Protect sensitive costs behind explicit permission checks. Ensure old PDFs remain stable and test parallel version/approval actions.
```

### Prompt 4 — Yönetim paneli ve canlıya hazırlık

```text
Implement Phase 4 only. Add dashboard KPIs with documented metric definitions, role-aware report filters, in-app notifications, audit logs, CSV export permissions, healthcheck, structured logging, production Docker/deploy manifests, backup and restore scripts/runbook, CI security checks, accessibility and E2E test coverage. Do not claim production readiness until all release gates pass.
```

### Prompt 5 — Teknoloji portföyü

```text
Implement Phase 5 only. Add technology/product catalog, categories, approved knowledge articles with versioning, FAQ and sales discovery questions, private attachments, draft/review/publish workflow, product association to quote items, training lessons and progress. Build product detail pages focused on practical salesperson learning and accessible navigation.
```

### Prompt 6 — Proje devri ve entegrasyonlar

```text
Implement Phase 6 only. Add idempotent handoff from WON opportunity to delivery project, milestones and project tasks. Create integration interfaces and secure OAuth connector infrastructure for calendar/email without claiming an actual connection. Include webhook verification, token encryption, retries and deduplication if connectors are enabled.
```

### Prompt 7 — AI bilgi asistanı

```text
Implement Phase 7 only after review. Build permission-filtered retrieval over approved product articles and attachments with citations to source records, answer uncertainty handling, secure prompt injection defenses, usage limits, and evaluation tests. Never expose private customer data unless authorized. No fabricated product/pricing facts. Provider configuration must be optional and secrets managed safely.
```

## 12. Minimum test senaryoları

1. SALES-A, SALES-B'nin gizli firma kaydını doğrudan URL/API ile açamaz.
2. SALES-A firma oluşturur, kişi ekler, faaliyet kaydeder, görev planlar.
3. Pipeline sırası ve history veri tutarlılığıyla güncellenir.
4. LOST kaydı kayıp nedeni olmadan kapatılamaz.
5. Onay gerektiren teklif onaysız gönderilemez.
6. Teklif V1'i PDF üretildikten sonra V2 düzeltildiğinde değişmez.
7. 2 ondalıklı fiyatlar ve KDV/indirim hesapları deterministiktir.
8. Bir WON fırsattan eşzamanlı iki proje oluşturma isteği yalnız bir proje üretir.
9. Dashboard kazanım oranı doğru dönem ve payda ile hesaplanır.
10. Dövizli pipeline farklı para birimlerini kuru olmadan toplamaz.
11. Bildirim idempotency'si çift hatırlatmayı engeller.
12. Geri yükleme testi yedekten sağlam DB ve dosya eşleşmesini doğrular.
13. Loglarda parola, token ve hassas serbest metin bulunmaz.
14. Mobil ve masaüstünde ana akışlar klavye/ekran okuyucuyla kullanılabilir.

## 13. MVP dışındaki işler

Mobil native uygulama, gelişmiş stok/ERP, elektronik imza, otomatik WhatsApp gönderimi, tam e-posta senkronizasyonu, bordro/personel takip, kompleks komisyon sistemi, multi-tenant faturalandırma, gelişmiş AI tahminleme ve sürekli çağrı kaydı MVP dışındadır.

## 14. İlk canlıya geçiş kontrol listesi

- [ ] Firma verileri için içe aktarma formatı belirlendi; deneme migrasyonu yapıldı.
- [ ] Rol ve sahiplik izin testleri geçti.
- [ ] Teklif aritmetik, PDF ve versiyon testleri geçti.
- [ ] Domain, HTTPS, e-posta gönderim alan adı yapılandırıldı.
- [ ] Production/staging ayrıldı; secrets kaynak koda alınmadı.
- [ ] Yedek alma ve geri yükleme tatbikatı yapıldı.
- [ ] KVKK aydınlatma/erişim/saklama ve bulut transfer değerlendirmesi tamamlandı.
- [ ] Kullanıcı eğitimi ve kullanım rehberi hazırlandı.
- [ ] En az bir gerçek satış süreci pilot olarak tamamlandı.
- [ ] Ürün sahibi ve yönetici canlıya geçiş onayı verdi.
