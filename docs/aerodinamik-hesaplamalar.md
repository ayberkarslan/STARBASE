# STARLAB & STARBASE Aerodinamik ve Uçuş Hesaplamaları Rehberi

Bu döküman, Yıldız Roket Takımı aerodinamik ekibinin sistemdeki fiziksel modelleri, aerodinamik formülasyonları, 2B/3B/6B uçuş simülasyon çözücülerini ve hesaplama kodlarının dosya yollarını inceleyebilmesi amacıyla hazırlanmıştır.

---

## 1. Genel Mimari ve Hesaplama Katmanları

Proje ekosisteminde aerodinamik ve uçuş fiziği hesaplamaları üç ana katmanda yürütülür:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        STARBASE (Merkezi Hub)                         │
│   Kimlik, yetkilendirme, departman/rol yönetimi, ortak pano & API     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ SDK & Veri Entegrasyonu
┌───────────────────────────────────▼────────────────────────────────────┐
│                  STARLAB / B4 (Tasarım & Analiz Motoru)                 │
│                                                                        │
│  [Arayüz / UI]  ────────► [Python DAG Motoru] ──────► [Native C++ FFI] │
│  (React / Vite)          (engine/models/)              (native/ / C++) │
│                                                                        │
│   • nose-static-aero         • aero-forces           • 2D RK4 Uçuş     │
│   • transition-static-aero   • rocket-aero (DAG)     • 3/6DOF Runner   │
│   • fins-static-aero         • environment (ISA)     • Atalet/CG DAG   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│             AeroVECTOR (Aktif Stabilizasyon & 3DoF Simülatör)          │
│  • Diederich kanat aerodinamiği     • Rüzgâr tüneli CSV katsayıları   │
│  • Geniş AoA (0-180°) aerodinamiği  • TVC & fin PID kontrolcüleri      │
└────────────────────────────────────────────────────────────────────────┘
```

1. **STARLAB / B4 Native & DAG Motoru (`/home/ayberk/Projects/B4`):**
   - **Hesap İndeksi:** [`/home/ayberk/Projects/B4/CALCS`](file:///home/ayberk/Projects/B4/CALCS) dosyasında 20 hesap modeli ve 114 kayıtlı hesap node'u yerel çalışma indeksi olarak tutulur.
   - **Python DAG Motoru (`B4/engine/`):** Parçaların kütle, CG, atalet ve aerodinamik kuvvet/moment bağımlılık ağını (Directed Acyclic Graph) yönetir.
   - **Native C++ Katmanı (`B4/native/` & `B4/flight_native/`):** Yüksek performanslı Barrowman, Busemann süpersonik, kuartik transonik spline, ISA atmosfer ve 3/6DOF RK4 integrasyonlarını derlenmiş C++ ile yürütür.

2. **AeroVECTOR Simülatörü (`/home/ayberk/Projects/AeroVECTOR`):**
   - Aktif stabilizasyon, kanat servoları (TVC) ve yüksek hücum açısı (0°–180°) durumları için rüzgâr tüneli tablolarıyla çalışan tamamlayıcı aerodinamik simülasyon ortamıdır.

---

## 2. Parça Bazlı Statik Aerodinamik Modelleri

### 2.1. Burun Konisi Aerodinamiği (`nose-static-aero`)

Burun konisinin kaldırma eğimi türevi ($C_{N_\alpha}$) ve Basınç Merkezi ($CP$) hesapları.

- **Model Sözleşmesi:** [`B4/engine/models/nose_static.py`](file:///home/ayberk/Projects/B4/engine/models/nose_static.py)
- **Python Node'ları:** [`B4/engine/static_nose/`](file:///home/ayberk/Projects/B4/engine/static_nose)
- **Native C++ Kaynakları:**
  - $C_{N_\alpha}$ Hesabı: [`B4/native/static_aero/nose_cna.cpp`](file:///home/ayberk/Projects/B4/native/static_aero/nose_cna.cpp)
  - Basınç Merkezi ($CP$): [`B4/native/static_aero/nose_cp.cpp`](file:///home/ayberk/Projects/B4/native/static_aero/nose_cp.cpp)

#### Formülasyon ve Yaklaşımlar:
1. **Normal Kuvvet Eğimi:**
   $$C_{N_\alpha} = 2 \left(\frac{r_{base}}{R_{ref}}\right)^2$$
   *(Barrowman sınır şartı: Gövde ucu kapalı bir burun için referans alanına göre türetilir).*
2. **Basınç Merkezi ($CP$):**
   - **Konik Burun (Conical, `profile = 0`):** $CP = \frac{2}{3} L$
   - **Teğet Ojiv (Tangent Ogive, `profile = 1`):** Hacim integrali yöntemiyle analitik olarak hesaplanır:
     $$\rho_{ogive} = \frac{R^2 + L^2}{2R}$$
     $$CP = L - \frac{V}{\pi R^2} \quad \text{burada } V = \int_0^L \pi r(z)^2 dz$$
   - **Parabolik / Güç Serisi (`profile = 2`):** $CP = 0.5 L$
3. **Manuel Değer Ezme (Override):** Port üzerinde `overrideEnabled != 0` ise doğrudan aero ekibinin girdiği $C_{N_\alpha}$ ve $CP$ değerleri kullanılır.

---

### 2.2. Omuz / Geçiş Konisi Aerodinamiği (`transition-static-aero`)

Çap değişimlerinde (genişleme veya daralma) oluşan aerodinamik kuvvet ve basınç merkezi.

- **Model Sözleşmesi:** [`B4/engine/models/transition_static.py`](file:///home/ayberk/Projects/B4/engine/models/transition_static.py)
- **Python Node'ları:** [`B4/engine/static_transition/`](file:///home/ayberk/Projects/B4/engine/static_transition)
- **Native C++ Kaynakları:**
  - $C_{N_\alpha}$: [`B4/native/static_aero/transition_cna.cpp`](file:///home/ayberk/Projects/B4/native/static_aero/transition_cna.cpp)
  - Basınç Merkezi ($CP$): [`B4/native/static_aero/transition_cp.cpp`](file:///home/ayberk/Projects/B4/native/static_aero/transition_cp.cpp)

#### Formülasyon:
$$C_{N_\alpha} = 2 \frac{r_{aft}^2 - r_{fore}^2}{R_{ref}^2}$$
$$CP = X_{fore} + \frac{L}{3} \left(\frac{2 r_{aft} + r_{fore}}{r_{aft} + r_{fore}}\right)$$

> [!NOTE]
> Çap daralıyorsa ($r_{aft} < r_{fore}$), $C_{N_\alpha}$ negatif çıkar. Bu fiziksel olarak doğrudur ve arkadaki gövde alanının ters yönde kaldırma üretmesini modeller.

---

### 2.3. Kanat Statik Aerodinamiği (`fins-static-aero` & `freeform-static-aero`)

Trapezoidal ve serbest form kanatlar için geniş Mach aralığını (Subsonik, Transonik, Süpersonik) kapsayan eksiksiz akış çözümü.

- **Model Sözleşmeleri:**
  - Trapez Kanatlar: [`B4/engine/models/fins_static.py`](file:///home/ayberk/Projects/B4/engine/models/fins_static.py)
  - Serbest Kanatlar: [`B4/engine/models/freeform_static.py`](file:///home/ayberk/Projects/B4/engine/models/freeform_static.py)
- **Native C++ Çekirdek Kütüphanesi:**
  - Genişletilmiş Barrowman & Busemann Motoru: [`B4/native/static_aero/fin_barrowman.hpp`](file:///home/ayberk/Projects/B4/native/static_aero/fin_barrowman.hpp)
  - Kanat $C_{N_\alpha}$ Fonksiyonu: [`B4/native/static_aero/fin_cna.cpp`](file:///home/ayberk/Projects/B4/native/static_aero/fin_cna.cpp)
  - Kanat $CP$ Fonksiyonu: [`B4/native/static_aero/fin_cp.cpp`](file:///home/ayberk/Projects/B4/native/static_aero/fin_cp.cpp)
  - Serbest Kanat Planform Hesabı: [`B4/native/freeform/`](file:///home/ayberk/Projects/B4/native/freeform)

#### Aerodinamik Rejimler ve Denklemler:

1. **Subsonik Rejim ($M \le 0.9$):**
   Diederich ve Barrowman kanat teorisi:
   $$C_{N_{\alpha,1}} = \frac{2 \pi \left(\frac{s^2}{S_{ref}}\right)}{1 + \sqrt{1 + (1 - M^2) \left(\frac{s^2}{A \cos \Lambda_{mid}}\right)^2}}$$
   - $s$: Kanat açıklığı (semispan)
   - $A$: Tek kanat planform alanı
   - $\Lambda_{mid}$: Orta veter (mid-chord) hücum açısı

2. **Transonik Rejim ($0.9 < M < 1.5$):**
   - Sübsonik ($M=0.9$) ve süpersonik ($M=1.5$) sınır noktalarındaki türevler alınarak türetilmiş **C1-sürekli Kuartik (4. derece) Hermite Spline** enterpolasyonu kullanılır.
   - Bu sayede transonik geçişte şok kaynaklı tekillikler (singularity) veya sayısal patlamalar engellenir.

3. **Süpersonik Rejim ($M \ge 1.5$):**
   - İkinci derece **Busemann Şok-Genleşme Teorisi**:
     $$C_{N_\alpha} = \frac{A}{S_{ref}} \left( k_1 + k_2 \alpha + k_3 \alpha^2 \right)$$
     $$\beta = \sqrt{M^2 - 1}$$
     $$k_1 = \frac{2}{\beta}, \quad k_2 = \frac{(\gamma + 1) M^4 - 4 \beta^2}{4 \beta^4}$$
   - Katsayılar $M \in [1.5, 4.9]$ aralığında 35 noktalı tablo ile yüksek hızda enterpole edilir.

4. **Gövde-Kanat Enterferansı ($K_{FB}$):**
   Kanat kökünün gövdeye montajından kaynaklanan ilave kaldırma:
   $$K_{FB} = 1 + \frac{r_{body}}{r_{body} + s}$$

5. **Kanat Yönelim ve Sayı Enterferansı:**
   Roket etrafındaki $N$ kanat için yuvarlanma oryantasyon toplamı:
   $$\sum_{i=1}^N \sin^2\left(\frac{\pi}{2} - \frac{2\pi (i-1)}{N}\right)$$
   Çok kanatlı sistemlerde fin gölgelemeleri için ampirik enterferans katsayıları:
   - 3 veya 4 kanat: $1.000$
   - 5 kanat: $0.948$
   - 6 kanat: $0.913$
   - 7 kanat: $0.854$
   - 8 kanat: $0.810$
   - $>8$ kanat: $0.750$

6. **Basınç Merkezi ($CP$) Kayması:**
   - Subsonikte ($M \le 0.5$): Ortalama aerodinamik veterinin (MAC) $\%25$'indedir.
   - Süpersonikte ($M \ge 2.0$): Açıklık oranı ($AR$) ve Mach faktörüne ($\beta$) bağlı analitik geriye kayma formülü:
     $$x_{cp} = \frac{AR \cdot \beta - 0.67}{2 AR \cdot \beta - 1}$$
   - Transonikte ($0.5 < M < 2.0$): 6. derece Mach polinomu ile pürüzsüz geçiş sağlanır.

---

### 2.4. Gövde Kaldırma ve Planform Etkisi (`bodyCp`, `bodyCn`)

- **Kaynak Dosyalar:** [`B4/engine/models/aero.py`](file:///home/ayberk/Projects/B4/engine/models/aero.py), [`B4/native/static_aero/centroid.cpp`](file:///home/ayberk/Projects/B4/native/static_aero/centroid.cpp), [`moment.cpp`](file:///home/ayberk/Projects/B4/native/static_aero/moment.cpp)
- **Hesap:**
  - Gövde planform alanı: $A_{body} = \int 2 r(x) dx$
  - Gövde planform ilk momenti: $M_{body} = \int 2 r(x) x dx$
  - Gövde Basınç Merkezi: $A_{body} > 10^{-12}$ ise $CP_{body} = \frac{M_{body}}{A_{body}}$, aksi halde roket $CP$'si.
  - Hücum açısı $\alpha$ arttığında gövdenin ürettiği çapraz akış kaldırması:
    $$C_{N,body} \approx \eta c_d c_c \alpha^2 \frac{A_{body}}{S_{ref}}$$

---

## 3. Toplam Roket Aerodinamik Ağı (`rocket-aero`) ve Stabilite

Tüm bağımsız bileşenler montaj ağında birleştirilerek roketin toplam aerodinamik katsayıları elde edilir.

- **Montaj ve Senaryo:** [`B4/engine/aero_assembly.py`](file:///home/ayberk/Projects/B4/engine/aero_assembly.py), [`B4/engine/scenarios/rocket_aero.py`](file:///home/ayberk/Projects/B4/engine/scenarios/rocket_aero.py)
- **Toplam Normal Kuvvet:**
  $$C_{N_{\alpha,total}} = C_{N_{\alpha,nose}} + \sum C_{N_{\alpha,transition}} + \sum C_{N_{\alpha,fins}}$$
- **Toplam Basınç Merkezi ($CP_{total}$):**
  $$CP_{total} = \frac{\sum \left( C_{N_{\alpha,i}} \cdot CP_i \right)}{C_{N_{\alpha,total}}}$$
- **Statik Stabilite Marjı (Caliber cinsinden):**
  $$\text{Margin} = \frac{CP_{total} - CG_{total}}{D_{ref}}$$
  *(Stabil uçuş için kural olarak roket kalkışında ve motor sönümünde $1.5 \le \text{Margin} \le 2.5 \text{ cal}$ aralığı hedeflenir).*

### Eksenel Sürükleme Bileşenleri ($C_D$ & $C_A$):
1. **Yüzey Sürtünmesi ($C_{D,friction}$):**
   Reynolds sayısı $Re = \frac{\rho V L}{\mu}$ ve yüzey pürüzlülüğü katsayılarına göre laminer/türbülanslı sınır tabaka sürtünmesi.
2. **Taban Sürüklemesi ($C_{D,base}$):**
   Motor çalışırken itki gazı taban vakumunu doldurduğundan taban sürtünmesi düşer; motor bittiğinde ise taban basınç katsayısı $C_{D,base} \approx 0.12 + 0.13 M^2$ mertebesinde ek sürükleme üretir.
3. **Dalga Sürüklemesi ($C_{D,wave}$):**
   Mach sayısı 0.8 üzerine çıktığında oluşan şok dalgalarının oluşturduğu ilave basınç direnci.

---

## 4. Atmosfer ve Çevre Modeli (`environment`)

Uçuş boyunca irtifaya bağlı hava koşullarının hesaplandığı modüldür.

- **Model Sözleşmesi:** [`B4/engine/models/environment.py`](file:///home/ayberk/Projects/B4/engine/models/environment.py)
- **Native C++ Kaynakları:** [`B4/native/environment/`](file:///home/ayberk/Projects/B4/native/environment)

### 4.1. ISA 1976 Standart Atmosfer
- **Sıcaklık Gradiyenti:** $T(h) = T_0 - L \cdot h$ ($L = 0.0065 \text{ K/m}$)
- **Barometrik Basınç:** $P(h) = P_0 \left(1 - \frac{L h}{T_0}\right)^{\frac{g_0}{R L}}$
- **Hava Yoğunluğu:** $\rho(h) = \frac{P(h)}{R_{sp} T(h)}$
- **Ses Hızı:** $a(h) = \sqrt{\gamma R_{sp} T(h)}$
- **Dinamik Viskozite:** Sutherland Kanunu $\mu(T) = \mu_0 \left(\frac{T}{T_0}\right)^{3/2} \frac{T_0 + S}{T + S}$

### 4.2. Rüzgâr Modelleri
1. **Sabit Rüzgâr (Constant):** İrtifadan bağımsız sabit yön ve büyüklük.
2. **Logaritmik Sınır Tabakası:**
   $$V(z) = V_{ref} \frac{\ln(z / z_0)}{\ln(z_{ref} / z_0)}$$
3. **Üs Yasası (Power-Law):**
   $$V(z) = V_{ref} \left(\frac{z}{z_{ref}}\right)^\alpha$$
4. **Türbülans ve Rüzgâr Gürültüsü:**
   Pink noise filtresi ile rastgele ani rüzgâr hamleleri (gusts) üretimi.

---

## 5. Uçuş Dinamiği ve Yörünge Çözücüleri

### 5.1. 2B Eksenel RK4 Çözücüsü (`flight-axial`)
- **Dosyalar:** [`B4/engine/models/flight_axial.py`](file:///home/ayberk/Projects/B4/engine/models/flight_axial.py), [`B4/engine/flight/trajectory.py`](file:///home/ayberk/Projects/B4/engine/flight/trajectory.py)
- **Yöntem:** 4. Derece Runge-Kutta (RK4) sayısal diferansiyel denklem integrasyonu.
- **Ray Aşaması:** Ray uzunluğu boyunca roket eksenel harekete zorlanır; raydan çıkış hızı (tipik $> 20 \text{ m/s}$) stabilite için kritik kontrol noktasıdır.
- **Uçuş Safhaları:** Kalkış $\to$ İtki Safhası $\to$ Serbest Süzülme (Coast) $\to$ Tepe Noktası (Apogee) $\to$ Kurtarma (Paraşüt açılışı) $\to$ İniş.

### 5.2. Ray Sonrası 3DoF / 6DoF Uçuş Çözücüsü
- **Koşucu & Motor:** [`B4/flight_native/runner.cpp`](file:///home/ayberk/Projects/B4/flight_native/runner.cpp), [`B4/flight_native/vendor/flight.hpp`](file:///home/ayberk/Projects/B4/flight_native/vendor/flight.hpp)
- **Entegrasyon Arşivi:** [`B4/flight_native/b3/include/sixdof/`](file:///home/ayberk/Projects/B4/flight_native/b3/include/sixdof)
- **Kabiliyetler:**
  - Kuaterniyonlar ile singularitesiz 3B oryantasyon hesabı.
  - Coriolis ivmesi, jiroskopik momentler ve atalet tansörü ($I_{xx}, I_{yy}, I_{zz}$) zaman adımlı güncellemesi.
  - Gerçek zamanlı hücum açısı ($\alpha$), süzülme açısı ($\beta$), Mach ve dinamik basınç ($Q = \frac{1}{2} \rho V^2$) çıktıları.

### 5.3. AeroVECTOR Tamamlayıcı Simülatör (`AeroVECTOR`)
- **Dizin:** [`/home/ayberk/Projects/AeroVECTOR`](file:///home/ayberk/Projects/AeroVECTOR)
- **Önemli Dosyalar:**
  - [`AeroVECTOR/src/aerodynamics/rocket_functions.py`](file:///home/ayberk/Projects/AeroVECTOR/src/aerodynamics/rocket_functions.py): Barrowman ve gövde kaldırma fonksiyonları.
  - [`AeroVECTOR/src/aerodynamics/fin_aerodynamics.py`](file:///home/ayberk/Projects/AeroVECTOR/src/aerodynamics/fin_aerodynamics.py): Diederich yarı-ampirik yöntemi ve stall sonrası kanat davranışı.
  - [`AeroVECTOR/src/aerodynamics/Wind Tunnel Data/`](file:///home/ayberk/Projects/AeroVECTOR/src/aerodynamics/Wind%20Tunnel%20Data): Gerçek rüzgâr tüneli kanat profil katsayıları (`Rectangular.csv`, `InvZimmerman.csv`).
  - [`AeroVECTOR/src/control.py`](file:///home/ayberk/Projects/AeroVECTOR/src/control.py): TVC (Thrust Vector Control) ve fin servo PID kontrol döngüleri.

---

## 6. Birimler, Koordinat Eksenleri ve Sözleşmeler

Aerodinamik kütüphanelerinde birim ve yön uyuşmazlığı yaşamamak için aşağıdaki sözleşmeler sabittir:

| Büyüklük | UI / Kullanıcı Arayüzü | Hesap Motoru / C++ Portu | Notlar |
|---|---|---|---|
| **Uzunluk / Çap** | milimetre ($mm$) | metre ($m$) | Arayüz adaptörleri $10^{-3}$ ile çarpar |
| **Kütle** | gram ($g$) | kilogram ($kg$) | Arayüz adaptörleri $10^{-3}$ ile çarpar |
| **Açılar** | derece ($^\circ$) | radyan ($rad$) | Hesap motorunda $1^\circ = \pi/180 \text{ rad}$ |
| **Kuvvet** | Newton ($N$) | Newton ($N$) | İtki ve aerodinamik kuvvetler |
| **Basınç** | bar / kPa | Pascal ($Pa = N/m^2$) | Dinamik basınç $Q$ ve statik basınç $P$ |
| **Yoğunluk** | $kg/m^3$ | $kg/m^3$ | Standart deniz seviyesi $\rho_0 = 1.225 \text{ kg/m}^3$ |

### Eksen Takımı Kuralları:
1. **Gövde Koordinat Sistemi:**
   - **$+X$ Ekseni:** Burun ucundan başlar ve gövde boyunca arkaya (aft) doğru pozitiftir. Bu nedenle $CP$ ve $CG$ mesafeleri burun ucundan olan uzaklıktır ($X > 0$).
   - **$+Z$ Ekseni:** Yukarı (normal) yöndür.
2. **Açı ve İşaret Kuralı:**
   - Pozitif hücum açısı ($\alpha > 0$) burun yukarı durumudur ve $+Z$'nin tersine (aşağı yönde) normal kuvvet üretir; kod içindeki `__sign_correction` bunu dengeler.

---

## 7. Aerodinamikçi İçin Test ve Doğrulama Komutları

Kod üzerinde formül veya katsayı değişikliği yapıldığında aşağıdaki test scriptleri ile doğrulama yapılabilir:

```sh
# 1. B4 projesine geç
cd /home/ayberk/Projects/B4

# 2. Tüm aerodinamik ve motor hesaplama DAG testlerini çalıştır
npm run test:engine

# 3. Eski referans veriyle aerodinamik regresyon testi (1000 durum / 12000 çıktı karşılaştırması)
python3 scripts/check-legacy-aero.py

# 4. Atmosfer ve rüzgâr çevre modeli doğrulaması (302 durum / 4530 çıktı)
python3 scripts/check-legacy-environment.py

# 5. Serbest uçuş (3/6DOF) testlerini koştur
npx vitest run server/freeFlight.test.ts src/engine/freeFlightInputs.test.ts

# 6. Hesaplama dizini (CALCS) bütünlüğünü kontrol et
python3 scripts/update-calcs.py --check
```

Eğer bağımsız `AeroVECTOR` arayüzünü açıp rüzgar tüneli verilerini görselleştirmek isterseniz:
```sh
cd /home/ayberk/Projects/AeroVECTOR
python3 AeroVECTOR.py
```
