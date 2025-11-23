# Henzy Guard Framework

Discord sunucuları için geliştirilmiş profesyonel koruma sistemi. 5 ayrı bot ile çalışan bu framework, sunucunuzu yetkisiz işlemlerden korur.

## Özellikler

- **Ban Koruması** - Yetkisiz ban işlemlerini otomatik geri alır
- **Kanal Koruması** - Kanal oluşturma, silme ve düzenleme işlemlerini kontrol eder
- **Rol Koruması** - Rol değişikliklerini ve bot eklemelerini izler
- **Spam Koruması** - Reklam ve spam mesajları otomatik tespit eder
- **Whitelist Sistemi** - Güvenilir kullanıcılar için beyaz liste
- **Esnek Ceza Sistemi** - Karantina, Kick veya Ban seçenekleri
- **Sleep Mode** - 7 gün aktif olmayan whitelist kullanıcılarını otomatik "Uyku" moduna alır
- **PM2 Entegrasyonu** - Otomatik yeniden başlatma ve log yönetimi

## Gereksinimler

- Node.js v18 veya üzeri
- MongoDB Community Server
- 5 adet Discord bot tokeni
- PM2 (otomatik kurulacak)

## Kurulum

### 1. MongoDB Kurulumu

MongoDB'yi indirip kurun:
- [MongoDB Community Server İndir](https://www.mongodb.com/try/download/community)
- Kurulum sırasında "Install MongoDB as a Service" seçeneğini işaretleyin
- Varsayılan ayarlarla devam edin

Kurulum sonrası MongoDB servisinin çalıştığından emin olun:
```powershell
net start MongoDB
```

### 2. Proje Kurulumu

Projeyi indirin ve bağımlılıkları yükleyin:
```powershell
cd "Henzy Guard v1"
npm install
```

### 3. Konfigürasyon

#### Bot Tokenları
`config/tokens.json` dosyası oluşturun:
```json
{
  "CONTROLLER_TOKEN": "bot_token_1",
  "GUARD1_TOKEN": "bot_token_2",
  "GUARD2_TOKEN": "bot_token_3",
  "GUARD3_TOKEN": "bot_token_4",
  "GUARD4_TOKEN": "bot_token_5"
}
```

#### Sunucu Ayarları
`config/config.json` dosyasını düzenleyin:
```json
{
  "guildId": "SUNUCU_ID_BURAYA",
  "guildName": "Sunucu_Adı_Buraya"
}
```

#### Database Ayarları
`config/database.json` dosyası oluşturun:
```json
{
  "uri": "mongodb://127.0.0.1/henzy",
  "options": {
    "useNewUrlParser": true,
    "useUnifiedTopology": true
  }
}
```

### 4. Discord Bot Ayarları

Her 5 bot için:
1. [Discord Developer Portal](https://discord.com/developers/applications) üzerinden bot oluşturun
2. Bot tokenını kopyalayın
3. **Privileged Gateway Intents** bölümünden şu izinleri aktif edin:
   - Server Members Intent
   - Message Content Intent
4. OAuth2 → URL Generator:
   - Scopes: `bot`
   - Bot Permissions: `Administrator`
5. Oluşan davet linkini kullanarak botları sunucuya ekleyin

**ÖNEMLİ:** Bot rollerini Discord'da **en üst sıraya** taşıyın!

### 5. Botları Başlatma

```powershell
pm2 start
```

Durum kontrolü:
```powershell
pm2 status
```

Log izleme:
```powershell
pm2 logs
```

## İlk Kurulum Adımları

### 1. Log Kanallarını Oluştur
Discord'da herhangi bir kanalda:
```
.setup
```
Bu komut otomatik olarak gerekli log kanallarını oluşturur.

### 2. Whitelist Ekle
Güvenilir kullanıcıları whitelist'e ekleyin:
```
.whitelist ekle @kullanıcı
```

### 3. Ceza Türünü Ayarla
Varsayılan olarak "Karantina" modu aktiftir. Değiştirmek için:
```
.ceza kick      # Kick moduna geç
.ceza ban       # Ban moduna geç
.ceza karantina # Karantina moduna geç
```

## Komutlar

### Genel Komutlar
- `.yardım` - Tüm komutları gösterir
- `.setup` - Log kanallarını oluşturur (Admin)

### Whitelist Yönetimi
- `.whitelist ekle @kullanıcı` - Whitelist'e ekler (Owner/Admin)
- `.whitelist sil @kullanıcı` - Whitelist'ten çıkarır (Owner/Admin)
- `.whitelist liste` - Tüm whitelist kullanıcılarını listeler (Admin)

### Ceza Sistemi
- `.ceza` - Mevcut ceza türünü gösterir (Admin)
- `.ceza karantina` - Karantina moduna geçer (Admin)
- `.ceza kick` - Kick moduna geçer (Admin)
- `.ceza ban` - Ban moduna geçer (Admin)

### Karantina Yönetimi
- `.karantinaçöz @kullanıcı` - Karantinayı kaldırır (Sadece Owner)

## PM2 Komutları

```powershell
pm2 start           # Botları başlat
pm2 stop all        # Tüm botları durdur
pm2 restart all     # Tüm botları yeniden başlat
pm2 logs            # Logları izle
pm2 status          # Durum kontrolü
pm2 delete all      # Tüm botları PM2'den kaldır
```

## Nasıl Çalışır?

1. **Whitelist Sistemi**: Sadece whitelist'teki kullanıcılar yönetim işlemleri yapabilir
2. **Otomatik Koruma**: Yetkisiz işlemler anında geri alınır
3. **Ceza Sistemi**: Yetkisiz işlem yapan kullanıcılar otomatik cezalandırılır
4. **Log Sistemi**: Tüm işlemler detaylı şekilde loglanır
5. **Sleep Mode**: 7 gün aktif olmayan whitelist kullanıcıları "Uyku" rolüne alınır

## Ceza Türleri

### Karantina (Varsayılan)
- Kullanıcının tüm rolleri kaldırılır
- "Karantina" rolü verilir
- Hiçbir kanalı göremez/yazamaz
- Owner `.karantinaçöz` komutu ile kaldırabilir

### Kick
- Kullanıcı sunucudan atılır
- Tekrar girebilir

### Ban
- Kullanıcı kalıcı yasaklanır
- Manuel unban gerekir

## Sorun Giderme

### MongoDB bağlanamıyor
```powershell
net start MongoDB
```

### Botlar çalışmıyor
1. Token'ları kontrol edin
2. Bot izinlerini kontrol edin
3. Guild ID'nin doğru olduğundan emin olun

### PM2 bulamıyor
```powershell
npm install -g pm2
```

### Log'ları temizle
```powershell
pm2 flush
```

## Güvenlik Notları

- `config/tokens.json` dosyasını **asla** paylaşmayın
- Bot tokenlarını düzenli olarak yenileyin
- Whitelist'e sadece güvendiğiniz kişileri ekleyin
- Log kanallarını düzenli kontrol edin

## Destek

Sorun yaşarsanız:
1. `pm2 logs` ile hata loglarını kontrol edin
2. MongoDB servisinin çalıştığından emin olun
3. Bot izinlerini kontrol edin
4. Config dosyalarını gözden geçirin

## Lisans

Bu proje özel kullanım içindir.

---

**Not:** İlk kurulumda mutlaka `.setup` komutunu çalıştırın ve kendinizi whitelist'e ekleyin!
