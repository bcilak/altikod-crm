# Faz 0 doğrulama kaydı

30 Ekim 2026.

## Oluşturulanlar

- MVP kapsamı, yedi fazlık iş sırası, karar listesi ve kabul senaryoları.
- Yetki matrisi, hedef ERD, fırsat/teklif durum akışları ve API taslağı.
- npm workspaces: Next.js web, NestJS API, ortak Zod şemaları.
- PostgreSQL Compose, Prisma 7 PostgreSQL adapter, teknik baseline migration.
- Liveness/readiness, OpenAPI, standart hata ve request ID altyapısı.
- Türkçe responsive başlangıç ekranı; gerçek giriş henüz yok.
- ESLint, TypeScript, Node/Supertest ve GitHub Actions tanımı.

## Doğrulanmış sonuçlar

- `npm install`: tamamlandı; son kurulum denetiminde 0 güvenlik açığı.
- `npm run setup`: gerçek PostgreSQL 17 üzerinde başarılı.
- Setup tekrar çalıştırıldı: `No pending migrations to apply`; mevcut DB korunuyor.
- Lint ve tüm workspace tip kontrolleri başarılı.
- Üç test başarılı: ortam doğrulama/redaksiyon; pagination/validation pipe; HTTP sağlık/readiness/hata/OpenAPI davranışı.
- Gerçek API `/api/v1/health`: 200, `status=ok`.
- Gerçek API `/api/v1/ready`: 200, `status=ready`; baseline DB'den okundu.
- `npm run check`: lint, typecheck, üç test ve API/web üretim derlemeleri dahil başarılı.
- Web `/login`: HTTP 200; Türkçe belge ve ürün başlığı doğrulandı.
- Web `/api/v1/ready`: proxy üzerinden gerçek API/DB `status=ready` yanıtı verdi.

## İlk denemelerde giderilen sorunlar

- Sandbox npm DNS ve HTTP loopback bağlantısını engelledi; gerekli erişimle tekrar çalıştırıldı.
- Docker servisi kapalıydı; başlatıldı, PostgreSQL healthy oldu.
- İlk seçilen bağımlılıkların audit raporunda 7 açık vardı; NestJS 12.3.2, Swagger 12.0.5 ve Prisma 7.10.1 ile son kurulumda 0 açık.

## Sınırlar

CI tanımı henüz uzak depoda çalıştırılmadı. Repoda başlangıçta Git geçmişi/remote yoktu; branch, commit veya PR oluşturulmadı. Üretim dağıtımı yapılmadı. Auth, CRM iş modülleri ve gerçek kullanıcı verisi yok. Görsel tarayıcı/ekran okuyucu QA'sı bu kayıtta tamamlanmış sayılmaz.

Sonraki iş: Faz 1 kullanıcı/rol/oturum şemaları ve izin matrisi üzerinden güvenli kimlik + firma/kişi yönetimi.
