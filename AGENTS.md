# IT SalesHub çalışma kuralları

- Kaynak gereksinim: `IT_SalesHub_CRM_Teknik_Plan.md`. Uygulama sırası ve önerilen kararlar `docs/roadmap.md` içindedir.
- Yalnızca istenen fazı uygula. Tamamlanmamış özelliği çalışıyor gibi gösterme; demo kimlik doğrulama geçidi oluşturma.
- Mimari: npm workspaces, Next.js web, NestJS REST API, PostgreSQL/Prisma, modüler monolit.
- API prefix `/api/v1`; API sözleşmesi OpenAPI. Sunucu doğrulaması Zod; web doğrulaması aynı sözleşmelerden yararlanır.
- Yetkilendirme varsayılan ret; rol, kayıt kapsamı ve alan izinleri birlikte değerlendirilir. UI kontrolü güvenlik sınırı değildir.
- Para işlemlerinde float kullanma. UTC sakla, Europe/Istanbul göster. Üretim sırlarını veya gerçek müşteri verisini repoya koyma.
- Kritik iş kuralları için entegrasyon testi yaz. Test sonuçlarını ve ortam engellerini dürüstçe raporla.
- Yeni özelliklerde migration, API dokümantasyonu ve faz kabul kriterlerini birlikte güncelle.
- Üretime dağıtım ayrıca kullanıcı talimatı gerektirir.
