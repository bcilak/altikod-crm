# Faz 6 teslimatı — proje teslimatı, bilgi bankası, akademi

30 Ekim 2026. Faz numarası `docs/roadmap.md` sırasına göredir. Faz 7 (entegrasyonlar ve AI) ürün sahibinin kararıyla kapsam dışıdır.

## Kullanım

1. **Proje teslimatı.** İş devri ekranında kazanılan fırsat devredildiğinde aynı işlemde bir teslimat projesi açılır; devir görevi projenin ilk görevidir. Migration, mevcut devirlerden de proje oluşturur. Proje ekranında durum değiştirilir, kilometre taşı ve proje görevi eklenir. Proje görevleri mevcut görev ekranında ve hatırlatmalarda görünür.
2. **Kurallar.** Fırsat başına tek proje (veritabanında benzersiz). Durum geçişleri sabittir; iptal kesindir, tamamlanan proje yeniden açılabilir. Tamamlamak için tüm kilometre taşları ve açık proje görevleri kapanmış olmalıdır. Eşzamanlı düzenleme `version` ile 409 verir.
3. **Teknik personel.** Sorumlusu olduğu veya görevi bulunan projeyi görür; yalnız sorumlusu olduğu projeyi yönetir, sorumluyu değiştiremez. Fırsat, teklif tutarı, sözleşme bağlantısı ve kazanım gerekçesi yanıtta hiç yer almaz.
4. **Bilgi bankası.** Kart: başlık, kategori, etiketler, isteğe bağlı ürün bağlantısı; içerik: özet, ürün sürümü, teknik özellikler, kullanım alanları, ideal müşteri, satış cümlesi, ihtiyaç keşif soruları, itiraz yanıtları, SSS, kısıtlar. Akış: Taslak → İncelemede → Yayında (önceki yayın “Eski sürüm” olur). Yönetici gerekçeyle geri gönderebilir. Kart başına tek açık taslak vardır; yeni sürüm yayınlanana kadar satış ekibi önceki sürümü görür. Katalogdaki ürün kartından “Bilgi kartları” bağlantısıyla ilgili kartlara gidilir.
5. **Dosyalar.** PDF, PNG ve JPEG; en fazla 5 MB, kart başına 20 dosya. Tür, dosya adına göre değil içeriğin ilk baytlarına göre belirlenir. Dosyalar teklif PDF'leriyle aynı özel klasörde, içerik hash'iyle saklanır ve şifreli yedeğe dahildir. Dosyalar kart düzeyindedir (sürümlenmez); kart yayındayken satış ekibi indirebilir, kaldırılan dosya listeden çıkar ama yedek/denetim için diskte kalır.
6. **Akademi.** Eğitim → sıralı dersler → isteğe bağlı kısa test (2–6 seçenekli, en fazla 20 soru) ve başarı eşiği. Ders bir bilgi kartına bağlanabilir; öğrenen yalnız yayındaki kart bağlantısını görür. Eğitim yayındayken dersler değiştirilemez; düzenlemek için taslağa alınır, kazanılan ilerleme korunur. Puan sunucuda hesaplanır, en iyi puan ve deneme sayısı tutulur; ders bir kez geçilince tamamlanmış kalır. Yönetici “Ekip ilerlemesi” tablosunu görür.

## Güvenlik ve veri kuralları

- Yeni izinler: `projects.read/write`, `knowledge.read/write/publish`, `academy.read/manage` (`docs/permissions.md`). Kayıt kapsamı servis katmanında ayrıca uygulanır.
- Yayınlanmış ve eski bilgi sürümleri PostgreSQL tetikleyicisiyle kilitlidir: içerik ve yayın kaydı değiştirilemez, silinemez; incelemedeki içerik donuktur.
- Cevap anahtarı (`correctIndex`) yalnız `academy.manage` sahiplerine seçilir; deneme yanıtı yalnız puanı döner. Testler sınırsız tekrar edilebilir; bu, eğitim amaçlı bir tercihtir ve sınav güvenliği iddiası taşımaz.
- Dosya indirme `Content-Disposition: attachment`, `nosniff` ve `sandbox` CSP ile döner; ad başlığa güvenli biçimde kodlanır.
- Tüm yazma işlemleri denetim kaydına düşer; deneme kayıtlarında cevaplar değil yalnız puan tutulur.

## Doğrulama (30 Ekim 2026)

- Lint, TypeScript, birim/smoke testleri ve üretim derlemesi geçti.
- 42 PostgreSQL entegrasyon kontrolü geçti (tamamı en az yetkili uygulama rolüyle); Faz 6 için 8 senaryo: eşzamanlı devirde tek proje, kapsam ve teknik redaksiyon, sorumlu/atanan yetkileri, tamamlanma kuralları ve sürüm çakışması, taslak/dosya gizliliği ve dosya doğrulaması, inceleme–yayın akışı ve tetikleyici, yayından kaldırma, akademi puanlama ve cevap anahtarı gizliliği.
- 3 Playwright senaryosu geçti; Faz 6 senaryosu proje kilometre taşı ekleme, bilgi kartı oluşturma–inceleme–yayın, test çözme ve 390 px mobil taşma kontrolünü içerir.
- Şifreli yedek tatbikatı bilgi bankası dosyalarını da içerecek şekilde geçti.

## Açık konular

- Gerçek kullanıcılarla pilot Faz 5 kapılarıyla birlikte yapılacak; içerik sahipliği ve yayın onaycıları ürün sahibince belirlenmeli.
- Dosya tarama (antivirüs) yok; yalnız tür imzası ve boyut denetlenir.
- Ders sırası ekleme sırasıdır; sürükle-bırak yeniden sıralama yok.
