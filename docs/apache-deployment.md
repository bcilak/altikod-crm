# Apache üzerinde ilk kurulum

ARM64 sunucu için ClamAV resmi `1.5.4_base-debian13-slim` imajı kullanılır; registry manifestinde ARM64 ve AMD64 doğrulandı. İmzalar ilk açılışta indirilir ve `clamav-db` volume'ünde kalır. İmza yenileme sırasında bellek ihtiyacı artar; ClamAV için 4 GiB pay planlayın. Manifest kontrolü sunucuda sağlık/tarama testinin yerini almaz.

2 Kasım 2026: Kullanıcı boş veritabanıyla ilk canlı görüntülemeyi ve e-postayı şimdilik atlamayı seçti. Bu, pilot/yedek/cihaz kabulünün tamamlandığı anlamına gelmez.

`deploy/compose.apache.yml` bağımsız Compose dosyasıdır; production dosyasıyla birleştirilmez. `-p altikod-crm` ayrı ağ ve volume isimleri sağlar. API yalnız 127.0.0.1:18085, web yalnız 127.0.0.1:18084 üzerinde yayınlanır; PostgreSQL ve ClamAV host portu açmaz. Caddy içermez. İmaj `CRM_IMAGE` ile seçilir; önceden build edilmelidir.

`scripts/init-apache-env.mjs` güçlü DB parolaları, VAPID ve yedek anahtarını yalnız belirtilen yeni dosyaya 0600 izinle yazar, mevcut dosyayı ezmez. Sunucuda `/etc/altikod-crm` 0700 dizininde saklayın; Git'e veya sohbete koymayın. Anahtarın güvenli ayrı kopyasını alın. İmajı CRM hesabının UID/GID değerleriyle oluşturun.

`MAIL_TRANSPORT=disabled` açık kapalı-mod seçimidir. Production güvenliği (HTTPS, tarama, güvenli cookie) korunur. Davet ve parola sıfırlama isteği 503 ve açıklayıcı hata verir; hesap/token oluşturmaz, dosyaya bağlantı yazmaz, e-posta gönderilmiş gibi davranmaz. Hesap varlığına göre yanıt değişmez. İlk yönetici `docker compose ... exec api node scripts/admin.mjs` ile oluşturulur; demo seed çalıştırılmaz. SMTP hazır olduğunda ayarlar dosyaya eklenip `MAIL_TRANSPORT=smtp` yapılır ve API yeniden oluşturulur. Schema değişmediği için migration gerekmez; OpenAPI 503 yanıtı güncellendi.

Apache düzenlemesinden önce ilgili vhost dosyasının yedeğini alın. HTTPS vhost'unda `/.well-known` istisnasını koruyun; `/api/` için 18085, `/` için 18084 reverse proxy hedefi kullanın. API kuralı genel kuraldan önce gelmeli. Mevcut webmail/admin yönlendirmelerini koruyun. HTTP CRM adresini HTTPS'e yönlendirin. `ProxyPreserveHost On`, `ProxyRequests Off` ve HTTPS vhost'unda `RequestHeader set X-Forwarded-Proto "https"` kullanın. Reload öncesi `apache2ctl configtest` geçmelidir. Başka sitelerin vhost'larını değiştirmeyin.

Kabul: production ortamı disabled mail ile başlar; login çalışır; mevcut/olmayan hesap reset istekleri aynı 503 verir; davet token/kullanıcı oluşturmaz. İzole PostgreSQL entegrasyon testi bu koşulları denetler. Sunucuda ayrıca `/api/v1/ready`, login, PDF üretimi, iki tarayıcıda SSE ve telefonda kullanım doğrulanmalıdır. Bu belge bu sunucu kontrollerinin geçtiğini iddia etmez.
