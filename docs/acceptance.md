# Faz kabul senaryoları

Bu liste test planıdır; uygulandı/geçti iddiası değildir. Çalıştırılmış kontroller `docs/phase-0-status.md` içinde kaydedilir.

## Faz 0

- Eksik/bozuk DATABASE_URL ve geçersiz port başlangıcı durdurur, sırları hata metnine koymaz.
- `/health` DB kesintisinde de 200; `/ready` DB veya baseline eksikse 503.
- OpenAPI yalnız uygulanmış uçları içerir; iş endpoint'leri 404 döner.
- API hata yanıtında requestId bulunur; DB exception içeriği dışarı sızmaz.
- Kök web adresi `/login` ekranına gider; gerçek olmayan giriş formu veya sahte müşteri verisi yoktur.
- Temiz DB'ye migration uygulanır; ikinci deploy idempotenttir.
- Lint, typecheck, HTTP smoke testleri ve üretim build'i başarılıdır.

## Faz 1–3

- SALES-A'nın özel firması SALES-B'nin detay/liste/arama/timeline sonuçlarında görünmez.
- Yazma paylaşımı kaldırılınca mevcut oturumla sonraki istek reddedilir.
- Pasif kullanıcı ve iptal edilen oturum iş endpoint'lerine erişemez.
- Firma-A faaliyetine Firma-B kişisi/fırsatı bağlanamaz.
- Aynı görev hatırlatmasının retry işlemi ikinci bildirim oluşturmaz.
- UTC kaydı İstanbul gösteriminde doğru güne/saatte görünür; geçmiş hedef tarih gecikmiş olarak işaretlenir.
- Başarısız aşama değişikliği tarihçe bırakmaz; başarılı değişiklik tam bir olay bırakır.
- LOST gerekçesiz, açık fırsat sorumlusuz/sonraki aksiyonsuz kaydedilemez.

## Faz 4

- Decimal hesaplar yarım kuruş, yüzde indirim, farklı KDV, kesirli miktar, sıfır fiyat ve sınır değerlerde deterministiktir.
- Yetkisiz kullanıcı maliyeti API, snapshot, PDF, export veya audit üzerinden alamaz.
- Eşiği aşan ya da maliyeti eksik sürüm yönetici onayı olmadan gönderilemez.
- Onaylanan içeriğin değiştirilmesi yeni sürüm ve yeni onay gerektirir.
- V2 ve katalog/firma değişiklikleri V1 içerik ve PDF checksum'ını değiştirmez.
- İki eşzamanlı revizyon unique sürüm numaralarıyla tutarlı sonuç verir; onay/gönderim yarışı eski içeriği gönderemez.
- Teklif reddi fırsatı otomatik LOST yapmaz; kabul seçili sürümü WON kaydına bağlar.

## Faz 5 ve sonrası

- Win rate seçili kapanma döneminde WON/(WON+LOST); payda sıfırsa tanımlı boş durum. Pipeline yalnız açık fırsatlar, para birimleri ayrı.
- CSV import önizlemesi DB'yi değiştirmez; yetkisiz export engellenir.
- Aynı fırsatın tekrarlı/eşzamanlı devir isteği ikinci devir yaratmaz.
- Restore tatbikatında DB referanslarıyla private dosyalar ve checksum'lar eşleşir.
- Masaüstü/mobil ve klavye akışında firma → fırsat → teklif → karar tamamlanabilir.
- Production SMTP ayarı eksik/şifresizse API başlamaz; hata sır değeri içermez.
- Davet ve sıfırlama bağlantısı SMTP ile teslim edilir ve tek kullanımla çalışır; sıfırlama gönderim hatası mevcut/olmayan hesap için aynı yanıtı verir.
- Uygulama DB rolü şema değiştiremez, audit kaydını güncelleyemez/silemez, izin tablosuna yazamaz; tüm iş testleri bu rolle geçer.
- Gerçek pilot ve ürün sahibi onayı olmadan üretime hazır işareti verilmez.

## Faz 6

- Aynı kazanılmış fırsat için eşzamanlı iki devir isteği tek devir ve tek proje üretir; devir görevi projeye bağlıdır.
- Teknik personel projede fırsat, teklif tutarı, sözleşme bağlantısı veya kazanım gerekçesi görmez; başka teknik personelin projesine erişemez.
- Açık kilometre taşı veya açık proje görevi varken proje tamamlanamaz; eski sürümle güncelleme 409 verir; iptal kesindir.
- Satış kullanıcısı taslak/incelemedeki kartı, yayından kaldırılmış kartı ve bunların dosyalarını liste, detay veya doğrudan dosya adresiyle göremez.
- Yayınlanmış bilgi sürümü uygulama dışından da (PostgreSQL tetikleyicisi) değiştirilemez/silinemez; yeni sürüm yayınlanana kadar eski sürüm görünür.
- Ek dosya türü içerikten doğrulanır; PDF/PNG/JPEG dışı, 5 MB üstü ve yol karakteri içeren adlar reddedilir.
- Öğrenen eğitim yanıtlarında cevap anahtarını göremez; puan sunucuda hesaplanır; yalnız kendi ilerlemesi güncellenir; ilerleme raporu yalnız eğitim yöneticisine açıktır.


## Faz 8

Ayrıntı: `docs/phase-8-team-messaging.md`. F8-02'de ilk iki madde ve tekrarlanan gönderimin tek mesaj üretmesi API düzeyinde test edildi. F8-03'te erişimi olmayan kullanıcının kayıt konuşmasını doğrudan adresle açamaması, klavyeyle gönderim ve 390 px'te taşma olmaması tarayıcıda test edildi. SSE ve bildirim kısmı F8-05'te, dosya maddesi F8-04'te test edildi (tür, makro, boyut, ad ve taranmamış dosyanın indirilememesi).

- Kayıt konuşmasının mesajları, dosyaları ve arama sonuçları kayıt kapsamı dışındaki kullanıcıya hiçbir uçtan (ID, liste, arama, SSE, bildirim, dosya adresi) görünmez; paylaşım iptali anında uygulanır.
- Özel grup ve birebir konuşmalar üye olmayana, ADMIN dahil, görünmez.
- Tekrarlanan gönderim tek mesaj ve tek bildirim üretir.
- Dosya türü içerikten doğrulanır, makrolu Office dosyası reddedilir, taranmamış dosya indirilemez.
