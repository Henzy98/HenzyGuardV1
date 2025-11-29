# Henzy Guard Framework v1.1.0

Discord sunucuları için geliştirilmiş profesyonel koruma sistemi. 5 ayrı bot ile çalışan bu framework, sunucunuzu yetkisiz işlemlerden korur ve otomatik yedekleme sistemi ile verilerinizi güvende tutar.

## ✨ Özellikler

### 🛡️ Koruma Sistemleri

- **Ban Koruması** - Yetkisiz ban işlemlerini otomatik geri alır
- **Kanal Koruması** - Kanal oluşturma, silme ve düzenleme işlemlerini kontrol eder
- **Rol Koruması** - Rol değişikliklerini ve bot eklemelerini izler
- **Spam Koruması** - Reklam ve spam mesajları otomatik tespit eder

### 💾 Backup Sistemi (YENİ!)

- **Otomatik Yedekleme** - 2 dakikada bir otomatik sunucu yedeği
- **Manuel Yedekleme** - `.backup` komutu ile anında yedek alma
- **Yedek Listeleme** - Sayfalama ile tüm yedekleri görüntüleme
- **Yedek Geri Yükleme** - Tek komutla sunucuyu eski haline döndürme
- **Görünmez Mod** - DIST botları invisible modda çalışır

### 🔐 Güvenlik Özellikleri

- **Whitelist Sistemi** - Güvenilir kullanıcılar için beyaz liste
- **Esnek Ceza Sistemi** - Karantina, Kick veya Ban seçenekleri
- **Rate Limiting** - Hızlı işlem koruması
- **Bot Self-Guard** - Botlar birbirini guardlamaz

### 😴 Uyku Modu (YENİ!)

- **Otomatik Uyku Modu** - Whitelist kullanıcıları offline olunca otomatik "Uyku" rolüne alınır
- **Rol Kaydetme** - Tüm roller kaydedilir ve online olunca geri verilir
- **Sunucudan Çıkma Koruması** - Sunucudan çıkınca da roller kaydedilir

### 🎯 Diğer Özellikler

- **Ses Kanalı Entegrasyonu** - Botlar belirtilen ses kanalında sürekli aktif kalır
- **PM2 Entegrasyonu** - Otomatik yeniden başlatma ve log yönetimi
- **Detaylı Loglama** - Tüm işlemler ayrı kanallarda loglanır

## 📋 Gereksinimler

- Node.js v18 veya üzeri
- MongoDB Community Server veya MongoDB Atlas
- 6 adet Discord bot tokeni (Controller + 3 Guard + 2 DIST)
- PM2 (otomatik kurulacak)

## 🚀 Kurulum

### 1. MongoDB Kurulumu

**Yerel MongoDB:**

- [MongoDB Community Server İndir](https://www.mongodb.com/try/download/community)
- Kurulum sırasında "Install MongoDB as a Service" seçeneğini işaretleyin
- Varsayılan ayarlarla devam edin

Kurulum sonrası MongoDB servisinin çalıştığından emin olun:

```powershell
net start MongoDB
```

**MongoDB Atlas (Bulut):**

- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) üzerinden ücretsiz cluster oluşturun
- Connection string'i kopyalayın
- `config/database.json` dosyasına yapıştırın

### 2. Proje Kurulumu

```powershell
cd "HenzyGuardV1 - Kopya"
npm install
```

### 3. Konfigürasyon

#### Bot Tokenları ve ID'leri

`config/tokens.json` dosyası oluşturun:

```json
{
    "CONTROLLER_TOKEN": "YOUR_CONTROLLER_TOKEN_HERE",
    "CONTROLLER_BOT_ID": "YOUR_CONTROLLER_BOT_ID_HERE",
    
    "GUARD1_TOKEN": "YOUR_GUARD1_TOKEN_HERE",
    "GUARD1_BOT_ID": "YOUR_GUARD1_BOT_ID_HERE",
    
    "GUARD2_TOKEN": "YOUR_GUARD2_TOKEN_HERE",
    "GUARD2_BOT_ID": "YOUR_GUARD2_BOT_ID_HERE",
    
    "GUARD3_TOKEN": "YOUR_GUARD3_TOKEN_HERE",
    "GUARD3_BOT_ID": "YOUR_GUARD3_BOT_ID_HERE",
    
    "DIST_TOKENS": [
        "YOUR_DIST1_TOKEN_HERE",
        "YOUR_DIST2_TOKEN_HERE"
    ],
    "DIST_BOT_IDS": [
        "YOUR_DIST1_BOT_ID_HERE",
        "YOUR_DIST2_BOT_ID_HERE"
    ]
}
```

**Bot Token Nasıl Alınır:**

1. [Discord Developer Portal](https://discord.com/developers/applications) → Applications
2. Botunuzu seçin → Bot → Token → Reset Token → Copy

**Bot ID Nasıl Alınır:**

1. Discord → Ayarlar → Gelişmiş → Geliştirici Modu'nu aç
2. Botu etiketle (mention) ve mesaja sağ tık → ID'yi Kopyala
3. Ya da bot profiline sağ tık → ID'yi Kopyala

**Neden Bot ID Gerekli:**

- Botların birbirini guardlamaması için
- Whitelist sisteminde otomatik bot tanıma
- Uyku modu ve ceza sisteminde bot istisnaları

#### Sunucu Ayarları

`config/config.json` dosyasını düzenleyin:

```json
{
    "_henzySignature": "HENZY_GUARD_FRAMEWORK_V1_PROTECTED",
    "_requireHenzyVar": true,
    "guildId": "SUNUCU_ID_BURAYA",
    "guildName": "Sunucu_Adı_Buraya",
    "logChannels": {
        "category": "Server-Logs",
        "guardLogs": "guard-logs",
        "messageLogs": "message-logs",
        "modLogs": "mod-logs",
        "securityLogs": "security-logs",
        "roleLogs": "role-logs",
        "channelLogs": "channel-logs"
    },
    "sleepMode": {
        "sleepRoleName": "Uyku",
        "inactiveDays": 7
    },
    "voiceChannel": {
        "channelId": "SES_KANAL_ID_BURAYA",
        "enabled": true
    },
    "punishment": {
        "type": "quarantine",
        "quarantineRoleName": "Karantina"
    },
    "rateLimit": {
        "enabled": true,
        "timeWindowMinutes": 10,
        "maxBans": 3,
        "maxKicks": 5,
        "maxRoleChanges": 10,
        "maxChannelChanges": 5
    },
    "backup": {
        "enabled": true,
        "intervalMinutes": 2,
        "backupLogChannel": "backup-logs",
        "backupFolder": "./backups",
        "maxBackups": 50
    }
}
```

#### Database Ayarları

`config/database.json` dosyası oluşturun:

**Yerel MongoDB:**

```json
{
  "uri": "mongodb://127.0.0.1/henzy",
  "options": {
    "useNewUrlParser": true,
    "useUnifiedTopology": true
  }
}
```

**MongoDB Atlas:**

```json
{
  "uri": "mongodb+srv://username:password@cluster.mongodb.net/henzy?retryWrites=true&w=majority",
  "options": {
    "useNewUrlParser": true,
    "useUnifiedTopology": true
  }
}
```

### 4. Discord Bot Ayarları

Her 6 bot için:

1. [Discord Developer Portal](https://discord.com/developers/applications) üzerinden bot oluşturun
2. Bot tokenını kopyalayın
3. **Privileged Gateway Intents** bölümünden şu izinleri aktif edin:
   - Server Members Intent
   - Message Content Intent
   - Presence Intent
4. OAuth2 → URL Generator:
   - Scopes: `bot`
   - Bot Permissions: `Administrator`
5. Oluşan davet linkini kullanarak botları sunucuya ekleyin

**ÖNEMLİ:** Bot rollerini Discord'da **en üst sıraya** taşıyın (sunucu sahibi rolünün hemen altına)!

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

## 🎮 İlk Kurulum Adımları

### 1. Log Kanallarını Oluştur

Discord'da herhangi bir kanalda:

```
.setup
```

Bu komut otomatik olarak gerekli log kanallarını oluşturur:

- `guard-logs` - Guard işlemleri
- `message-logs` - Mesaj logları
- `mod-logs` - Moderasyon işlemleri
- `security-logs` - Güvenlik ve uyku modu logları
- `role-logs` - Rol değişiklikleri
- `channel-logs` - Kanal değişiklikleri
- `backup-logs` - Backup işlemleri

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

## 📝 Komutlar

### Genel Komutlar

- `.yardım` veya `.help` - Tüm komutları gösterir
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

### Backup Yönetimi (YENİ!)

- `.backup` veya `.backup al` - Manuel yedek alır (Admin)
- `.backup liste` - Tüm yedekleri listeler (Admin)
- `.backup liste <sayfa>` - Belirli sayfadaki yedekleri gösterir
- `.backup yükle <backup_id>` - Yedeği yükler (Owner)

## 🔧 PM2 Komutları

```powershell
pm2 start           # Botları başlat
pm2 stop all        # Tüm botları durdur
pm2 restart all     # Tüm botları yeniden başlat
pm2 logs            # Logları izle
pm2 logs henzy-controller  # Sadece controller logları
pm2 status          # Durum kontrolü
pm2 delete all      # Tüm botları PM2'den kaldır
pm2 flush           # Logları temizle
```

## 🛠️ Nasıl Çalışır?

### Koruma Sistemi

1. **Whitelist Sistemi**: Sadece whitelist'teki kullanıcılar yönetim işlemleri yapabilir
2. **Otomatik Koruma**: Yetkisiz işlemler anında geri alınır
3. **Ceza Sistemi**: Yetkisiz işlem yapan kullanıcılar otomatik cezalandırılır
4. **Log Sistemi**: Tüm işlemler detaylı şekilde loglanır

### Uyku Modu

1. Whitelist kullanıcısı **offline** olunca:
   - Tüm rolleri kaydedilir
   - "Uyku" rolü verilir
   - Diğer roller kaldırılır
2. **Online** olunca:
   - Uyku rolü kaldırılır
   - Kaydedilen roller geri yüklenir
3. **Sunucudan çıkınca**:
   - Rolleri kaydedilir
   - Geri gelince otomatik restore edilir

### Backup Sistemi

1. **Otomatik Yedekleme**:
   - Her 2 dakikada bir otomatik yedek alınır
   - Son 50 yedek saklanır, eskiler otomatik silinir
2. **Yedeklenen Veriler**:
   - Tüm kanallar (kategori, metin, ses)
   - Tüm roller (renk, izinler, pozisyon)
   - Kanal izinleri (her rol için)
   - Sunucu ayarları (verification level, vb.)
3. **Geri Yükleme**:
   - Tek komutla tüm sunucu eski haline döner
   - Yetki kontrolü ile güvenli restore

## ⚙️ Ceza Türleri

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

## 🐛 Sorun Giderme

### MongoDB bağlanamıyor

```powershell
net start MongoDB
```

### Botlar çalışmıyor

1. Token'ları ve Bot ID'lerini kontrol edin
2. Bot izinlerini kontrol edin (Administrator)
3. Guild ID'nin doğru olduğundan emin olun
4. Bot rollerinin en üstte olduğunu kontrol edin

### PM2 bulamıyor

```powershell
npm install -g pm2
```

### Backup yüklenmiyor

1. DIST botunun rolünü en üste taşıyın
2. Bot'un Administrator yetkisi olduğundan emin olun
3. Yedek ID'sini doğru yazdığınızdan emin olun

### Uyku modu çalışmıyor

1. Controller botunun rolünü en üste taşıyın
2. Kullanıcının whitelist'te olduğundan emin olun
3. `security-logs` kanalını kontrol edin

### Log'ları temizle

```powershell
pm2 flush
```

## 🔒 Güvenlik Notları

- `config/tokens.json` dosyasını **asla** paylaşmayın
- Bot tokenlarını düzenli olarak yenileyin
- Whitelist'e sadece güvendiğiniz kişileri ekleyin
- Log kanallarını düzenli kontrol edin
- Backup dosyalarını güvenli bir yerde saklayın

## 📊 Bot Yapısı

```
henzy-controller    → Ana kontrol botu (komutlar, whitelist, uyku modu)
henzy-guard1-ban    → Ban koruması
henzy-guard2-channel→ Kanal koruması
henzy-guard3-role   → Rol koruması
henzy-dist          → Backup sistemi (2 bot, invisible mod)
```

## 📁 Dosya Yapısı

```
HenzyGuardV1/
├── config/
│   ├── config.json      → Ana konfigürasyon
│   ├── tokens.json      → Bot tokenları ve ID'leri
│   └── database.json    → MongoDB ayarları
├── controller/
│   └── controller.js    → Ana kontrol botu
├── guards/
│   ├── guard1-ban.js    → Ban koruması
│   ├── guard2-channel.js→ Kanal koruması
│   ├── guard3-role.js   → Rol koruması
│   └── dist-backup.js   → Backup sistemi
├── models/
│   ├── whitelist.js     → Whitelist modeli
│   └── logs.js          → Log modeli
├── util/
│   ├── functions.js     → Yardımcı fonksiyonlar
│   ├── logger.js        → Log sistemi
│   └── guardPresence.js → Ses kanalı entegrasyonu
├── backups/             → Yedek dosyaları
├── ecosystem.config.js  → PM2 konfigürasyonu
└── README.md
```

## 🆕 v1.1.0 Yenilikler

- ✅ DIST Backup sistemi eklendi
- ✅ Otomatik ve manuel yedekleme
- ✅ Sayfalama ile yedek listeleme
- ✅ Otomatik uyku modu (offline/sunucudan çıkma)
- ✅ Bot ID sistemi (botlar birbirini guardlamıyor)
- ✅ Rate limiting eklendi
- ✅ Tüm config referansları düzeltildi
- ✅ Geliştirilmiş log sistemi
- ✅ MongoDB Atlas desteği

## 💡 Destek

Sorun yaşarsanız:

1. `pm2 logs` ile hata loglarını kontrol edin
2. MongoDB servisinin çalıştığından emin olun
3. Bot izinlerini ve rol sırasını kontrol edin
4. Config dosyalarını gözden geçirin
5. `BOT_IDS.md` dosyasından bot ID'lerini kontrol edin

## 📄 Lisans

Bu proje özel kullanım içindir.

---

**Not:** İlk kurulumda mutlaka `.setup` komutunu çalıştırın ve kendinizi whitelist'e ekleyin!

**Önemli:** Bot rollerini Discord'da en üst sıraya taşımayı unutmayın!
