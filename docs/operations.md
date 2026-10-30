# İşletim ve canlıya geçiş

## Yerel çalıştırma

PowerShell execution policy değiştirmeden `npm.cmd` kullanın. Kurulumdan sonra `npm.cmd run db:generate`, `npm.cmd run db:migrate`, `npm.cmd run dev`. PDF için `npx.cmd playwright install chromium` gerekir. Özel dosyalar `PRIVATE_FILES_DIR` veya çalışma dizinindeki `.private-files` altında tutulur; web kökü dışında kalmalıdır.

Doğrulama: `npm.cmd run check`, `npm.cmd run test:integration -- --backup-drill`, `npm.cmd run test:e2e`. Testler ayrı rastgele isimli veritabanları kullanır. `.tmp` ve `test-results` test verisidir. Gerçek müşteri verisi testlere taşınmaz.

## Şifreli yedek ve kurtarma

Docker Compose PostgreSQL çalışıyor olmalı. `MIGRATION_DATABASE_URL` (yoksa `DATABASE_URL`) sahip hesabıyla kaynak DB'yi, `PRIVATE_FILES_DIR` PDF dizinini belirler. Güvenli bir sır yöneticisinde oluşturulmuş/saklanmış 32-byte hex `BACKUP_KEY` ortam değişkeni gerekir. Anahtarı Git'e, komut satırına veya yedek dosyasının yanına yazmayın. Anahtar kaybı yedeği kullanılamaz yapar.

- `npm.cmd run backup:create`: tutarlı pg_dump ile referanslı teklif PDF'lerini, bilgi bankası dosyalarını ve mesaj eklerini (zararlı bulunup silinenler hariç) AES-256-GCM ile `.backups` içine yazar. PDF'ler eklemeli ve değişmez olduğundan dump sonrasında alınan dosya listesi snapshot'ın referanslarını kapsar.
- `npm.cmd run backup:verify -- <mutlak-yedek-yolu>`: kimliği doğrulanmış arşivi yeni geçici DB'ye ve yeni geçici dosya klasörüne geri yükler, migration ve DB/dosya SHA-256 eşleşmesini kontrol eder, yalnız kendi oluşturduğu test hedeflerini kaldırır.
- `npm.cmd run backup:recover -- <mutlak-yedek-yolu>`: aynı doğrulamayı yapar, başarılı kurtarma DB'sini ve dosya klasörünü tutar; isim/yolu çıktı olarak verir. Mevcut DB veya dosyaları ezmez, uygulama bağlantısını değiştirmez. Bu komutun kalıcı kurtarma yolu henüz ayrıca operasyonel pilotta denenmemiştir; `verify` yolu yerelde test edildi.
- `npm.cmd run backup:drill`: geçici anahtarla create/verify tatbikatı. Anahtarı saklamaz; çıktısı kalıcı kurtarma yedeği değildir.

Üretim Compose için `BACKUP_COMPOSE_FILE=deploy/compose.production.yml`, `BACKUP_IN_CONTAINER_FILES=true` seçin; PDF'ler API'nin özel volume'ünden okunur. PostgreSQL servisindeki DB hesabının yedek/tatbikat yetkileri ayrıca gerekir. `BACKUP_DIR` erişim kısıtlı harici konum olabilir. Yerel adaptör 250 MB ham payload sınırındadır; daha büyük veri için streaming/offsite çözüm gerekir. Zamanlama, offsite kopyalama, anahtar rotasyonu ve saklama politikası işletim sorumlusunca kurulmalıdır.

Olay kurtarmasında yazıları bakım moduyla durdurun, mevcut durumu ayrıca yedekleyin, ayrı hedefe recover çalıştırın, izole staging'de kayıt/PDF ve oturumları doğrulayın. Ürün sahibi onayından sonra DB bağlantısı ve özel dosya volume'ünü kurtarma hedeflerine taşıyın. Eski hedefi geri dönüş için koruyun. Kimlik bilgisi sızıntısı olayında anahtar/parola ve oturumları ayrıca iptal edin. Bu belge otomatik üretim cutover yapmaz.

## Container ve staging taslağı

`Dockerfile` Node 24 ve Playwright Chromium ile web/API imajı oluşturur; süreç root olmayan kullanıcıyla çalışır. `deploy/compose.production.yml` PostgreSQL, migration, API, web ve Caddy TLS taslağıdır. Sadece proxy 80/443 portlarını yayınlar. Bu taslak üretime dağıtılmadı.

`DOMAIN`, güçlü `POSTGRES_PASSWORD`, DB URL'leri ve SMTP bilgileri ayrı korumalı ortamdan (sır deposu) sağlanmalı. `.env` ve yerel müşteri dosyaları Docker context'ine alınmaz. Caddy sertifika alabilmek için gerçek DNS ve ulaşılabilir portlar ister.

### Veritabanı hesapları

- **Sahip/migration hesabı** (`MIGRATION_DATABASE_URL`, örnekte `saleshub`): yalnız `migrate` servisi ve yedek/kurtarma komutları kullanır.
- **Uygulama hesabı** (`APP_DB_USER` / `APP_DB_PASSWORD`, API'nin `DATABASE_URL`'i): `migrate` servisi her migration'dan sonra `scripts/db-grants.mjs` ile bu rolü oluşturur/günceller ve yetkileri yeniden verir. Rol süper kullanıcı değildir, rol/DB oluşturamaz, şema değiştiremez (CREATE/ALTER/DROP/TRUNCATE yok). `AuditLog` yalnız ekleme+okuma, `RolePermission`, `system_metadata` ve `_prisma_migrations` yalnız okumadır; diğer tablolarda SELECT/INSERT/UPDATE/DELETE vardır.
- Entegrasyon ve E2E testleri her çalışmada rastgele isimli geçici bir uygulama rolü oluşturur, tüm testleri bu rolle çalıştırır ve sonunda rolü siler; `db-roles.spec` yetki reddini PostgreSQL üzerinde doğrular.
- Parola rotasyonu: yeni `APP_DB_PASSWORD` ile `migrate` servisini yeniden çalıştırın, ardından API'yi yeni `DATABASE_URL` ile yeniden başlatın.

### E-posta (SMTP)

Production'da `MAIL_TRANSPORT=smtp` zorunludur; API eksik veya şifresiz SMTP ayarıyla başlamaz (hata yalnız alan adlarını gösterir, değerleri göstermez). Gerekenler: `SMTP_HOST`, `SMTP_PORT` (varsayılan 587), `SMTP_SECURITY` (`starttls` varsayılan, `tls` 465 için), isteğe bağlı `SMTP_USER`/`SMTP_PASSWORD` (birlikte), `MAIL_FROM` (ör. `Altıkod CRM <crm@altikod.com>`). Sağlayıcıdan bağımsızdır (Google Workspace, Microsoft 365, Yandex, kurumsal relay vb.). Gönderen alan adı için SPF, DKIM ve DMARC kayıtları sağlayıcının rehberine göre yapılmalıdır; bu kayıtlar ve gerçek teslim yerelde doğrulanmadı. URL tek kullanımlık token taşıdığından e-posta içeriği loglanmaz; başarısız sıfırlama gönderimi yalnız `mail_delivery_failed` olayı olarak loglanır.

### Dosya taraması (ClamAV)

Mesajlarda paylaşılan her dosya indirilebilir olmadan önce ClamAV ile taranır. Production'da `MALWARE_SCANNER=clamd` ve `CLAMD_HOST` zorunludur; API bunlar olmadan başlamaz. `deploy/compose.production.yml` `clamav/clamav:1.4` servisini (imza veritabanı `clamav-db` volume'ünde) başlatır ve API'yi bu servis sağlıklı olana kadar bekletir. ClamAV yaklaşık 1,5–2 GB bellek ister; ilk açılışta imzaları indirdiği için birkaç dakika sürer; imzalar container içinde `freshclam` ile güncellenir. İmza güncelliği ve bellek alarmı izlemeye bağlanmalıdır.

Akış: dosya önce bellekte taranır; zararlı bulunursa diske yazılmaz, yükleme reddedilir ve `MALWARE_BLOCKED` denetim kaydı düşer. ClamAV'a ulaşılamazsa dosya “taranıyor” durumunda saklanır ve indirilemez; API 30 saniyede bir yeniden dener, 5 denemeden sonra “tarama tamamlanamadı” durumuna alır (indirme kapalı kalır). Yeniden taramada zararlı çıkan dosya diskten silinir ve `MALWARE_DETECTED` kaydı düşer. Gönderilmemiş taslak ekler 24 saat sonra silinir. Geliştirmede `MALWARE_SCANNER=none` dosyaları “taranmadı” işaretler (asla “temiz” değil); yerelde gerçek tarama için `docker compose --profile scan up -d clamav`.

Sınırlar: tarama yalnız ClamAV imzalarının tanıdığı içerikleri yakalar; parola korumalı/şifreli Office dosyaları ve ZIP kabul edilmez, makro içeren Office dosyaları reddedilir. Bu, dosyanın güvenli olduğunun garantisi değildir.

API `/api/v1/health` süreç, `/api/v1/ready` DB hazır olma kontrolüdür. Üretimde loglar requestId, route şablonu, durum ve süre içerir; gövde, cookie ve query parametrelerini kaydetmez. İzleme, log saklama ve alarm hedefleri ayrıca bağlanmalıdır.

## Pilot kabul kaydı — bekliyor

Sorumlu satışçı + yönetici + teknik personelle gerçek staging pilotu: yeni firma, paylaşım, takip, fırsat, ürün, indirim/onay, PDF, revizyon, kabul/ret, iş devri ve rapor tutarlılığı. Ayrı satışçı özel kayıtlara ulaşamamalı; teknik personel ticari alanları görmemeli. Veri aktarım örneği, mail teslimi, gerçek TLS, yük hedefleri, container güvenlik taraması ve yedek anahtarına erişim tatbikatı sonuçları kaydedilmeli. Ürün sahibinin canlıya çıkış talimatı bundan sonra alınır.
