# Faz 4–5 teslimatı

30 Ekim 2026. Faz numaraları `docs/roadmap.md` içindeki uygulama sırasına göredir; kaynak teknik planın özgün numaraları farklıdır. Faz 4 uygulandı. Faz 5'in yazılımı ve yerel doğrulaması uygulandı; gerçek pilot ve canlı geçiş henüz tamamlanmadı.

## Kullanım

1. Yönetici **Katalog** ekranından ürün/hizmet ve isteğe bağlı maliyet girer. SALES yalnız onaylı kartları görür; maliyet ve marj ayrı `finance.read` izniyle korunur.
2. **Teklifler → Yeni teklif** ile açık fırsat seçilir. Kalem, miktar, fiyat, iskonto, KDV ve geçerlilik kaydedilir. Tek teklif tek para birimindedir; kur çevrimi yoktur.
3. **Onaya gönder** içeriği kilitler. Varsayılan politika yöneticinin onayını gerektirir. Şirket ayarlarında açıkça etkinleştirilmiş politika, indirim üst sınırı ve marj tabanını geçen sürümü otomatik onaylayabilir. Eksik maliyet her zaman manuel onaya gider.
4. **PDF indir**, ardından **Gönderildi olarak kaydet**. Bu, manuel gönderim kaydıdır; e-posta göndermez. PDF özel klasörde SHA-256 ile saklanır. Ürün, firma, şirket ayarı veya sonraki revizyonlar eski PDF'yi değiştirmez.
5. Müşteri kabulü, dayanak notuyla fırsatı atomik olarak WON yapar ve kabul edilen sürüme bağlar. Ret fırsatı kendiliğinden LOST yapmaz. Kabul edilmiş fırsat yeniden açılamaz; kapalı fırsatta teklif onay/gönderim yapılamaz.
6. **İş devri** sorumlu, ihtiyaç özeti, hedef tarih ve isteğe bağlı HTTPS sözleşme bağlantısıyla tek devir/tek görev oluşturur. Teknik personele yalnız görevin gerekli içeriği gösterilir.
7. **Raporlar** dönem, sorumlu, sektör ve ürün adına göre filtrelenir. Pipeline güncel açık fırsatlardır; dönem kapanış ölçümlerine uygulanır. Kazanım oranı WON/(WON+LOST); kapanış tutarı fırsatın tahmini tutarıdır. Para birimleri ayrı tutulur. Yeni firma sayısında ürün filtresi uygulanmaz.
8. **CSV aktarımı** sabit UTF-8 başlıkları, 500 satır/500 KB sınırı, salt okunur önizleme, satır hataları ve kapsam içi mükerrer denetimi kullanır. Onay 15 dakika geçerlidir; tekrar gönderim aynı sonucu döndürür. CSV dışa aktarımı 10.000 kayıtla sınırlı ve Excel formül enjeksiyonuna karşı kaçışlıdır.

## Hesap ve değişmezlik kuralları

- Decimal, 40 basamak hassasiyet; para HALF_UP ile iki ondalığa yuvarlanır. Önce miktar × fiyat, ardından kalem indirimi; teklif indirimi kalan kalemlere orantılı dağıtılır. Kuruş farkı kalem sırasıyla dağıtılır. KDV indirim sonrasındadır. Maliyet miktarla çarpılır; bilinmeyen maliyet sıfır kabul edilmez.
- Revizyon ve durum komutları satır kilidi ve sürüm numarasıyla yarışmaları engeller. DRAFT dışındaki içerik ve kalemler PostgreSQL trigger'larıyla da korunur.
- PDF HTML metinleri kaçışlıdır; tarayıcı JavaScript ve dış ağ istekleri kapalıdır. PDF dizini statik web servisine açılmaz.
- Onay ve süre sonu bildirimleri tekrar anahtarıyla üretilir. Süre sonu işçisi dakikada bir çalışır.

## Tasarım

Kullanıcının Playful Geometric promptu mevcut Next.js yapısına uygulandı: sıcak kâğıt zemin, mor aksiyonlar, mint/pembe/sarı geometriler, koyu sınırlar, sert gölgeler, 17 px köşeler. Host Grotesk ve Instrument Sans fontları lisanslarıyla yerel barındırılır. Klavye odağı, azaltılmış hareket tercihi, mobil menü ve yatay tablo kaydırması korunur. Yeni sayfalar aynı tasarım sistemini kullanır.

## Doğrulama

- Lint, TypeScript, 6 birim/smoke kontrolü ve Next üretim derlemesi geçti.
- 33 PostgreSQL entegrasyon kontrolü geçti (30 Ekim 2026, tamamı en az yetkili uygulama rolüyle): izin/kapsam, maliyet redaksiyonu, onay, eşzamanlı revizyon/kabul, değişmez PDF, otomatik onay eşikleri, ret, süre sonu, CSV, rapor ve devir; ayrıca SMTP oturumuyla davet/sıfırlama teslimi, gönderim hatasında hesap varlığı sızmaması, production e-posta ayar doğrulaması ve DB rolünün DDL/audit değiştirme/izin tablosu yazma reddi.
- 2 Playwright senaryosu geçti (uygulama rolüyle; `next dev` ilk derleme gecikmesi için beklenti süresi 20 sn): mevcut CRM akışı ve teklif → PDF → kabul → devir → CSV → dashboard/rapor; 390 px mobil taşma kontrolü dahil.
- Şifreli DB+PDF yedeği ayrı geçici veritabanına geri yüklendi ve dosya checksum'ları doğrulandı. Testler gerçek kullanıcı kayıtlarına test verisi eklemez.
- `npm audit`: 0 bulgu. Container/staging sonuçları ve canlı kapıları `docs/operations.md` içinde izlenir.

## Açık canlı geçiş kapıları

Kodla kapatılanlar: SMTP e-posta adaptörü (sağlayıcıdan bağımsız, production'da zorunlu ve şifreli) ve migration/uygulama DB hesaplarının ayrılması (`docs/operations.md`).

Açık kalanlar: gerçek kullanıcı pilotu ve ürün sahibi kabulü; alan adı/TLS ve staging; e-posta sağlayıcısının seçimi, SPF/DKIM/DMARC ve gerçek teslim doğrulaması; üretim sır deposu; kalıcı dış ortam yedek saklama ve zamanlama; yük hedefleri ve ölçüm; container taraması. Bu nedenle Faz 5 bütünüyle tamamlandı veya üretime hazır kabul edilmez. Bilgi bankası, eğitim ve kapsamlı proje teslimatı Faz 6'da kalır.
