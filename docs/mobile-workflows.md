# Mobil çalışma akışları

2 Kasım 2026. Mevcut görev, toplantı ve mesajlaşma API'leri kullanılır; yeni tablo, migration veya yetki değişikliği yoktur.

## Kullanım

- Telefonda **Bugün / İşler / Takvim / Mesajlar** alt menüsü vardır. Teknik personelde Takvim yerine Projeler gösterilir. Diğer ekranlar ve çıkış üstteki menüdedir.
- Bugün ekranında günlük takipler raporlardan önce gelir. İşler ekranında açık göreve **Başlat**, devam eden göreve **Tamamla** ile işlem yapılır. Sunucunun sürüm ve erişim kontrolleri geçerlidir.
- Takvimde toplantının **Not al** alanı yalnız notlar ve sonraki adımı düzenler. **Notları kaydet** sunucuya kaydeder; başarı/hata ve kaydedilmemiş durum görünür. Ayrıntılı toplantı formu korunur.
- Telefon klavyesinde Enter yeni satır açar; **Gönder** mesajı gönderir. Masaüstünde Enter/Shift+Enter davranışı korunur. Konuşma listesi ve mesajlar ayrı kaydırılır; yazma alanı ve alt menü için güvenli boşluk ayrılır.
- Not, mesaj metni, seçili bahsetmeler ve yüklenmiş mesaj eki referansları uygulama içi gezinmede açık oturum belleğinde tutulur. Dosya baytları tarayıcı depolamasına yazılmaz. Sayfa yenileme, sekme kapatma veya çıkış taslakları temizler; kalıcı kayıt için Kaydet/Gönder gerekir. Yüklenmiş dosyalar sunucunun mevcut özel taslak/saklama kurallarına tabidir.
- Küçük ekranda dokunma hedefleri en az 44 px, temel düğmeler 48 px; alan yazıları 16 px. Alt güvenli alan ve görünür viewport değişiklikleri dikkate alınır. Telefon yatay konumunda da alt gezinme kullanılır.

## Kabul kontrolleri

`e2e/mobile-work.spec.ts`: dokunmatik 390 px ekranda görev başlat/tamamla; not yaz, ekran değiştir, taslağa dön, kaydet ve yenileyerek doğrula; mesajı iki satır yaz ve gönder; mesaj taslağını koru; 360 px ve 844 px yatay taşma kontrolü; daraltılmış viewport'ta gönder düğmesi erişimi.

Mevcut CRM, mesajlaşma, satış, proje ve PWA senaryoları da regresyon için çalıştırılır. Gerçek iOS/Android sistem klavyesi, cihaz ekran okuyucusu ve arka planda işletim sisteminin sekmeyi kapatması masaüstü emülasyonuyla doğrulanmış sayılmaz; cihaz pilotunda ayrıca denenmelidir.

2 Kasım doğrulaması: lint, TypeScript ve Next.js üretim derlemesi geçti. Yeni mobil akış dahil 8 Playwright senaryosu geçti. Testler geçici veritabanı ve ayrı kullanıcılarla çalıştı; mevcut müşteri kayıtları değiştirilmedi. Mobil görseller `test-results/mobile-meeting-notes.png`, `test-results/mobile-chat-work.png` ve `test-results/mobile-quick-tasks.png` altında üretilir.
