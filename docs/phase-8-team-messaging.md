# Faz 8 — ekip içi mesajlaşma ve belge paylaşımı

30 Ekim 2026. **Durum:** F8-01 kararları önerilen varsayılanlarla kabul edildi. **F8-02 (API çekirdeği), F8-03 (ekranlar) ve F8-04 (dosya ekleri ve virüs taraması) uygulandı ve test edildi.** Canlı akış ve bildirim (F8-05), arama/düzenleme/silme/saklama (F8-06) ve gerçek kullanıcılarla pilot (F8-07) henüz yok. Teslim kayıtları aşağıda “F8-02/03/04 teslimatı” bölümlerindedir. Faz 7 (entegrasyonlar ve AI) kapsam dışı kaldığı için bu iş Faz 8 olarak numaralandı; dış sisteme bağlanmadığı için Faz 7 kararıyla çelişmez.

## Sorun

Ekip iç yazışmayı ve dosya paylaşımını bugün WhatsApp üzerinden yapıyor. Sonuçları:

- Müşteri/teklif konuşmaları CRM kaydından kopuk; yeni katılan veya devralan kişi geçmişi göremez.
- Teklif, sözleşme taslağı, teknik doküman kişisel telefonlarda kalıyor; ayrılan çalışanla birlikte gidiyor.
- CRM'deki kayıt kapsamı (SALES-A / SALES-B ayrımı, teknik personel redaksiyonu) WhatsApp grubunda uygulanmıyor; KVKK açısından müşteri kişisel verisi kontrolsüz kişisel cihaz ve üçüncü taraf hizmette dolaşıyor.
- Denetim kaydı, saklama süresi ve silme politikası yok.

Hedef WhatsApp'ın tamamen yerine geçen bir sohbet uygulaması değil; **iş konuşmasının ve iş belgesinin CRM içinde, yetki kurallarıyla birlikte tutulması**dır. Kişisel/hızlı sohbet için WhatsApp kullanımı ekip politikası meselesidir.

## Kapsam

### Konuşma türleri

| Tür | Örnek | Üyelik | Görünürlük |
|---|---|---|---|
| Kanal | #satış, #teknik, #genel | Yönetici açar; herkes katılabilir veya davetle | Kanal herkese açıksa tüm aktif kullanıcılar |
| Özel grup | “Büyük X ihalesi ekibi” | Grup sahibi ekler/çıkarır | Yalnız üyeler |
| Birebir mesaj | iki kullanıcı | Sabit iki kişi | Yalnız iki taraf |
| Kayıt konuşması | Firma, fırsat, proje sayfasındaki “Konuşma” sekmesi | Üye tablosu yok; o kayda erişimi olan herkes | **Her okumada kayıt kapsamı yeniden denetlenir** |

Kayıt konuşması bu fazın asıl değeridir: “X firmasının teklifi ne oldu?” yazışması fırsat sayfasında, firmanın zaman çizelgesinin yanında kalır. Paylaşım geri alındığında veya firma sahibi değiştiğinde erişim anında kapanır (mevcut `access.ts` kapsamı kullanılır). Teknik personel yalnız erişebildiği proje konuşmasını görür; fırsat/teklif konuşmasını görmez.

### Mesaj

- Düz metin, en fazla 4.000 karakter. Biçimlendirme küçük bir alt kümeyle sınırlı (kalın, italik, liste, kod, bağlantı); HTML yorumlanmaz, sunucuda saklanan metin ham hâliyle tutulur ve istemcide kaçışlı çizilir.
- `@kullanıcı` bahsetme → bildirim. Kayıt konuşmasında bahsedilen kişinin o kayda erişimi yoksa bahsetme reddedilir (erişim sızdırmamak için “bu kullanıcı bu kaydı göremiyor” uyarısı verilir, kayda erişim **verilmez**).
- CRM kayıt bağlantısı (`/opportunities/…`) önizlemesi yalnız okuyanın erişebildiği kayıtlar için başlık gösterir; aksi hâlde “erişiminiz yok”.
- Tek seviyeli yanıt (thread), düzenleme 15 dakika içinde ve eski metin geçmişte tutulur; silme yumuşak silmedir (“Bu mesaj silindi”), içerik denetim/saklama süresi boyunca saklanır.
- Gönderimde istemci `clientNonce` üretir; `(authorId, clientNonce)` tekildir, ağ tekrarı çift mesaj üretmez.
- Okundu bilgisi konuşma başına `lastReadMessageId`; mesaj başına “görüldü” listesi yok (gereksiz gözetim izlenimi ve maliyet).
- Sabitleme (kanal başına en fazla 20 mesaj), sessize alma.

### Belge paylaşımı

- Mesaja en fazla 5 dosya; dosya başına önerilen sınır 20 MB.
- Türler: PDF, PNG, JPEG (mevcut imza doğrulaması) + **DOCX, XLSX, PPTX, CSV, TXT, ZIP** — karar gerekli (aşağıda). Office dosyaları ZIP kapsayıcısıdır; tür, uzantıya değil içerik imzası ve `[Content_Types].xml` kontrolüne göre belirlenir. Makrolu türler (`.docm`, `.xlsm`) reddedilir.
- Depolama mevcut `FilesService` gibi içerik hash'li, tek yazımlık özel klasörde; şifreli yedeğe dahil. Üretimde S3 uyumlu özel depolama planı (teknik plan §8) geçerliyse aynı soyutlama genişletilir.
- İndirme mevcut güvenlik başlıklarıyla (`attachment`, `nosniff`, `sandbox` CSP). Önizleme yalnız PDF ve görsel için; Office belgesi tarayıcıda çalıştırılmaz.
- **Antivirüs:** Bilgi bankasında bu açık konu olarak kaldı; dışarıdan gelen müşteri belgesi dolaşacağı için burada canlı öncesi zorunlu öneriliyor. Dosya `PENDING → CLEAN | INFECTED | FAILED` durumundan geçer; `CLEAN` olmadan indirilemez. Önerilen: aynı ortamda ClamAV (`clamd`) servisi, outbox işi olarak tarama.
- Konuşmanın **Dosyalar** sekmesi o konuşmada paylaşılan belgeleri listeler (ad, paylaşan, tarih, mesaja git).
- Kayıt konuşmasındaki dosya kayda bağlı dosya olarak firma/fırsat/proje “Dosyalar” görünümünde de listelenir.
- Kalıcı/onaylı içerik (ürün broşürü, teknik şartname) için mesajdan **“Bilgi bankasına öner”** eylemi taslak bilgi kartı açar; yayın akışı Faz 6 kurallarıyla devam eder. Sohbet, doküman yönetim sisteminin yerine geçmez.

### Bildirim ve canlılık

- Bahsetme, birebir mesaj ve yanıt gelen thread mevcut `Notification` tablosuna outbox üzerinden düşer; `dedupeKey` = `message:<id>:<userId>`. Her kanal mesajı bildirim üretmez; sayaç ile görünür.
- Bildirim içeriği mesaj metnini kopyalamaz (mevcut kural); okuma anında erişim yeniden denetlenir.
- Canlı güncelleme: **Server-Sent Events** (`GET /api/v1/messaging/stream`) + PostgreSQL `LISTEN/NOTIFY`. Redis eklenmez (mimari kararı). Olay yalnız “konuşma X'te yeni mesaj var” bilgisini taşır; istemci mesajı normal yetkili uçtan çeker. SSE kesilirse 15 sn polling'e düşer.
- E-posta bildirimi bu fazda yok; isteğe bağlı günlük özet sonraki iş.

### Arama

PostgreSQL tam metin araması (`turkish` yapılandırması) + `pg_trgm`; sonuçlar her satırda üyelik/kayıt kapsamıyla filtrelenir, önce kapsam sonra sıralama uygulanır. Dosya içeriği aranmaz, yalnız dosya adı.

### Ekranlar

- **`/messages`** (yan menüde “Mesajlar”, okunmamış sayacı ile): sol sütun Kanallar / Direkt mesajlar / Takip ettiğim kayıt konuşmaları; orta sütun mesaj akışı ve yazma alanı (sürükle-bırak dosya, yapıştırılan görsel); sağ panel üyeler, sabitlenenler, dosyalar.
- **Kayıt sayfaları:** Firma, fırsat ve proje detayında “Konuşma” sekmesi.
- **Mobil (390 px):** liste → konuşma → detay tek sütun akışı; yazma alanı klavye açıkken görünür kalır. Native mobil uygulama ve push bildirimi kapsam dışı; tarayıcıda “ana ekrana ekle” için PWA manifest değerlendirilebilir.
- Boş/yükleme/hata durumları, klavye ile gönderim (Enter / Shift+Enter), ekran okuyucu için canlı bölge.

## Kapsam dışı

WhatsApp entegrasyonu veya geçmiş WhatsApp yazışmalarının içe aktarımı, sesli/görüntülü arama, dış misafir/müşteri erişimi, uçtan uca şifreleme, native mobil uygulama ve push, mesaj tepkileri (emoji), dosya içeriğinde arama, gerçek zamanlı ortak belge düzenleme.

## Yetki taslağı

Yeni izinler: `messaging.use` (tüm aktif roller), `messaging.channels.manage` (ADMIN, MANAGER), `messaging.retention.manage` (ADMIN).

| İşlem | ADMIN | MANAGER | SALES | TECHNICAL | VIEWER |
|---|---|---|---|---|---|
| Kanal oluşturma/arşivleme | Evet | Evet | Hayır | Hayır | Hayır |
| Özel grup ve birebir | Evet | Evet | Evet | Evet | Karar gerekli (öneri: okuma + birebir) |
| Kayıt konuşması | Kayıt kapsamı | Kayıt kapsamı | Kayıt kapsamı; yazma paylaşım seviyesine göre | Erişebildiği proje | Kapsam dahilinde salt okunur |
| Başkasının özel/birebir konuşmasını okuma | **Hayır** (aşağıdaki karara bakın) | Hayır | Hayır | Hayır | Hayır |
| Başkasının mesajını gizleme (moderasyon) | Kanal ve kayıt konuşmasında, gerekçeli ve denetimli | Kanal sahibi olduğu kanalda | Hayır | Hayır | Hayır |

Pasif yapılan kullanıcı mesajları kalır, adı “(pasif)” görünür; oturumu kapatıldığı için SSE akışı da anında kesilir.

## Veri modeli taslağı

```
Conversation(id, kind CHANNEL|GROUP|DIRECT|RECORD, name?, topic?, isPublic,
             recordType? COMPANY|OPPORTUNITY|PROJECT, recordId?, directKey? unique,
             createdById, archivedAt?, createdAt)
  unique(recordType, recordId)   -- kayıt başına tek konuşma
  directKey = sıralı "userA:userB" -- birebir için tek konuşma
ConversationMember(conversationId, userId, role OWNER|MEMBER, lastReadMessageId?,
                   mutedUntil?, joinedAt, leftAt?)   -- RECORD türünde kullanılmaz
Message(id, conversationId, authorId, parentId?, body, clientNonce, editedAt?,
        deletedAt?, deletedById?, hiddenReason?, pinnedAt?, createdAt, searchVector)
  unique(authorId, clientNonce); index(conversationId, createdAt, id)
MessageRevision(id, messageId, body, createdAt)          -- düzenleme geçmişi
MessageAttachment(id, messageId, storageKey, checksum, originalName, mimeType,
                  sizeBytes, scanStatus, scannedAt?, createdAt)
MessageMention(messageId, userId)
```

Sayfalama imleç tabanlı (`createdAt, id`). Saklama süresi dolan mesajlar için zamanlanmış iş metni ve dosya bağlantısını siler, “süresi doldu” iskeletini bırakır; denetim kaydında yalnız kimlik ve tarih kalır.

## İş kuyruğu

| İş | İçerik | Bağımlılık |
|---|---|---|
| F8-01 | Ürün sahibi kararları (aşağıdaki tablo), KVKK/aydınlatma metni güncellemesi | — |
| F8-02 | Şema + migration, izinler, konuşma/üyelik/mesaj servisleri, kayıt kapsamı entegrasyonu, OpenAPI | F8-01 |
| F8-03 | `/messages` ekranı, kayıt sayfalarına “Konuşma” sekmesi, okunmamış sayaçları, polling ile çalışan ilk sürüm | F8-02 |
| F8-04 | Dosya ekleri: genişletilmiş tür doğrulaması, ClamAV taraması, “Dosyalar” sekmesi, yedek kapsamı | F8-02 |
| F8-05 | SSE + `LISTEN/NOTIFY`, bahsetme/DM bildirimleri (outbox), yeniden bağlanma | F8-03 |
| F8-06 | Arama, sabitleme, düzenleme geçmişi, moderasyon, saklama işi, “Bilgi bankasına öner” | F8-03, F8-04 |
| F8-07 | Entegrasyon + Playwright testleri, mobil kontrol, pilot ekiple WhatsApp'tan geçiş denemesi | F8-03…06 |

F8-03 sonunda polling ile kullanılabilir bir sürüm olur; canlılık (F8-05) ayrı teslimattır.

## Ürün sahibi kararları

30 Ekim 2026'da ürün sahibi önerilen varsayılanlarla devam edilmesini istedi. Yönetici erişimi ve saklama süresi için hukuki görüş yine de alınmalıdır; bu belge hukuki değerlendirme sunmaz.

| Karar | Kabul edilen varsayılan |
|---|---|
| Yöneticinin özel grup/birebir mesajlara erişimi | Uygulamada erişim yok. Hukuki talep hâlinde yalnız ADMIN'in, gerekçe girerek başlattığı ve denetim kaydına düşen dışa aktarma; kullanıcılara aydınlatma metniyle önceden bildirilir. Hukuki görüş alınmalı. |
| Saklama süresi | Kayıt konuşmaları kayıtla birlikte; kanal/grup/birebir 2 yıl; dosyalar mesajla birlikte. |
| İzinli dosya türleri ve boyut | PDF, PNG, JPEG, DOCX, XLSX, PPTX, CSV, TXT; 20 MB. ZIP yalnız gerekiyorsa (içi taranamayan arşiv riski). |
| Antivirüs | Canlı öncesi zorunlu, ClamAV; tarama başarısızsa indirme kapalı. |
| VIEWER mesajlaşabilir mi | Kanal okuma + birebir; kanal yazma kapalı. |
| İlk kanallar | #genel, #satış, #teknik, #duyurular (yalnız yönetici yazar). |
| WhatsApp geçmişi | İçe aktarılmaz; gerekli belgeler elle ilgili kayda yüklenir. |

## F8-02 teslimatı

### API (`/api/v1/messaging`, tümü `messaging.use` izni ister)

| Uç | İş |
|---|---|
| `GET conversations?kind=` | Üyesi olunan konuşmalar, tüm herkese açık kanallar, takip edilen kayıt konuşmaları; okunmamış sayıları ve `unreadTotal` |
| `POST conversations` | Kanal (`channels.manage`) veya özel grup açar |
| `POST direct` | İki kişi için tek birebir konuşmayı açar veya mevcut olanı döner |
| `POST record-conversations` | Görülebilen firma/fırsat/projenin konuşmasını ilk kullanımda oluşturur ve takip eder |
| `GET/PATCH conversations/:id` | Detay, üyeler, `canPost`/`canManage`; ad, konu, yazma kısıtı, arşiv |
| `POST conversations/:id/members`, `…/members/:userId/remove`, `…/join`, `…/leave` | Üyelik |
| `GET/POST conversations/:id/messages` | İmleçli liste (`beforeSeq`, `afterSeq`, `parentId`, `limit`) ve gönderim |
| `POST conversations/:id/read` | Okundu konumu (geri gitmez) |
| `GET users?search=` | Konuşma başlatmak için ad ve rol; e-posta/telefon dönmez |

### Uygulanan kurallar

- Görünürlük tek bir sorgu koşuluyla (`conversationScope`) uygulanır; liste, detay, mesaj, okundu ve gönderim aynı koşulu kullanır. Kayıt konuşmasında üyelik tablosu yoktur; her istekte firma (`companyScope`) veya proje (`projectScope`) kapsamı yeniden değerlendirilir.
- Yazma: kanalda üyelik (VIEWER yazamaz; `#duyurular` yalnız ADMIN/MANAGER), grup ve birebirde üyelik, firma/fırsat konuşmasında firma yazma paylaşımı ve arşivlenmemiş firma, proje konuşmasında satış için proje yazma kapsamı, teknik personel için projeyi görebilmek. VIEWER birebir dışında yazamaz ve gruba eklenemez.
- ADMIN dahil kimse üyesi olmadığı özel grup, özel kanal veya birebir konuşmayı göremez.
- Mesaj numarası (`seq`) konuşma satırı kilitlenerek boşluksuz verilir. `(yazar, clientNonce)` tekildir; tekrar eden istek aynı mesajı döner, aynı anahtarla farklı içerik 409 verir.
- Yanıtlar tek seviyelidir ve üst mesajla aynı konuşmada olmak zorundadır; PostgreSQL tetikleyicisi bunu ve mesajların değiştirilemez/silinemez olmasını uygulama dışından da korur. Düzenleme/silme F8-06'da revizyon geçmişiyle bu tetikleyici güncellenerek gelecek.
- Kanal adları küçük harfe çevrilir, `#` atılır, yalnız harf/rakam/`-`/`_` içerir; büyük-küçük harf fark etmeksizin tekildir.
- Tek grup sahibi ayrılırsa sahiplik en eski aktif üyeye geçer. Pasif kullanıcının mesajları kalır, yazar bilgisinde `isActive: false` döner; oturumu kapandığı için erişimi biter.
- Konuşma oluşturma, üyelik ve arşiv işlemleri denetim kaydına düşer; mesaj içeriği denetim kaydına kopyalanmaz.

### Plandan farklar

- Okundu konumu ayrı `ConversationReadState` tablosundadır (`lastReadMessageId` yerine `lastReadSeq`); üyelik tablosu erişim, okundu tablosu yalnız konum içindir. Kayıt konuşmasını “takip etmek” okundu satırının varlığıdır ve erişim vermez.
- Herkese açık kanallar migration ile açıldı (`#genel`, `#satış`, `#teknik`, `#duyurular`), kimse otomatik üye yapılmadı; ekran (F8-03) “Katıl” eylemini sunacak.
- Bahsetme (`@kullanıcı`) ve bildirim F8-05'e, sabitleme/sessize alma F8-06'ya kaldı.

### Doğrulama (30 Ekim 2026)

- Lint, TypeScript, birim/smoke testleri (OpenAPI'de mesajlaşma uçları dahil) ve üretim derlemesi geçti.
- 52 PostgreSQL entegrasyon kontrolü en az yetkili uygulama rolüyle geçti; bunların 10'u Faz 8: başlangıç kanalları ve yazma kısıtı, kanal yönetimi ve ad tekilliği, özel grup/birebir gizliliği (ADMIN dahil), firma paylaşımı READ/WRITE/NONE geçişlerinin aynı oturumda anında etkisi ve arşivli firma, fırsat konuşmasının teknik personele kapalı olması ve proje konuşmasında yalnız atanmış teknik personel, eşzamanlı tekrar gönderimde tek mesaj ve boşluksuz sıra, okunmamış sayıları/okundu/yanıt/sayfalama, metin doğrulaması ve DB düzeyinde değişmezlik, pasif kullanıcı. En az yetki testi uygulama rolünün mesaj tetikleyicisini kaldıramadığını da doğrular.
- Ortam notu: bu oturumdaki konteynerde önceden kurulu Chromium, projenin Playwright sürümünün beklediği klasör adında değildi; Faz 4 PDF testleri için yalnız yerelde `PLAYWRIGHT_BROWSERS_PATH` ile aynı tarayıcıya bağlantı verildi, repoda değişiklik yapılmadı. Playwright E2E senaryosu bu fazda eklenmedi (ekran yok).

## F8-03 teslimatı

### Kullanım

1. Yan menüdeki **Mesajlar** bağlantısı okunmamış toplamını gösterir (15 saniyede bir yenilenir).
2. **Mesajlar** sayfasında solda Kanallar, Birebir, Özel gruplar ve Takip edilen kayıtlar listelenir; her satırda okunmamış sayısı vardır. Katılınmamış herkese açık kanal “katılmadınız” olarak görünür, okunabilir, “Kanala katıl” ile yazılabilir hâle gelir.
3. Listenin altındaki **Yeni birebir mesaj**, **Yeni özel grup** ve (ADMIN/MANAGER için) **Yeni kanal** formlarıyla konuşma başlatılır. Kişi seçici yalnız ad ve rol gösterir. Grup formunda görüntüleyici rolündeki kişiler listelenmez.
4. Konuşma açıldığında son 50 mesaj gösterilir, “Daha eski mesajlar” ile geriye gidilir; açık konuşma 10 saniyede bir yenilenir. En yeni mesaj görüntülenince okundu konumu ilerler. Enter gönderir, Shift+Enter yeni satır açar. Gönderim başarısız olursa taslak korunur; tekrar denendiğinde aynı istek anahtarı kullanıldığından mesaj iki kez kaydedilmez.
5. Her mesajın altındaki **Yanıtla / n yanıt** tek seviyeli yanıt dizisini açar.
6. **Konuşma bilgisi** bölümünde konu, üyeler, üye ekleme/çıkarma (kanalda ADMIN/MANAGER, grupta sahip), ayrılma ve arşivleme bulunur. Yazma yetkisi yoksa nedeni (arşiv, yalnız yöneticiler, salt okunur) yazma alanının yerine gösterilir.
7. Firma, fırsat ve proje sayfalarında kapalı gelen **Konuşma** bölümü açıldığında kayıt konuşması ilk kez oluşturulur ve kullanıcı onu takip etmeye başlar; sayfayı yalnız görüntülemek takip başlatmaz. Bölüm “Mesajlar’da aç” bağlantısı içerir.
8. Mobilde (≤760 px) liste ve konuşma tek sütundur; konuşma açıkken liste gizlenir, “← Konuşmalar” ile geri dönülür, yazma alanı ekranın altında kalır.

### Güvenlik ve sınırlar

- Mesaj metni düz metin olarak çizilir; HTML yorumlanmaz. Yalnız `http(s)` adresleri bağlantıya çevrilir ve `target="_blank" rel="noopener noreferrer"` ile açılır. Plandaki küçük biçimlendirme alt kümesi (kalın, liste, kod) ve CRM kayıt bağlantısı önizlemesi uygulanmadı.
- Ekrandaki düğmeler yalnız kolaylıktır; her işlem API'de F8-02 kurallarıyla yeniden denetlenir.
- Canlı akış yoktur; yeni mesajlar en geç 10 saniye (açık konuşma) veya 15 saniye (liste ve menü sayacı) içinde görünür. Bildirim üretilmez.

### Doğrulama (30 Ekim 2026)

- Lint, TypeScript, birim/smoke testleri ve üretim derlemesi geçti; 52 PostgreSQL entegrasyon kontrolü değişmeden geçti.
- 4 Playwright senaryosu geçti. Yeni senaryo gerçek davet bağlantısıyla ikinci bir kullanıcı oluşturur ve tarayıcıda şunları doğrular: kanala katılma ve Enter ile gönderme, kişi seçiciyle birebir başlatma, bağlantının `noopener noreferrer` ile çizilmesi, karşı tarafın menüde okunmamış sayısını görmesi ve konuşmayı açınca sayacın kalkması, yanıt dizisi ve diğer tarafta yoklamayla “1 yanıt” görünmesi, firma sayfasında kayıt konuşması, erişimi olmayan kullanıcının doğrudan adresle konuşmayı görememesi, 390 px'te liste/konuşma geçişi ve yatay taşma olmaması.
- Ortam notu F8-02 ile aynı: Playwright tarayıcısı bu konteynerde yalnız yerel `PLAYWRIGHT_BROWSERS_PATH` bağlantısıyla çalıştırıldı; repoda değişiklik yok.

## F8-04 teslimatı

### Kullanım

1. Yazma alanındaki **Dosya ekle** düğmesiyle, sürükle-bırakla veya panodan yapıştırarak bir mesaja en fazla 5 dosya eklenir (her biri en fazla 20 MB). Dosya hemen yüklenir, taranır ve “Eklenecek dosyalar” listesinde görünür; gönderilene kadar yalnız yükleyen görür ve **Kaldır** ile çıkarabilir. Yalnız dosyadan oluşan mesaj gönderilebilir.
2. Gönderilen dosyalar mesajın altında görünür: görseller küçük resim, diğerleri tür etiketi, ad ve boyutla. Tıklamak dosyayı indirir. Taranmakta olan, zararlı bulunan veya taranamayan dosya bağlantısız gösterilir ve nedeni yazar; açık konuşma yenilendikçe durum güncellenir.
3. **Dosyalar** bölümü (Mesajlar'da) ve **Paylaşılan dosyalar** (kayıt sayfalarındaki Konuşma bölümünde) konuşmada paylaşılan tüm dosyaları yükleyen ve tarihle listeler.

### Kurallar

- Kabul edilen türler: PDF, PNG, JPEG, DOCX, XLSX, PPTX, CSV, TXT (F8-01 kararı; ZIP yok). Tür içerikten belirlenir: PDF/PNG/JPEG imzası; Office dosyalarında ZIP merkez dizini ve `[Content_Types].xml` okunur (boyut sınırlı); CSV/TXT geçerli UTF-8 ve ikili kontrol karakteri içermeyen metin olmalıdır. Uzantı içerikle uyuşmalıdır; yeniden adlandırılmış dosya reddedilir. Makro (`vbaProject.bin`, `macroEnabled`), şifreli ve ZIP64 Office dosyaları reddedilir.
- Tarama `clamd` INSTREAM protokolüyle yapılır; ayrıntılar `docs/operations.md` “Dosya taraması”. İndirme yalnız `CLEAN` dosyada açıktır (geliştirmede `UNSCANNED` da; production'da hiçbir zaman).
- Erişim konuşma erişimini izler: gönderilmiş dosyayı konuşmayı görebilen herkes indirir; kayıt konuşmasında paylaşım kalkınca dosya da kapanır. Yazma yetkisi olmayan dosya yükleyemez.
- Bir dosya yalnız yükleyen tarafından, yalnız kendi konuşmasındaki bir mesaja ve bir kez bağlanır; aynı istek anahtarıyla tekrar gönderim aynı mesajı döner, ek listesi farklıysa 409 verir. PostgreSQL tetikleyicisi bağlı dosyanın kimliğini (ad, tür, boyut, depolama anahtarı, mesaj) değişmez kılar, bağlı dosyanın silinmesini ve zararlı dosyanın serbest bırakılmasını engeller.
- İndirme `Content-Disposition: attachment` (yalnız görseller `?inline=1` ile küçük resim için satır içi), `nosniff` ve `sandbox` CSP ile döner. Dosyalar teklif PDF'leri ve bilgi bankasıyla aynı içerik-hash'li özel klasörde saklanır; silme yalnız hiçbir kayıt (teklif, bilgi kartı, mesaj eki) aynı dosyayı kullanmıyorsa yapılır.
- Yedekleme betiği mesaj eklerini kapsar. Aynı değişiklikle betiğin yalnız `.pdf` anahtarı kabul eden kontrolü düzeltildi: bu kontrol Faz 6'dan beri PNG/JPEG bilgi bankası ekleri olan bir veritabanında yedeği “Unsafe artifact key” hatasıyla durdururdu.

### Doğrulama (30 Ekim 2026)

- Lint, TypeScript, birim/smoke testleri ve üretim derlemesi geçti.
- 62 PostgreSQL entegrasyon kontrolü geçti (Faz 8 dosyaları için 9 yeni): üretimde tarayıcı zorunluluğu; tür tespiti (yeniden adlandırma, makro, gizli makro, düz ZIP, ikili `.txt`, bozuk dosya); taslak gizliliği ve gönderim sonrası erişim/başlıklar; tek bağlama, başkasının/başka konuşmanın dosyası, 5 dosya sınırı; boyut/ad/izin doğrulaması; zararlı yüklemenin diske yazılmadan reddi ve denetim kaydı; tarayıcı kesintisinde engelli kalma, 5 denemede `FAILED`, kesinti sonrası temiz dosyanın açılması ve zararlı dosyanın karantinaya alınıp diskten silinmesi; kayıt konuşmasında paylaşım iptaliyle dosyaya erişimin kapanması; taslak temizliği ve DB tetikleyicileri.
- Entegrasyon testleri iki kez çalıştırıldı: (1) bu konteynere kurulan **gerçek ClamAV 1.5.4 `clamd`** ile — resmî imza veritabanı ağ politikası nedeniyle indirilemediğinden yalnız EICAR test dosyasını tanıyan yerel bir imza dosyasıyla; (2) `CLAMD_HOST` verilmediğinde testin kendi başlattığı INSTREAM protokolü taklidiyle (CI yolu). Gerçek imza veritabanıyla tespit kapasitesi burada doğrulanmadı.
- 4 Playwright senaryosu geçti; mesajlaşma senaryosu PDF ve görsel eklemeyi, karşı tarafın PDF'yi indirip içeriğini doğrulamasını (Türkçe dosya adı korunarak), görselin küçük resim olarak yüklenmesini, Dosyalar listesini ve desteklenmeyen dosyanın hata mesajını kapsar.
- Ortam notları: (a) Bu konteynerde `LANG` tanımsız olduğundan başsız Chromium, ASCII dışı `filename*` adlarını “download” olarak kaydediyordu; ayrı bir deneyle sunucu başlıklarının doğru olduğu ve `LANG=C.UTF-8` ile adın doğru geldiği gösterildi, E2E bu ayarla çalıştırıldı. (b) Yedekleme betiği Docker Compose gerektirdiği ve konteynerde Docker olmadığı için yedek tatbikatı çalıştırılamadı; yalnız betiğin referans sorgusu güncel şemada denendi. Tatbikat Docker'lı ortamda tekrarlanmalıdır. (c) `deploy/compose.production.yml` ClamAV servisi ve sağlık kontrolü burada çalıştırılmadı.

## Kabul kriterleri

- SALES-B, SALES-A'nın özel firmasının/fırsatının konuşmasını, mesajlarını, dosyalarını ve arama sonuçlarını doğrudan ID, liste, arama, SSE olayı, bildirim veya dosya adresiyle göremez.
- Firma paylaşımı geri alındığında aynı oturumla sonraki mesaj okuma/yazma ve dosya indirme reddedilir; açık SSE akışı o konuşma için olay göndermez.
- Teknik personel fırsat/teklif konuşmasına erişemez; erişebildiği proje konuşmasında ticari alan sızmaz.
- Üye olmayan kullanıcı özel grubu ve başkalarının birebir konuşmasını hiçbir uçtan göremez; ADMIN dahil.
- Aynı `clientNonce` ile tekrarlanan gönderim tek mesaj, aynı bahsetme tek bildirim üretir.
- Uzantısı değiştirilmiş dosya, makrolu Office dosyası, sınır üstü boyut ve yol karakteri içeren ad reddedilir; taraması `CLEAN` olmayan dosya indirilemez.
- Mesaj metnindeki HTML/script çalıştırılmaz; bağlantılar `rel="noopener noreferrer"` ile açılır.
- Düzenleme geçmişi ve silme/gizleme işlemleri denetim kaydına düşer; silinen mesajın içeriği API yanıtında yer almaz.
- Saklama işi süresi dolan mesaj ve dosyaları kaldırır, yedek/restore tatbikatı mesaj dosyalarını kapsar.
- Zaman damgaları UTC saklanır, Europe/Istanbul gösterilir; 390 px'te yatay taşma yoktur, klavyeyle mesaj gönderilebilir.
- Pilot ekip iki hafta boyunca iş yazışmasını CRM'de yürütür; geri bildirim ve kullanım oranı kayda geçer.
