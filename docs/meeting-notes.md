# Toplantı notlarını okuma ve kayıt bilgileri

Kullanıcı talebi: notu kimin, ne zaman aldığı görünmeli; okuma ve düzenleme ayrı olmalı.

- Takvim kartında not kayıt bilgileri ve **Notları oku** bağlantısı var. `/meetings/:id` sayfasında toplantı zamanı, firma, konum, gündem, notlar ve kararlar okunur. Düzenleme formu ayrı ve başlangıçta kapalıdır. Mobil hızlı not alma korunur. Toplantı bilgilerini düzenleyen genel form artık notları yeniden göndermez.
- İlk not/karar kaydeden kullanıcının ID'si, o andaki adı ve UTC kayıt zamanı; ayrıca son değiştiren kullanıcının aynı bilgileri saklanır. İsim sonradan değişse bile kayıt anındaki ad korunur. UI Europe/Istanbul gösterir; toplantı tarihi ile not tarihi ayrıdır.
- Notlar veya kararların içeriği gerçekten değişirse son kayıt bilgisi güncellenir. Konum/saat değişikliği veya aynı içeriğin tekrar gönderilmesi bilgiyi değiştirmez. Yazar ve zaman istemciden kabul edilmez. İlk yazar sonraki düzenlemelerde korunur; bu teslimat tüm eski metin sürümlerini saklayan bir geçmiş ekranı değildir.
- Eski notların yazarı/tarihi bilinmediğinden migration bunları doldurmaz. Ekran “Bilinmiyor (eski kayıt)” gösterir; sonraki düzenlemenin yazarı/tarihi kaydedilir.
- `GET /api/v1/meetings/:id` firma kapsamını uygular, erişimi olmayan kullanıcıya 404 döner. Yazma izni ve arşiv kontrolü PATCH'te korunur. OpenAPI endpoint açıklaması güncellendi; mevcut ortak Zod sözleşmesi metadata sahteciliğini reddeder.
- Migration: `20261102010000_meeting_note_authorship`, yalnız nullable alanlar ekler; mevcut notlar korunur.

Kabul senaryoları: ilk kayıt, farklı kişinin karar düzenlemesi, değişmeyen içerik, metadata sahteciliği, yetkisiz detay/yazma, eski kayıt ve oluşturma anında not; PostgreSQL entegrasyon testinde. Mobil Playwright senaryosu ayrı okuma sayfasını, yazar adını, metni, kapalı düzenleme alanını ve yatay taşma olmamasını denetler.

Yerel doğrulama: 87 entegrasyon testi, 9 Playwright senaryosu, lint, tip kontrolü ve Webpack üretim derlemesi geçti. Mobil okuma ekranı görüntüsü incelendi. Canlı sunucuya migration ve yeni imaj henüz uygulanmadı.
