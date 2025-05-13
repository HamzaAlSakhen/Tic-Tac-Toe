# Tic Tac Toe - LAN Çok Oyunculu Oyun

Bu proje, aynı yerel ağdaki iki bilgisayarın tarayıcı üzerinden gerçek zamanlı olarak Tic Tac Toe (XOX) oynamasını sağlar.

## Özellikler

- Flask ve Socket.IO kullanarak gerçek zamanlı oyun deneyimi
- Kullanıcı girişi ve oturum yönetimi
- Otomatik oyuncu eşleştirme
- Görsel oyun arayüzü
- Kazanan çizgisini vurgulama
- Bağlantı koptuğunda otomatik oyun sonlandırma

## Gereksinimler

- Python 3.6+
- Flask
- Flask-SocketIO
- Python-SocketIO
- Eventlet
- Flask-Login

## Kurulum

1. Projeyi klonlayın veya indirin:
```bash
git clone https://github.com/kullaniciadi/tictactoe.git
cd tictactoe
```

2. Sanal ortam oluşturun ve etkinleştirin:
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python -m venv venv
source venv/bin/activate
```

3. Gerekli paketleri yükleyin:
```bash
pip install -r requirements.txt
```

## Çalıştırma

1. Sunucuyu başlatın:
```bash
python app.py
```

2. Sunucu aşağıdaki adreste çalışacaktır:
```
http://0.0.0.0:5000/
```

3. İstemciler için tarayıcıda şu adresi açın:
```
http://<SUNUCU_IP>:5000/
```
Burada `<SUNUCU_IP>`, sunucunun çalıştığı bilgisayarın yerel IP adresidir.

## Güvenlik Duvarı Ayarları

Windows Güvenlik Duvarı'nda 5000 numaralı TCP portunu açmanız gerekebilir:

1. Windows Güvenlik Duvarı'nı açın
2. "Gelişmiş ayarlar" seçeneğine tıklayın
3. "Gelen Kurallar" > "Yeni Kural" seçin
4. "Port" seçin ve "İleri" tıklayın
5. "TCP" seçin ve "Belirli yerel portlar" alanına "5000" yazın
6. "Bağlantıya izin ver" seçin
7. Tüm profilleri seçin (Etki Alanı, Özel, Genel)
8. Bir isim verin (örn. "Flask SocketIO")

## Oyun Nasıl Oynanır

1. Tarayıcıda uygulamayı açın ve bir kullanıcı adıyla giriş yapın
2. "Oyun Ara" düğmesine tıklayın
3. Diğer oyuncunun da aynı şekilde giriş yapmasını ve oyun aramasını bekleyin
4. Eşleşme sağlandığında oyun otomatik olarak başlayacaktır
5. Sıra sizdeyken, boş bir hücreye tıklayarak hamlenizi yapın
6. Üç sembolünüzü (X veya O) yatay, dikey veya çapraz bir çizgide birleştiren ilk oyuncu kazanır

## Teknik Detaylar

- Backend: Python 3 + Flask-SocketIO
- Frontend: HTML / CSS / Vanilla JS + socket.io-client
- Veri: Bellekte saklama (dict)

## Sorun Giderme

- Bağlantı sorunları yaşıyorsanız, güvenlik duvarı ayarlarınızı kontrol edin
- Tarayıcı konsolunda hata mesajları için tarayıcınızın geliştirici araçlarını açın
- Sunucu tarafında hata ayıklama için terminal çıktısını izleyin 