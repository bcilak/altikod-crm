# İş akışları ve API sözleşmesi taslağı

Faz 1–3 endpoint'leri uygulandı: auth/users, companies/contacts/shares/timeline, activities/tasks/meetings/notifications, opportunities/stage-transitions ve ADMIN audit-logs. Teklif, katalog, CSV, rapor ve devir uçları henüz uygulanmadı. Çalışan sözleşme `/api/docs-json` üzerinden üretilir; istek gövdeleri doğrulamada kullanılan Zod şemalarından çıkarılır.

## Fırsat

NEW_LEAD → QUALIFICATION → NEEDS_ANALYSIS → SOLUTION_DESIGN → PROPOSAL → NEGOTIATION → WON/LOST. Açık aşamalar arasında ileri/geri hareket yapılabilir; her hareketin tarihçesi vardır. Açık fırsatta sorumlu ve sonraki aksiyon gereklidir. LOST kayıp nedeni gerektirir. WON kabul edilmiş sürüm veya yetkili manuel kazanım gerekçesi gerektirir. Kapanmış kaydı yeniden açma yönetici işlemi, gerekçe ve yeni tarihçe gerektirir; rapor kapanış semantiği test edilir.

Teklifin reddi fırsatı kendiliğinden LOST yapmaz. Kabul işlemi teklif sürümü ile fırsat kazanımını aynı transaction'da bağlar; tekrar gelen istek sonucu çoğaltmaz.

## Teklif

- DRAFT → PENDING_APPROVAL: içerik dondurulur, politika snapshot'ı alınır.
- PENDING_APPROVAL → APPROVED: eşik içindeyse sistem, dışında yönetici; karar audit'e yazılır.
- PENDING_APPROVAL → WITHDRAWN: düzeltme için geri çek; yeni sürüm oluştur.
- APPROVED → SENT: geçerli ve yetkili sürüm; gönderim türü/manual kaydedilir.
- SENT → ACCEPTED / REJECTED / EXPIRED / WITHDRAWN.
- APPROVED → EXPIRED / WITHDRAWN.

REJECTED müşteri reddidir; iç onay reddi ayrı onay olayı ve WITHDRAWN ile kaydedilir. ACCEPTED sonrasında revizyon mevcut kabulü sessizce değiştiremez. Müşteri kabulü için sürüm, kaydeden kullanıcı, tarih ve dayanak notu tutulur. Eski geçerli tekliflerin kabul edilebilirliği ve eşzamanlı kabul sınırı Faz 4'te açıkça test edilir; fırsatın tek seçili kabul sürümü vardır.

Durum geçişlerinde beklenen lock version ve transaction; uyumsuzluk 409. Revizyon, onay ve kabul yarış koşullarıyla test edilir. İçerik ve PDF değişmezliği, durum metadata'sının güncellenmesini engellemez.

## API ilkeleri

Prefix `/api/v1`; JSON; zaman ISO-8601 UTC; UUID; para decimal string; pagination başlangıçta `page` (1+) ve `pageSize` (1–100). Sıralama/filtre alanları allowlist. Hata: `{error:{code,message,requestId}}`. 400 doğrulama, 401 oturumsuz, 403 yetkisiz, 404 bulunamadı, 409 çakışma. Özel kayıtlarda varlık bilgisinin sızmasını önlemek için kapsam dışı ID 404 dönebilir; işlem izni eksikliği 403.

| Faz | Endpoint grubu | Temel komutlar |
|---|---|---|
| 1 | `/auth`, `/users`, `/companies`, `/contacts` | login/logout/me; invite/reset; firma/kişi CRUD, archive, paylaşım |
| 2 | `/activities`, `/tasks`, `/meetings`, `/notifications` | oluştur/güncelle, timeline, görev tamamla, okundu |
| 3 | `/opportunities` | CRUD, `/:id/stage-transitions` |
| 4 | `/products`, `/quotes`, `/quote-versions` | sürüm, request-approval, approve, withdraw, send, accept, reject, pdf |
| 5 | `/reports`, `/imports`, `/exports`, `/handoffs`, `/audit-logs` | filtreli rapor, CSV önizleme/onay, devir oluştur |

Gönderim, kabul ve devir gibi tekrar edilebilir komutlarda Idempotency-Key kullanıcı+işlem kapsamında saklanır; farklı payload ile aynı key 409 döndürür. Key saklama süresi ve response tekrar semantiği ilgili fazda tanımlanır.


## Faz 4–5 API ekleri

OpenAPI `/api/docs` yerelde tüm gövde şemalarını içerir.

- GET/POST `/products`, GET/PATCH `/products/:id`; katalog yönetimi `catalog.manage`, maliyet `finance.read`.
- GET/PATCH `/settings/sales`; ADMIN `settings.manage`, optimistic `revision`.
- GET/POST `/quotes`, GET `/quotes/:id`, PATCH `/quote-versions/:id`, POST `/quotes/:id/versions`.
- POST `/quote-versions/:id/{request-approval,approve,send,accept,reject,withdraw}`; `lockVersion` zorunlu, müşteri kararı `note` gerektirir. Revizyon `sourceVersionId` ve `expectedCurrentVersion` kullanır.
- GET `/quote-versions/:id/pdf`: kayıt kapsamı kontrolünden sonra özel dosyayı verir.
- GET `/reports/overview`, `/exports/companies`, `/exports/opportunities`: `from,to,ownerId,sector,product` filtreleri.
- POST `/imports/companies/preview` `{csv}`, POST `/imports/companies/:id/confirm`: önizleme kullanıcıya bağlıdır.
- GET `/handoffs`, POST `/handoffs/from-opportunity/:id`: aynı fırsata aynı içerikle tekrar aynı sonucu verir; farklı içerik 409.

Tutarlar JSON decimal string; 409 sürüm/benzersizlik çatışmasıdır. Maliyet ve politika marj verileri yetkisiz yanıtlara eklenmez. PDF, gönderildi ve kabul kayıtları elektronik imza veya teslim doğrulaması değildir.

## Faz 6 API ekleri

- POST `/handoffs/from-opportunity/:id` artık aynı işlemde teslimat projesini de açar ve yanıtta `projectId` döner; tekrar istek aynı projeyi döndürür.
- GET `/projects` (`status, ownerId, search`), GET/PATCH `/projects/:id` (`version` zorunlu; `status, title, ownerId, startAt, dueAt`). Geçişler: PLANNED→IN_PROGRESS/ON_HOLD/CANCELLED, IN_PROGRESS→ON_HOLD/COMPLETED/CANCELLED, ON_HOLD→IN_PROGRESS/CANCELLED, COMPLETED→IN_PROGRESS (yeniden açma); CANCELLED kesindir. COMPLETED için açık kilometre taşı ve OPEN/IN_PROGRESS proje görevi kalmamalı (409 sayıları bildirir).
- POST `/projects/:id/milestones`, PATCH `/project-milestones/:id` (`completed`), POST `/projects/:id/tasks`: proje görevi mevcut görev/hatırlatma altyapısını kullanır; görev güncellemesi `/tasks/:id` ile yapılır.
- GET `/knowledge` (`search, category, productId`), GET `/knowledge/:id`: okuyucu yalnız yayındaki ve yayından kaldırılmamış kartı görür; editör taslak, geçmiş ve yetkileri de alır.
- POST `/knowledge` `{title, category, tags, productId, content}`, PATCH `/knowledge/:id` (kart bilgileri), POST `/knowledge/:id/versions` (yeni taslak; açık taslak varsa 409), GET/PATCH `/knowledge-versions/:id` (`lockVersion`), POST `/knowledge-versions/:id/{submit,publish,reject}` (`reject` gerekçe ister), POST `/knowledge/:id/{retire,restore}`.
- POST `/knowledge/:id/attachments?name=` gövde `application/octet-stream`: tür içerikten (PDF/PNG/JPEG imzası) belirlenir, en fazla 5 MB, kart başına 20 dosya. GET `/knowledge-attachments/:id` indirme, POST `/knowledge-attachments/:id/remove`.
- GET `/courses`, GET `/courses/:id` (öğrenene `correctIndex` gönderilmez), POST `/courses`, PATCH `/courses/:id` (`version`; PUBLISHED için en az bir ders), POST `/courses/:id/lessons`, PATCH `/lessons/:id` (yalnız DRAFT eğitimde), POST `/lessons/:id/attempts` `{answers}` → `{score, passed, passPct, attempts, completed}`; hangi cevabın doğru olduğu dönmez. GET `/academy/progress` yalnız `academy.manage`.

