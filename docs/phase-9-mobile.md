# Faz 9 — telefon bildirimleri, mesaj tepkileri, iPhone/Android uygulaması

30 Ekim 2026. Ürün sahibinin isteğiyle (Faz 8 sonrası öneri listesinden) uygulandı. Yazılım ve otomatik testler tamam; **gerçek iPhone/Android cihazda ve üretim HTTPS alan adında doğrulanmadı** (bu geliştirme ortamında cihaz ve alan adı yok). Canlıya geçiş kontrol listesi: `docs/go-live-checklist.md`.

## Kullanım

### Telefona / bilgisayara uygulama olarak ekleme

- **iPhone / iPad (iOS 16.4+):** Safari'de CRM'i açın → **Paylaş** → **Ana Ekrana Ekle** → **Ekle**. Ana ekrandaki **Altıkod CRM** simgesiyle tam ekran açılır. Ana ekran uygulaması Safari’den ayrı oturum kullanır; bir kez giriş yapılır. Bildirim izni yalnız bu şekilde açılan uygulamada verilebilir (Apple kısıtı).
- **Android (Chrome/Edge):** **Bildirimler → Telefon ve bilgisayar bildirimleri → Uygulamayı bu cihaza yükle** ya da tarayıcı menüsünden “Uygulamayı yükle”.
- **Bilgisayar (Chrome/Edge):** adres çubuğundaki yükleme simgesi veya aynı düğme. Yüklemeden de bildirim açılabilir.

### Bildirimleri açma

**Bildirimler** sayfasındaki **Telefon ve bilgisayar bildirimleri** bölümünde **Bu cihazda bildirimleri aç** → tarayıcı/telefon izni. Bölüm, cihaz iPhone ise ve uygulama ana ekrana eklenmemişse önce adımları gösterir; izin reddedilmişse ayarlardan nasıl açılacağını söyler. Aynı yerde:

- **Bildirim alan cihazlarınız**: her cihaz (ör. “iPhone · Safari”), eklenme ve son bildirim zamanı, **Kaldır**.
- **Kilit ekranında mesaj içeriğini göster** (cihaz başına, varsayılan **kapalı**): kapalıyken bildirim “Altıkod CRM — Yeni birebir mesaj · Ayşe” gibi görünür; açıkken “Ayşe · #satış — mesajın ilk 140 karakteri”.
- **Test bildirimi gönder**.

Bildirime dokunmak uygulamayı ilgili konuşma/görev/teklif sayfasında açar; oturum süresi (8 saat) dolmuşsa girişten sonra aynı sayfaya döner. Uygulama simgesinde okunmamış mesaj + bildirim sayısı görünür (destekleyen cihazlarda).

### Ne zaman bildirim gelir

Uygulama içi bildirim üreten her şey telefona da gider: sizden bahsedilmesi, birebir mesaj, mesaj dizinize yanıt (F8-05 kuralları, sessize alınan konuşmalar yalnız bahsetmede), görev ataması/hatırlatması/gecikmesi, teklif onayı ve geçerlilik uyarısı. Kanal mesajları ve tepkiler bildirim üretmez.

### Tepkiler

Her mesajın altında **☺+** ile 👍 Beğendim, ✅ Tamam, ❤️ Kalp, 😂 Güldüm, 👀 Bakıyorum, 🙏 Teşekkürler seçilir; aynı tepkiye tekrar dokunmak geri alır. Tepki düğmesi sayıyı ve (üzerine gelince/ekran okuyucuda) kimlerin verdiğini gösterir; kendi tepkiniz vurgulanır. Tepkiler açık sayfalarda anında görünür.

## Kurallar ve güvenlik

- **Web Push (VAPID, RFC 8291 uçtan uca şifreli içerik).** Sunucu yalnız Apple, Google, Mozilla ve Microsoft bildirim servislerine istek atar (adres izin listesi; tarayıcıdan gelen başka adresler reddedilir — sunucunun keyfi adreslere istek atması engellenir).
- **Abonelik cihaza ve kullanıcıya bağlıdır, 8 saatlik oturuma değil**; böylece telefon her gün susmaz. Abonelik şu durumlarda silinir: o cihazdan **çıkış**, **parola sıfırlama** (tüm cihazlar), **kullanıcının pasifleştirilmesi** (tüm cihazlar), bildirim servisinin “artık yok” (404/410) yanıtı, 10 ardışık hata. Kullanıcı başına en çok 10 cihaz. Aynı tarayıcıda başka kullanıcı giriş yapıp izin verirse cihaz yeni kullanıcıya geçer ve önizleme kapanır.
- **İçerik okuma anındaki erişimle hesaplanır:** erişimi kalkmış konuşma, silinmiş/gizlenmiş mesaj, görünmeyen görev/teklif için bildirim gönderilmez. Pasif kullanıcıya gönderilmez.
- **Tam bir kez:** her bildirim satırı `pushClaimedAt` ile tek bir API süreci tarafından sahiplenilir (LISTEN/NOTIFY ile anında; 30 sn'lik tarama kaçanlar için). Bir saatten eski bildirim telefona gönderilmez; özellik açılmadan önceki bildirimler geriye dönük gönderilmez. Telefon bildirimi en iyi çaba ile gönderilir; uygulama içi bildirim her zaman kalır.
- **Service worker** (`/sw.js`) yalnız bildirim gösterir ve tıklamayı yönlendirir; **hiçbir sayfayı veya API yanıtını önbelleğe almaz** (müşteri verisi cihazda saklanmaz). Bildirimdeki bağlantı yalnız site içi yola izin verir. `sw.js` önbelleksiz ve kısıtlı CSP ile sunulur.
- **Tepkiler**: sabit 6 emoji (veritabanı kısıtı), yalnız konuşmaya yazabilenler, yalnız görünür mesajlarda; silinen/gizlenen/süresi dolan mesajın tepkileri gösterilmez. Tepki bildirim üretmez.
- **Üretim**: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` olmadan API başlamaz. Anahtarlar `npm run push:keys` ile bir kez üretilir ve sır deposunda tutulur; **anahtar değişirse tüm cihazların bildirimleri yeniden açması gerekir**.

## API

| Uç | İş |
|---|---|
| `GET /api/v1/push/devices` | Sunucu durumu (`enabled`, `publicKey`) ve kullanıcının cihazları |
| `POST /api/v1/push/subscriptions` | Tarayıcının `PushSubscription.toJSON()` çıktısıyla cihaz ekler/günceller (oturuma yeniden bağlar) |
| `PATCH /api/v1/push/devices/:id` | `{ showPreview }` |
| `POST /api/v1/push/devices/:id/remove` · `POST /api/v1/push/test` | Cihazı kaldırır · test bildirimi |
| `POST /api/v1/messaging/messages/:id/reactions` | `{ emoji }` ekler veya kaldırır; mesajın güncel hâlini döner |

Mesaj yanıtlarında `reactions: [{ emoji, count, mine, names }]` (names en çok 10). Tepki ekleme/kaldırma canlı akışta `update` olayı üretir.

## Doğrulama (30 Ekim 2026)

- Lint, TypeScript, birim/smoke testleri, üretim derlemesi geçti.
- 85 PostgreSQL entegrasyon kontrolü geçti (gerçek ClamAV ile). Faz 9 testleri yerel bir sahte bildirim servisi kullanır ve gelen içeriği **tarayıcının yapacağı gibi şifresini çözerek** doğrular: izin listesi dışı adreslerin reddi; cihaz etiketi, el değiştirme, 10 cihaz sınırı; birebir mesajın LISTEN/NOTIFY ile anında, VAPID imzalı ve `aes128gcm` şifreli gitmesi, önizleme kapalıyken metnin taşınmaması, açıkken taşınması; tam bir kez gönderim; erişimi kalkan kayıt mesajının gönderilmemesi; pasifleştirmede cihaz silme; görev bildiriminin gitmesi ve 8 saatlik oturum dolduktan sonra da gitmesi; 410 yanıtında cihaz silme; çıkışta o cihazın silinmesi; tepkilerin sabit kümesi, aç/kapa, sayılar ve adlar, yetki ve silinmiş mesaj kuralı, tepkinin bildirim üretmemesi; üretimde anahtar zorunluluğu.
- 7 Playwright senaryosu geçti: Chrome'un kendi **kurulabilirlik denetimi hata vermiyor** (`Page.getInstallabilityErrors` boş), manifest/simgeler/`sw.js` başlıkları, service worker'ın etkinleşmesi; service worker'a DevTools üzerinden gönderilen bildirimin doğru başlık/metin/etiketle gösterilmesi ve site dışı bağlantının `/notifications`'a çevrilmesi; iPhone tarayıcı kimliği ve 390 px ile ana ekran adımlarının görünmesi ve taşma olmaması; tepkinin karşı sayfaya canlı yansıması.
- **Doğrulanmayanlar:** gerçek iPhone'da Ana Ekrana Ekle + izin + bildirim alma; gerçek Android/Chrome aboneliği (başsız test tarayıcısı Google bildirim servisine abone olamaz); Apple/Google servislerine gerçek gönderim; uygulama simgesi sayacı; çentik/ana ekran çubuğu güvenli alanlarının gerçek cihazdaki görünümü. Bunlar `docs/go-live-checklist.md` içinde cihaz testi olarak listelendi.
- Ortam notu: Playwright'ın hafif başsız kabuğu bildirim göstermediği için bildirim gösterim testi tam Chromium ile (`channel: 'chromium'`) çalışır.
