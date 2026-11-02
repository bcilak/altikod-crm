# E-postasız kullanıcı ve parola yönetimi

Kullanıcı isteği: yönetici, SMTP olmadan hesap oluşturur ve unutulan parolayı kullanıcılar ekranından sıfırlar. E-posta yalnız giriş kimliğidir. Davet API'si korunur; bu akış ona bağlı değildir.

- `POST /api/v1/users`: ADMIN; `name`, `email`, `role`, `temporaryPassword` (12–128 karakter). Mükerrer e-posta 409. Hash/parola yanıta dönmez.
- `POST /api/v1/users/:id/password`: ADMIN; `temporaryPassword`. Kendi hesabını bu yoldan sıfırlama ve pasif hesap reddedilir; mevcut parolanın aynısı kabul edilmez.
- `POST /api/v1/auth/password/change`: geçerli oturum, Origin ve CSRF gerekir; `currentPassword`, `password`. Mevcut parola doğrulanır, yeni parola farklı ve en az 12 karakter olmalıdır. İşlem tüm oturumları kapatır; kullanıcı yeniden giriş yapar.
- Login, `/auth/me` ve kullanıcı listesinde `mustChangePassword` döner. Zorunluluk varken yalnız me, logout ve parola değiştirme yetkili endpoint'leri kullanılabilir; diğer korumalı endpoint'ler 403 döner. UI kontrolüne güvenilmez.
- Yönetici sıfırlaması oturumları, eski davet/sıfırlama tokenlarını ve push aboneliklerini aynı transaction içinde iptal eder. Geçici parolalar hashlenir; audit yalnız kullanıcı/işlem bilgisi taşır. Geçici parolayı yönetici doğrudan kullanıcıya iletir, sonradan görüntüleyemez.
- `USER_CREATE`, `ADMIN_PASSWORD_RESET`, `PASSWORD_CHANGE` audit olayları eklenmiştir. API body sözleşmeleri ortak Zod şemalarından OpenAPI'ye yansır.

Migration: `20261102000000_managed_passwords` User tablosuna default false bayrak ekler. Mevcut hesaplar zorlanmaz; yeni oluşturulan/sıfırlanan hesaplarda bayrak true olur. Üretim güncellemesinden önce DB/dosya yedeği alınmalı, migration yeni API başlatılmadan tamamlanmalıdır. Boş kurulumdaki ilk admin komutu tekrar çalıştırılmaz; production.env ve anahtarlar yeniden oluşturulmaz.

Kabul: e-posta disabled iken oluşturma, ilk giriş engeli (API ve mobil UI), doğru/yanlış eski parola, aynı parola reddi, yönetici dışı erişim reddi, CSRF, mükerrer e-posta, oturum ve token iptali, parolanın yanıta/audit'e sızmaması. Bunlar `mail.spec.ts` ve `e2e/managed-users.spec.ts` ile doğrulanır.

Doğrulama: 87 izole PostgreSQL entegrasyon kontrolü, 9 Playwright senaryosu, lint ve tip kontrolü geçti. Windows'ta Turbopack CSS işleyicisi alt süreç bağlantı hatası verdi; Webpack derlemesi ayrıca kontrol edildi. Canlı ARM64 sunucuya dağıtım ve kullanıcı kabulü ayrıca yapılmalıdır.
