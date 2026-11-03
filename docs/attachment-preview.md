# Mesaj eki ön izleme — 3 Kasım 2026

Mesaj ve paylaşılan dosyalar listesindeki ekler önce erişilebilir bir modal açar; indirme yalnız ayrı İndir bağlantısından başlatılır. PNG/JPEG görüntülenir, PDF tarayıcının PDF görüntüleyicisinde açılır, TXT/CSV düz metin olarak gösterilir (ilk 200 KB). Office belgelerinde desteklenmediği açıklanır ve indirme sunulur; dış görüntüleme servisine dosya gönderilmez. PDF desteği olmayan tarayıcılarda indirme seçeneği korunur.

Mobilde içerik kaydırılır, dosya adı satıra bölünür ve kapat/indir kontrolleri içerikten ayrıdır. Escape ile kapanır, odak modal içinde kalır; kapanırken istek iptal edilir ve blob adresi serbest bırakılır. Yükleme ve hata durumları gösterilir.

API sözleşmesi değişmedi: GET /api/v1/messaging/attachments/:id mevcut oturum, konuşma erişimi ve tarama kontrolleriyle kullanılır. İndirme yanıtının Content-Disposition değeri değiştirilmedi; ön izleme istemcide alınan veriden oluşturulur. Yeni migration gerekmez.

Kabul: dosyaya dokununca otomatik indirme başlamaz; PDF modalı açılır, İndir özgün dosyayı indirir; modal kapanır; 390px telefonda resim yüklenir ve yatay taşma olmaz. Bunlar e2e/messaging.spec.ts içinde kapsanır.

Doğrulama: lint, typecheck ve Webpack üretim derlemesi başarılı. Mesajlaşma tarayıcı testi PDF ön izleme bağlantısı, özgün dosya indirme, modal kapanışı ve mobil resim yüklemesini doğruladı. Mobil ekran görüntüsü incelendi; sonrasında pencere ortalama ve düğme görünürlüğü iyileştirildi. Canlıya henüz uygulanmadı.

Son doğrulama: ikinci tam tarayıcı koşusunda 9/9 test geçti; ilk koşuda mevcut push testi bir bildirimi göremedi (8/9). Son mobil stil düzenlemesi ikinci koşuda yeniden görüntülenip doğrulandı.
