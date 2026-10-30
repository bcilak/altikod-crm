# Yetki matrisi — önerilen başlangıç politikası

Tüm işlemler: aktif kullanıcı + güncel rol izni + kayıt kapsamı + gerekli alan izni. Varsayılan ret. Liste, detay, arama, CSV, rapor, dosya ve bildirim aynı kapsamı uygular.

| Kaynak/işlem | ADMIN | MANAGER | SALES | TECHNICAL | VIEWER |
|---|---|---|---|---|---|
| Kullanıcı/rol yönetimi | Tam | Yok | Yok | Yok | Yok |
| Firma/kişi | Tümü | Tümü | Sahibi/paylaşılan, paylaşım seviyesine göre | Atanmış iş için sınırlı görünüm | Atanmış, salt okunur |
| Faaliyet/fırsat | Tümü | Tümü | Kapsamındaki kayıtlar | Gerekli teknik bağlam | Atanmış, salt okunur |
| Teklif taslağı | Tam | Tam | Kapsamındaki kayıtlar | Yok | Açıkça izinli, salt okunur |
| Manuel teklif onayı | Evet | Evet | Hayır | Hayır | Hayır |
| Maliyet/marj | Ayrı izin | Ayrı izin | Varsayılan kapalı | Kapalı | Kapalı |
| Görev/toplantı | Tümü | Ekip | Kapsamındaki kayıtlar | Atanmış görevler | Atanmış, salt okunur |
| Rapor/CSV | Yetkili kapsam | Yetkili kapsam | Ayrı export izni + kapsam | Varsayılan kapalı | Varsayılan kapalı |
| Audit | Evet | Hayır | Hayır | Hayır | Hayır |
| Proje (Faz 6) | Tümü | Tümü | Firma kapsamı; yazma paylaşım seviyesine göre | Sorumlusu olduğu veya görevi bulunan proje; yazma yalnız sorumlu; ticari alanlar kapalı | Firma kapsamı, salt okunur |
| Bilgi bankası | Taslak/yayın/kaldırma | Taslak/yayın/kaldırma | Yalnız yayındaki kartlar ve dosyaları | Taslak yazar, incelemeye gönderir; yayınlayamaz | Yalnız yayındaki kartlar |
| Mesajlaşma (Faz 8; `messaging.use`, kanal için `messaging.channels.manage`) | Kanal yönetimi; kanal ve kayıt konuşmalarında gerekçeli gizleme; üyesi olmadığı özel grup/kanal ve birebir içeriğe erişim yok | Aynı; `#duyurular`'a yazar; kanal ve kayıt konuşmalarında gerekçeli gizleme | Grup/birebir; firma/fırsat konuşması firma kapsamına, yazma paylaşım seviyesine göre | Grup/birebir; yalnız görebildiği proje konuşması, fırsat/firma konuşması kapalı | Herkese açık kanal ve kapsamdaki kayıt konuşmasını okur; yalnız birebir yazar; gruba eklenemez |
| Telefon bildirimleri (Faz 9) | Yalnız kendi cihazları | Yalnız kendi cihazları | Yalnız kendi cihazları | Yalnız kendi cihazları | Yalnız kendi cihazları; içerik her bildirimde güncel erişimle hesaplanır |
| Mesaj tepkileri (Faz 9) | Konuşmaya yazabildiği yerde | Aynı | Aynı | Aynı | Yalnız birebirde |
| Akademi | Eğitim yönetimi + ilerleme raporu | Eğitim yönetimi + ilerleme raporu | Yayındaki eğitimler, yalnız kendi ilerlemesi | Yayındaki eğitimler, kendi ilerlemesi | Yayındaki eğitimler, kendi ilerlemesi |

Özel paylaşım okuma/yazma seviyesine sahiptir; paylaşma yetkisi ayrıca denetlenir. Firma sahibinin değişmesi ve paylaşım iptali bağlı kaynaklara da anında yansır. Maliyet izni genel teklif okuma izninden bağımsızdır; snapshot, audit ve dosyalarda da korunur.

Teknik görev ataması müşteri ticari geçmişini açmaz. Görev DTO'su yalnız iş için gerekli firma adı, yetkili kişi ve teknik içerik sunar. Bildirim payload'ları hassas bilgiyi kopyalamaz; okuma anında erişim tekrar kontrol edilir.

Test matrisi: doğrudan ID, list/search, nested resource, dosya URL'si, export, aggregate rapor, sahte foreign key, pasif kullanıcı, rol/paylaşım iptali, hassas alan sızıntısı.
