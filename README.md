# Altıkod CRM

Altıkod Digital Solutions iç satış ve müşteri yönetimi sistemi (çalışma adı: IT SalesHub).

Türkiye'deki küçük IT satış ekipleri için CRM. **Mevcut kapsam: Faz 1–3 — güvenli oturumlar, firma/kişi, faaliyet/görev/toplantı ve fırsat yönetimi.** Faz numaraları netleştirilmiş `docs/roadmap.md` sırasına aittir; teklifler ayrı Faz 4'tür. Üretime dağıtım yapılmadı.

## Yerel kurulum

Gerekenler: Node.js 24 LTS, npm, Docker Desktop (Linux containers çalışır durumda). 3000, 3001 ve 5432 portları boş olmalı.

```sh
npm ci
npm run setup
npm run admin:create
npm run dev
```

`setup` eksik `.env` dosyalarını örnekten oluşturur, yerel PostgreSQL'i başlatır, Prisma client üretir ve migration uygular. Mevcut `.env` üzerine yazmaz. Kök `.env` API çalıştırması, `apps/api/.env` Prisma CLI içindir; DATABASE_URL değişirse ikisini güncelleyin. CI ortam değişkenlerini doğrudan kullanır.

`admin:create` ilk yöneticinin e-posta ve parolasını terminalden ister; parola ekranda gösterilmez. En az 12 karakter gerekir. Mevcut aktif yönetici varsa komut durur; sonraki kullanıcıları yönetim ekranından davet edin. CI/non-interactive kullanımda `ADMIN_EMAIL`, `ADMIN_PASSWORD`, isteğe bağlı `ADMIN_NAME` ortam değişkenleri desteklenir. Hazır veya varsayılan yönetici parolası yoktur.

Tarayıcıda **http://localhost:3000** adresini kullanın. `APP_ORIGIN` varsayılanı bu adrestir; `127.0.0.1` gibi farklı origin üzerinden yazma istekleri CSRF kontrolünde reddedilir. Cookie yerelde HttpOnly/SameSite=Lax, production ortamında ayrıca Secure'dur; production için HTTPS origin zorunludur.

- Web: http://localhost:3000/login
- API liveness: http://localhost:3001/api/v1/health
- DB ve migration readiness: http://localhost:3001/api/v1/ready
- OpenAPI UI: http://localhost:3001/api/docs
- OpenAPI JSON: http://localhost:3001/api/docs-json

Liveness 200, DB'nin hazır olduğunu göstermez. Readiness baseline ve CRM izin migration'ını gerçek DB üzerinden kontrol eder ve bağlantı/migration yoksa 503 döner. Swagger üretim modunda kapalıdır. Yerel servisler loopback adresinde dinler.

## Kontroller

```sh
npm run db:generate
npm run check
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

`check`: ESLint, TypeScript, Node/Supertest smoke testleri, API ve Next üretim derlemesi. `test:integration` gerçek PostgreSQL üzerinde rol/sahiplik, CSRF, davet/sıfırlama, outbox tekrarları ve eşzamanlı fırsat geçişlerini doğrular. `test:e2e` Chromium ile masaüstü satış akışı ve mobil görev ekranını çalıştırır. Bu iki test komutu yalnız rastgele isimli `saleshub_test_*` veritabanları oluşturur ve kendi oluşturdukları DB'yi sonunda kaldırır; uygulama DB verisini silmez. Yerel DB hesabının test için CREATE DATABASE yetkisi gerekir. E2E 3100/3101 portlarını kullanır. CI tanımının bulunması uzak CI'ın çalıştığı anlamına gelmez.

Docker kapalıysa `npm run setup` durur. Docker Desktop'ı açıp tekrar çalıştırın. Docker olmadan bağımlılık üretimi ve `check` çalışabilir; gerçek readiness başarılı olamaz.

## Yapı ve kararlar

- `apps/web`: Next.js, React, Tailwind, React Hook Form, TanStack Query; Türkçe responsive CRM ekranları.
- `apps/api`: NestJS, OpenAPI, Prisma; auth, şirket, iş takibi, fırsat ve outbox modülleri.
- `packages/shared`: Zod sözleşmeleri.
- `docs/roadmap.md`: MVP kapsamı, fazlar, iş kuyruğu ve açık kararlar.
- `docs/architecture.md`: mimari, hedef ERD ve veri/hassasiyet kuralları.
- `docs/permissions.md`: önerilen yetki matrisi.
- `docs/workflows-api.md`: durum akışları ve hedef API sözleşmesi.

İkinci migration kullanıcılar, izinler, oturumlar, tek kullanımlık tokenlar, firma/kişi, faaliyet, görev/toplantı, fırsat/tarihçe, audit, rate limit, bildirim ve outbox tablolarını ekler. API ve web aynı Zod sözleşmelerini kullanır. Form kontrolleri yerel erişilebilir HTML bileşenleridir; shadcn/ui eklenmedi.

## Davet, sıfırlama, demo ve hatırlatmalar

Davet ve sıfırlama bağlantıları `MAIL_TRANSPORT` ile seçilen adaptörle iletilir. Varsayılan `local` adaptör geliştirmede bağlantıyı API çalışma dizinindeki `.local-mail` klasörüne JSON olarak yazar (`LOCAL_MAIL_DIR` ile değiştirilebilir); dışarı e-posta göndermez ve production'da reddedilir. `smtp` adaptörü herhangi bir SMTP sağlayıcısıyla (STARTTLS veya TLS) Türkçe düz metin + HTML e-posta gönderir; ayarlar `.env.example` ve `docs/operations.md` içindedir. Production yalnız şifreli SMTP ile başlar. Bağlantılar davette 48 saat, sıfırlamada 30 dakika geçerlidir, tek kullanımlıktır; token hash'i DB'de saklanır. Sıfırlama gönderimi başarısız olsa da yanıt aynıdır (hesap varlığı sızmaz); davet gönderimi başarısızsa yönetici 503 ve yeniden gönderme mesajı görür. API tokenları yanıtlarda veya loglarda göstermez.

Outbox işleyicisi API içinde 15 saniyede bir çalışır. PostgreSQL `FOR UPDATE SKIP LOCKED` ve bildirim unique anahtarı çoklu işlemci/tekrar durumlarında çift teslimi önler. Beş başarısız denemeden sonra olay `FAILED` olur; kayıtların incelenmesi ve yeniden çalıştırılması işletim rehberinde anlatılır. Tarihler UTC saklanır, arayüzde İstanbul gösterilir.

İsteğe bağlı `ALLOW_DEMO_SEED=true` ortam değişkeniyle `npm run seed:demo` yalnız açıkça DEMO işaretli kayıtlar ekler. Otomatik seed veya kullanılabilir varsayılan demo parolası yoktur; production'da seed reddedilir.

## Kalan kapsam

Teklif/revizyon/onay/PDF ve katalog **Faz 4**; CSV import/export, KPI raporları, proje devri, SMTP e-posta adaptörü, en az yetkili DB rolü ve yedek/restore **Faz 5**'te uygulandı; gerçek sağlayıcıyla teslimat, üretim dağıtımı ve pilot açık. **Faz 6** (proje teslimatı, bilgi bankası, akademi) uygulandı: `docs/phase-6.md`. Faz 7 kapsam dışı. **Faz 8** ekip içi mesajlaşmanın API'si ve ekranları (kanal, birebir, özel grup, kayıt konuşması; yoklamayla güncellenir) uygulandı; dosya paylaşımı ClamAV taramasıyla eklendi (production'da `MALWARE_SCANNER=clamd` zorunlu); canlı akış (SSE), @bahsetme ve mesaj bildirimleri, düzenleme/silme/moderasyon, sabitleme, sessize alma, Türkçe arama, saklama işi ve bilgi bankasına öneri eklendi. Gerçek kullanıcı pilotu yapılmadı: `docs/phase-8-team-messaging.md`, `docs/pilot-messaging.md`. **Faz 9**: telefon/bilgisayar bildirimleri (Web Push; production'da `WEB_PUSH_*` zorunlu), mesaj tepkileri ve iPhone/Android ana ekran uygulaması: `docs/phase-9-mobile.md`. Canlıya geçiş: `docs/go-live-checklist.md`. MFA uygulanmadı. Tam üretim güvenlik ve işletim kabulü henüz yapılmadı. İşletim ayrıntıları: `docs/phases-1-3.md`.
