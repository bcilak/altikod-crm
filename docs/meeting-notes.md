# Toplantı notlarını okuma ve kayıt bilgileri

Madde odaklı arayüz: her dolu satır okuma ekranında ayrı numaralı karttır. `-`, `*`, `•`, `1.` veya `1)` ile başlayan satırların işareti gösterimde temizlenir; veritabanındaki metin değiştirilmez. Görüşülen konular ve kararlar ayrı bölümlerdir, madde sayıları gösterilir. Yazma alanında “Madde ekle” yeni satır açar, Enter yeni madde işareti ekler; Shift+Enter normal satır sonu bırakır. Otomatik ekran satır kaydırması yeni madde oluşturmaz. Önceki notlar korunur; uzun tek paragraf otomatik anlamlandırılıp bölünmez, kullanıcı satırlara ayırabilir. Yazar/tarih bilgileri açılır bölümde korunur. HTML çalıştırılmaz; metin React tarafından kaçışlanır. API/veri modeli değişmediği için bu arayüz güncellemesi yeni migration gerektirmez.

Kullanıcı talebi: notu kimin, ne zaman aldığı görünmeli; okuma ve düzenleme ayrı olmalı.

- Takvim kartında not kayıt bilgileri ve **Notları oku** bağlantısı var. `/meetings/:id` sayfasında toplantı zamanı, firma, konum, gündem, notlar ve kararlar okunur. Düzenleme formu ayrı ve başlangıçta kapalıdır. Mobil hızlı not alma korunur. Toplantı bilgilerini düzenleyen genel form artık notları yeniden göndermez.
- İlk not/karar kaydeden kullanıcının ID'si, o andaki adı ve UTC kayıt zamanı; ayrıca son değiştiren kullanıcının aynı bilgileri saklanır. İsim sonradan değişse bile kayıt anındaki ad korunur. UI Europe/Istanbul gösterir; toplantı tarihi ile not tarihi ayrıdır.
- Notlar veya kararların içeriği gerçekten değişirse son kayıt bilgisi güncellenir. Konum/saat değişikliği veya aynı içeriğin tekrar gönderilmesi bilgiyi değiştirmez. Yazar ve zaman istemciden kabul edilmez. İlk yazar sonraki düzenlemelerde korunur; bu teslimat tüm eski metin sürümlerini saklayan bir geçmiş ekranı değildir.
- Eski notların yazarı/tarihi bilinmediğinden migration bunları doldurmaz. Ekran “Bilinmiyor (eski kayıt)” gösterir; sonraki düzenlemenin yazarı/tarihi kaydedilir.
- `GET /api/v1/meetings/:id` firma kapsamını uygular, erişimi olmayan kullanıcıya 404 döner. Yazma izni ve arşiv kontrolü PATCH'te korunur. OpenAPI endpoint açıklaması güncellendi; mevcut ortak Zod sözleşmesi metadata sahteciliğini reddeder.
- Migration: `20261102010000_meeting_note_authorship`, yalnız nullable alanlar ekler; mevcut notlar korunur.

Kabul senaryoları: ilk kayıt, farklı kişinin karar düzenlemesi, değişmeyen içerik, metadata sahteciliği, yetkisiz detay/yazma, eski kayıt ve oluşturma anında not; PostgreSQL entegrasyon testinde. Mobil Playwright senaryosu ayrı okuma sayfasını, yazar adını, metni, kapalı düzenleme alanını ve yatay taşma olmamasını denetler.

Yerel doğrulama: 87 entegrasyon testi, 9 Playwright senaryosu, lint, tip kontrolü ve Webpack üretim derlemesi geçti. Mobil okuma ekranı görüntüsü incelendi. Canlı sunucuya migration ve yeni imaj henüz uygulanmadı.

Madde arayüzü güncellemesinde lint, tip kontrolü, Webpack derlemesi ve 9 Playwright senaryosu yeniden geçti; mobil test madde düğmesini, Enter devamını, kalıcı kaydı ve iki ayrı liste öğesini doğruladı. Yazma/okuma ekran görüntüleri incelendi. Bu kontrolde fiziksel telefon klavyesi yerine Chromium mobil emülasyonu kullanıldı.

## Toplantı sırasında hızlı not (sohbet gibi)

Kullanıcı geri bildirimi: toplantıda not alıp göndermek zahmetliydi. "Not al" artık bir mesaj yazma alanı gibi çalışır. **Konu** veya **Karar / yapılacak** seçilir, madde yazılır, Enter ya da **Ekle** ile gönderilir. Alan temizlenir ve odakta kalır. Madde listede hemen görünür. Toplu "Notları kaydet" adımı yok; her gönderim anında kaydedilir. Gönderilmemiş madde sayfa içi gezinmede korunur, sayfadan çıkarken uyarı verilir.

- `POST /api/v1/meetings/:id/notes` `{ field: 'notes' | 'outcome', text }`: madde mevcut metnin sonuna satır kilidi altında `- ` önekiyle eklenir. Aynı toplantıda not alan iki kişi birbirinin maddesini ezmez. Çok satırlı metin ayrı maddelere bölünür. Boş metin, geçersiz alan ya da 5000 karakteri aşan sonuç 400 döner. Yetki ve kayıt kapsamı PATCH ile aynıdır; yazar/tarih bilgileri aynı kuralla güncellenir.
- Önceki maddeleri düzeltmek ayrı bir moddur: **Önceki maddeleri düzenle** kayıtlı metni açar, **Düzeltmeleri kaydet** PATCH gönderir. Bu modda kaydederken, düzenleme sırasında başkasının eklediği madde üzerine yazılabilir; bu kabul edilmiş sınırlamadır.
- Hata düzeltmesi: notlar ve kararlar için sunucu sınırı 2000 karakterdi, form ise 5000 karaktere izin veriyordu. Uzun notlar bu yüzden kaydedilemiyordu. Sınır iki tarafta da 5000 oldu (`meetingNoteMaxLength`). Sütun `text` olduğu için migration gerekmez.
- Bildirimler sayfasına **Tümünü okundu işaretle** eklendi (`POST /api/v1/notifications/read-all`; yalnız kullanıcının kendi okunmamış bildirimleri).

Doğrulama: 87 PostgreSQL entegrasyon testi geçti. Yeni kontroller: eşzamanlı iki ekleme, madde öneklerinin temizlenmesi, kapsam dışı kullanıcıya 404, izleyiciye 403, boş metin ve 5000 sınırı, read-all'ın yalnız kendi bildirimlerini işaretlemesi. 9 Playwright senaryosu, lint ve tip kontrolü geçti. Mobil testte Enter ile ekleme, alanın temizlenip odakta kalması, gezinmede taslağın korunması, düzenleme modu ve okuma sayfası doğrulandı. Fiziksel telefon klavyesi yerine Chromium mobil emülasyonu kullanıldı. Canlıya henüz uygulanmadı.
