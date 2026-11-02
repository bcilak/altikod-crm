# Faz 8 pilotu — WhatsApp'tan CRM mesajlaşmasına geçiş (F8-07)

30 Ekim 2026. **Durum: hazır, başlamadı.** Yazılım tarafı (F8-02…06) uygulandı ve otomatik testlerle doğrulandı. Gerçek kullanıcılarla iki haftalık pilot yapılmadı; bu belge pilotu yürütecek kişi için plan ve kayıt şablonudur. Sonuçlar doldurulmadan Faz 8 “canlıya hazır” sayılmaz.

## Ön koşullar

| Koşul | Sorumlu | Durum |
|---|---|---|
| Staging ortamı `deploy/compose.production.yml` ile kurulu; ClamAV servisi sağlıklı, imzalar güncel | İşletim | Bekliyor |
| SMTP sağlayıcısı seçildi, davet e-postaları ulaşıyor | İşletim | Bekliyor |
| Şifreli yedek + geri yükleme tatbikatı Docker'lı ortamda mesaj ekleriyle birlikte geçti (`npm run test:integration -- --backup-drill`) | İşletim | Bekliyor (2 Kasım: Docker kullanılabilir; mesaj eklerini kapsayan tatbikat sonucu henüz kayıtlı değil) |
| Caddy üzerinden canlı akış (`/api/v1/messaging/stream`) staging alan adında anında çalışıyor | İşletim | Bekliyor |
| Aşağıdaki aydınlatma metni hukuk incelemesinden geçti ve kullanıcılara duyuruldu | Ürün sahibi + hukuk | Bekliyor |
| Yönetici erişimi (özel mesajlar) ve 2 yıllık saklama için hukuki görüş alındı | Ürün sahibi + hukuk | Bekliyor |
| Gerçek müşteri verisi yalnız staging'in onaylı veri işleme kapsamındaysa kullanılır | Ürün sahibi | Bekliyor |

## Katılımcılar ve süre

- 2 satışçı, 1 satış yöneticisi, 1–2 teknik personel, 1 yönetici (ADMIN). Süre: 10 iş günü.
- Kural: pilot süresince **iş yazışması ve iş belgeleri** CRM'de yürütülür; WhatsApp yalnız acil telefon/kişisel yazışma için kalır. Geçmiş WhatsApp yazışmaları içe aktarılmaz; gerekli belgeler ilgili firma/fırsat/proje konuşmasına elle yüklenir.

## Senaryolar (her katılımcı en az bir kez)

1. Firma sayfasında “Konuşma”yı açıp müşteriyle ilgili not yazmak; teknik personeli projenin konuşmasında @ ile anmak.
2. Teklif PDF'si, şartname (DOCX) ve fiyat tablosunu (XLSX) bir mesajla paylaşmak; karşı tarafın indirmesi.
3. Firma paylaşımı olmayan bir satışçıyı anmayı denemek → uyarıyı görmek; paylaşımı verip tekrar denemek.
4. Birebir ve özel grup yazışması; yanıt dizisi; okunmamış sayaçları ve Bildirimler.
5. 15 dakika içinde düzeltme, düzenleme geçmişi; yanlış mesajı silme; önemli mesajı sabitleme; bir konuşmayı sessize alma.
6. “Mesajlarda ara” ile geçen haftaki bir belgeyi bulmak (kelime ve dosya adı).
7. Yönetici: #genel'de bir mesajı gerekçeyle gizleyip geri açmak; özel gruplara erişemediğini görmek.
8. Teknik personel: faydalı bir mesajı “Bilgi bankasına öner” ile taslak karta çevirmek; yönetici incelemesi ve yayını.
9. Telefonda (mobil tarayıcı) okuma, yanıtlama ve dosya indirme.
10. Pasifleştirilen bir pilot hesabının mesajlarının kaldığını ve hesabın erişemediğini doğrulamak.

## Ölçümler

| Ölçüm | Hedef | Sonuç |
|---|---|---|
| Pilot ekibin iş yazışmasında CRM payı (katılımcı beyanı, gün sonu) | ≥ %80 | |
| CRM'de paylaşılan iş belgesi sayısı / WhatsApp'ta paylaşılan | CRM ağırlıklı | |
| Kayıt konuşmalarına bağlanan yazışma oranı | ≥ %50 | |
| Yanlış kişiye ulaşan bilgi (erişim hatası) | 0 | |
| Tarama nedeniyle reddedilen / bekleyen dosya | Kayıt altında | |
| Canlı bağlantı kopması şikâyeti | Kayıt altında | |
| Katılımcı memnuniyeti (1–5) | ≥ 4 | |

## Kayıt

| Tarih | Katılımcı | Senaryo / gözlem | Sorun | Önem | Çözüm |
|---|---|---|---|---|---|
| | | | | | |

## Çıkış kararı

- **Geçti:** ölçüm hedefleri tutuldu, kritik/yüksek sorun yok, ön koşulların hepsi “tamam”. Ürün sahibinin canlıya çıkış talimatı ayrıca alınır (AGENTS.md).
- **Uzat:** hedeflerin bir kısmı tutmadı; düzeltmeler sonrası bir hafta daha.
- **Geri dön:** erişim hatası veya veri kaybı görüldüyse pilot durdurulur, olay kaydı açılır; ekip geçici olarak WhatsApp'a döner, CRM'deki yazışmalar silinmez.

## Aydınlatma metni taslağı (hukuk incelemesi gerekir)

> Bu metin hukuki görüş değildir; yalnız ürünün gerçek davranışını özetler ve hukuk biriminin değerlendirmesine sunulur.

Altıkod CRM'in ekip içi mesajlaşma bölümünde yazdığınız mesajlar, paylaştığınız dosyalar, bahsettiğiniz kişiler ve okuma durumunuz şirketin iş yazışması kaydı olarak işlenir.

- **Kim görür:** Kanallardaki mesajları kanalın üyeleri (herkese açık kanallarda tüm çalışanlar), özel grup ve birebir mesajları yalnız üyeleri görür; sistem yöneticileri dahil üye olmayanlar uygulama içinden göremez. Firma, fırsat ve proje konuşmalarını o kayda erişimi olan çalışanlar görür; erişim kaldırılınca görünürlük de kalkar.
- **Moderasyon:** Kanal ve kayıt konuşmalarında yöneticiler bir mesajı gerekçe yazarak gizleyebilir; gizleme ve gerekçe denetim kaydına yazılır.
- **Düzenleme ve silme:** Mesajınızı 15 dakika içinde düzeltebilirsiniz; önceki metin düzenleme geçmişinde görünür. Sildiğiniz veya gizlenen mesaj uygulamada gösterilmez, ancak içeriği denetim ve saklama süresi boyunca sistemde tutulur.
- **Dosyalar:** Paylaşılan dosyalar virüs taramasından geçirilir; zararlı bulunanlar saklanmaz.
- **Saklama:** Kanal, grup ve birebir mesajlar 2 yıl sonra metin, düzenleme geçmişi ve dosyalarıyla birlikte silinir; yerinde yalnız “kaldırıldı” izi kalır. Firma/fırsat/proje konuşmaları ilgili kayıtla birlikte saklanır.
- **Yasal talepler:** Hukuki bir talep hâlinde özel yazışmaların dışa aktarımı yalnız gerekçeli ve denetim kaydına düşen bir süreçle yapılabilir. *(Bu süreç uygulamada henüz yoktur; hukuki görüş sonrası tasarlanacaktır.)*
- **Kişisel yazışma:** Mesajlaşma bölümü iş içindir; özel/kişisel yazışma için kullanılmaması önerilir.
