# CALCS — hesaplama dizini

Bu dosya yerel çalışma indeksidir. `python3 scripts/update-calcs.py` ile modül kayıtlarından yenilenir; `--check` güncelliği kontrol eder.
Yeni model/node eklendiğinde aynı geliştirme adımında güncellenir. Yeni fiziksel yorum için bu üreticideki SCOPE/FORMULAS kaydını da doldur.

## Durum

Aşağıdaki hesaplar ayrı Python sürecinde çalışan native C++ hesaplarıdır. Parça modelleri toplam yapı DAG’sine de bağlanır; toplam kütle/CG/atalet hesaplanır. Tek kademe eksenel RK4 uçuş sonucu bağlıdır.
Motor itki/impuls/kütle nodeları bağımsız motor modelinde (Motorlar → Hesap) ve konum/gecikme ile toplam roket kütle/CG/atalet ağında (Analiz → Kütle) çalışır. Girilen katsayılarla aero kuvvet/moment ağı rocket-aero senaryosunda bağlıdır. Atmosfer ve sabit/üs/log rüzgâr modeli bağımsız çevre hesabında çalışır. İlk uçuş çözücüsü sabit rüzgâr, tek motor ve sabit ray ekseniyle çalışır; tam 3DoF tutum, kademe ve kurtarma bekliyor.
UI ölçüleri mm/g; adaptör SI m/kg değerlerine çevirir. CG bileşenin yerel başlangıcından +X yönünde; ataletler yerel CG etrafındadır. Gövde/iç tüp/kütle kaynak sınıflarındaki +Z ekseni STARLAB +X olarak eşlenir.

## Ortak çalışma yolu

- UI → [src/engine/structuralInputs.ts](src/engine/structuralInputs.ts) (yalnız veri/birim uyarlaması).
- İstek/servis → [src/engine/client.ts](src/engine/client.ts) → [server/engine.ts](server/engine.ts) → [engine/worker.py](engine/worker.py).
- Model keşfi → [engine/models/__init__.py](engine/models/__init__.py); bağımlılık yürütücüsü → [engine/graph.py](engine/graph.py).
- Port/birim sözleşmeleri → [engine/contracts.py](engine/contracts.py); FFI → [engine/native.py](engine/native.py).
- Native derleme ve geçişli header parmak izleri → [scripts/build-native.mjs](scripts/build-native.mjs).
- Gövde WASM/TS prototipi (`src/engine/tube/`) test örneğidir; üretim hesap yolu değildir.

## Girilen katsayılarla aero — `aero-forces`

Kullanıcının tüm roket için verdiği CNa, eksenel Cd ve CP ile tek akış noktasında eski CLI non-RASAero kuvvet/moment yolu. Katsayılar geometriden veya Mach tablosundan üretilmez; aynı referans alanına ve girilen Mach/hücum açısına ait olmalıdır. CG dinamik rocket-aero senaryosunda kütle ağından bağlanır. Hava yoğunluğu ve hızdan q hesaplanır; rocket-aero senaryosunda dinamik basınç açıkça verilirse q node’u aynı tipte bir giriş portuyla değiştirilir, yoğunluk bu dalda gerekmez. Gövde planform alanı ve ilk momenti açık girdidir; 0 alan gövde kaldırmasını kapatır. Moment kaynakta normalCoefficient ve ayrıca bodyCn terimini içerir; bu yaklaşım değiştirilmedi. Yunuslama hızı rad/s, statik durumda kullanıcı 0 verir. Kuvvet eksenleri eski uçuş gövdesi ileri/normal eksenleridir; tasarımın +X aft ekseniyle karıştırılmaz. Yörünge, Cd üretimi, atmosfer modeli veya stabilite doğrulaması değildir.

Model dosyası: [engine/models/aero.py](engine/models/aero.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `density` | Hava yoğunluğu | kg/m³ |
| `speed` | Akış hızı | m/s |
| `mach` | Mach | 1 |
| `alpha` | Hücum açısı | rad |
| `area` | Referans alanı | m² |
| `diameter` | Referans çapı | m |
| `cna` | Roket CNa | 1/rad |
| `cd` | Roket eksenel Cd | 1 |
| `cp` | Roket CP | m |
| `cg` | Roket CG | m |
| `bodyArea` | Gövde planform alanı | m² |
| `bodyMoment` | Gövde planform ilk momenti | m³ |
| `pitchRate` | Yunuslama hızı | rad/s |

### Hesap nodeları

#### `aero-forces/bodyCp` — Gövde CP

- Hesap: A_body>1e−12 ise planform ilk momenti/A_body, aksi halde roket CP.
- Girdiler/bağımlılıklar: `bodyArea` (m²), `bodyMoment` (m³), `cp` (m).
- Çıktı: `bodyCp` · m; çerçeve: vehicle-leading-origin.
- Python node: [engine/aero/body_cp.py](engine/aero/body_cp.py).
- C++ hesap: [native/aero/body_cp.cpp](native/aero/body_cp.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/dynamicPressure` — Dinamik basınç

- Hesap: q = 0.5 ρ V².
- Girdiler/bağımlılıklar: `density` (kg/m³), `speed` (m/s).
- Çıktı: `dynamicPressure` · Pa; çerçeve: skaler.
- Python node: [engine/aero/dynamic_pressure.py](engine/aero/dynamic_pressure.py).
- C++ hesap: [native/aero/dynamic_pressure.cpp](native/aero/dynamic_pressure.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/flowAlpha` — Akış hücum açısı

- Hesap: V > 0.1 m/s ise girilen α, aksi halde 0; kaynak düşük hız eşiği.
- Girdiler/bağımlılıklar: `speed` (m/s), `alpha` (rad).
- Çıktı: `flowAlpha` · rad; çerçeve: skaler.
- Python node: [engine/aero/flow_alpha.py](engine/aero/flow_alpha.py).
- C++ hesap: [native/aero/flow_alpha.cpp](native/aero/flow_alpha.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/lever` — CP−CG mesafesi

- Hesap: l = CP − CG; ikisi de roket başlangıcına göre.
- Girdiler/bağımlılıklar: `cp` (m), `cg` (m).
- Çıktı: `lever` · m; çerçeve: skaler.
- Python node: [engine/aero/lever.py](engine/aero/lever.py).
- C++ hesap: [native/aero/lever.cpp](native/aero/lever.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/axialForce` — Eksenel aero kuvveti

- Hesap: V>0.1 ise F_axial=−sign(V cos α) q S_ref Cd; aksi halde 0. Sıfır eksenel hızda yön +1; kaynak davranışı.
- Girdiler/bağımlılıklar: `speed` (m/s), `flowAlpha` (rad), `dynamicPressure` (Pa), `area` (m²), `cd` (1).
- Çıktı: `axialForce` · N; çerçeve: legacy-flight-body-forward.
- Python node: [engine/aero/axial_force.py](engine/aero/axial_force.py).
- C++ hesap: [native/aero/axial_force.cpp](native/aero/axial_force.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/bodyCn` — Gövde normal katsayısı

- Hesap: k=1; Mach <0.05 ve |α|>π/4 ise k=(Mach/0.05)²; CN_body=k×1.1×A_body/max(S_ref,1e−12)×sin(α)|sin(α)|.
- Girdiler/bağımlılıklar: `mach` (1), `flowAlpha` (rad), `bodyArea` (m²), `area` (m²).
- Çıktı: `bodyCn` · 1; çerçeve: skaler.
- Python node: [engine/aero/body_cn.py](engine/aero/body_cn.py).
- C++ hesap: [native/aero/body_cn.cpp](native/aero/body_cn.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/effectiveAlpha` — Sınırlı hücum açısı

- Hesap: α_eff = clamp(α, −20°, +20°).
- Girdiler/bağımlılıklar: `flowAlpha` (rad).
- Çıktı: `effectiveAlpha` · rad; çerçeve: skaler.
- Python node: [engine/aero/effective_alpha.py](engine/aero/effective_alpha.py).
- C++ hesap: [native/aero/effective_alpha.cpp](native/aero/effective_alpha.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/dampingMoment` — Yunuslama sönüm momenti

- Hesap: V>0.1 ise −4 q S_ref CNa max(|CP−CG|,D_ref/4)² pitchRate/V; aksi halde 0.
- Girdiler/bağımlılıklar: `speed` (m/s), `dynamicPressure` (Pa), `area` (m²), `cna` (1/rad), `lever` (m), `diameter` (m), `pitchRate` (rad/s).
- Çıktı: `dampingMoment` · N·m; çerçeve: legacy-flight-pitch.
- Python node: [engine/aero/damping_moment.py](engine/aero/damping_moment.py).
- C++ hesap: [native/aero/damping_moment.cpp](native/aero/damping_moment.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/stabilityMargin` — Statik marj

- Hesap: SM = (CP−CG)/D_ref, kalibre.
- Girdiler/bağımlılıklar: `lever` (m), `diameter` (m).
- Çıktı: `stabilityMargin` · cal; çerçeve: skaler.
- Python node: [engine/aero/stability_margin.py](engine/aero/stability_margin.py).
- C++ hesap: [native/aero/stability_margin.cpp](native/aero/stability_margin.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::stability_margin_cal.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/normalCoefficient` — Toplam normal katsayı

- Hesap: CN = CNa α_eff + CN_body.
- Girdiler/bağımlılıklar: `cna` (1/rad), `effectiveAlpha` (rad), `bodyCn` (1).
- Çıktı: `normalCoefficient` · 1; çerçeve: skaler.
- Python node: [engine/aero/normal_coefficient.py](engine/aero/normal_coefficient.py).
- C++ hesap: [native/aero/normal_coefficient.cpp](native/aero/normal_coefficient.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/normalForce` — Normal aero kuvveti

- Hesap: F_normal = CN q S_ref.
- Girdiler/bağımlılıklar: `normalCoefficient` (1), `dynamicPressure` (Pa), `area` (m²).
- Çıktı: `normalForce` · N; çerçeve: legacy-flight-body-normal.
- Python node: [engine/aero/normal_force.py](engine/aero/normal_force.py).
- C++ hesap: [native/aero/normal_force.cpp](native/aero/normal_force.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/pitchMoment` — Aerodinamik yunuslama momenti

- Hesap: M_aero = −q S_ref [CN (CP−CG) + CN_body (CP_body−CG)].
- Girdiler/bağımlılıklar: `dynamicPressure` (Pa), `area` (m²), `normalCoefficient` (1), `lever` (m), `bodyCn` (1), `bodyCp` (m), `cg` (m).
- Çıktı: `pitchMoment` · N·m; çerçeve: legacy-flight-pitch.
- Python node: [engine/aero/pitch_moment.py](engine/aero/pitch_moment.py).
- C++ hesap: [native/aero/pitch_moment.cpp](native/aero/pitch_moment.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `aero-forces/totalMoment` — Toplam yunuslama momenti

- Hesap: M_pitch = M_aero + M_damping.
- Girdiler/bağımlılıklar: `pitchMoment` (N·m), `dampingMoment` (N·m).
- Çıktı: `totalMoment` · N·m; çerçeve: legacy-flight-pitch.
- Python node: [engine/aero/total_moment.py](engine/aero/total_moment.py).
- C++ hesap: [native/aero/total_moment.cpp](native/aero/total_moment.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv · supplied coefficients, non-RASAero branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Halka / bölme — `annular-cylinder`

Merkezleme halkası veya bölme: homojen halka silindiri; bölmede iç yarıçap 0. İç/dış yarıçap eşitse sıfır hacim/kütle geçerlidir. Eksenel kalınlık kullanıcı ölçüsüdür.

Model dosyası: [engine/models/annular.py](engine/models/annular.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `length` | Eksenel kalınlık | m |
| `radius` | Dış yarıçap | m |
| `innerRadius` | İç yarıçap | m |
| `density` | Yoğunluk | kg/m³ |

### Hesap nodeları

#### `annular-cylinder/cg` — Yerel CG

- Hesap: x_CG = L/2.
- Girdiler/bağımlılıklar: `length` (m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/annular/centroid.py](engine/annular/centroid.py).
- C++ hesap: [native/annular/centroid.cpp](native/annular/centroid.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Centering Ring / Bulkhead) · localCg.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `annular-cylinder/volume` — Hacim

- Hesap: V = π max(R²−r²,0)L.
- Girdiler/bağımlılıklar: `radius` (m), `innerRadius` (m), `length` (m).
- Çıktı: `volume` · m³; çerçeve: skaler.
- Python node: [engine/annular/volume.py](engine/annular/volume.py).
- C++ hesap: [native/annular/volume.cpp](native/annular/volume.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Centering Ring / Bulkhead) · volume.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `annular-cylinder/mass` — Kütle

- Hesap: m = ρV.
- Girdiler/bağımlılıklar: `volume` (m³), `density` (kg/m³).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/annular/mass.py](engine/annular/mass.py).
- C++ hesap: [native/annular/mass.cpp](native/annular/mass.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Centering Ring / Bulkhead) · mass.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `annular-cylinder/axial` — Eksenel atalet

- Hesap: Ixx = m(r²+R²)/2.
- Girdiler/bağımlılıklar: `mass` (kg), `radius` (m), `innerRadius` (m).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/annular/axial.py](engine/annular/axial.py).
- C++ hesap: [native/annular/axial.cpp](native/annular/axial.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Centering Ring / Bulkhead) · iAxial.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `annular-cylinder/transverse` — Enine atalet

- Hesap: Iyy = Izz = m[3(r²+R²)+L²]/12.
- Girdiler/bağımlılıklar: `mass` (kg), `radius` (m), `innerRadius` (m), `length` (m).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/annular/transverse.py](engine/annular/transverse.py).
- C++ hesap: [native/annular/transverse.cpp](native/annular/transverse.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Centering Ring / Bulkhead) · iTransverse.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Atmosfer ve rüzgâr — `environment`

Eski Atmosphere.cpp ve WindModel.cpp skaler yolu. Model 0 yüzey ölçümü: h AGL, 0.0065 K/m lapse, 11 km üstünde izotermal uzatma. Model 1 US 1976: saha irtifası + AGL → ASL → geopotansiyel; kaynak 7 katman sabitleri aynen korunur. İlk desteklenen aralık −600…86000 m ASL; üst ekstrapolasyon bu dilimde kabul edilmez. Sıcaklık K, basınç Pa. Sabit/üs/log rüzgâr; meteorolojik FROM yönü, kuzey/doğu bileşenleri ve ray azimutuna projeksiyon. Türbülans ve tablo profilleri bağlı değil. Uçuş düzlemi rüzgârının dikey bileşeni kaynak gibi 0’dır; yan düzlem rüzgârı 3DoF hız büyüklüğüne katılmaz. Hız, Mach, Reynolds, q ve yerel g aynı CLI ifadeleridir. Yüzey modeli saha irtifasını basınçtan yeniden düşmez; standart model mutlak irtifayı kullanır. Reynolds için referans uzunluğu eksikse yalnız o dal bekler.

Model dosyası: [engine/models/environment.py](engine/models/environment.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `height` | Fırlatma noktasından yükseklik | m |
| `launchAltitude` | Fırlatma sahası irtifası | m |
| `atmosphereModel` | Atmosfer modeli | 1 |
| `surfaceTemperature` | Yüzey sıcaklığı | K |
| `surfacePressure` | Yüzey basıncı | Pa |
| `windModel` | Rüzgâr modeli | 1 |
| `meanSpeed` | Referans rüzgâr hızı | m/s |
| `direction` | Rüzgârın geldiği yön | deg |
| `directionGradient` | Yön değişimi | deg/km |
| `heading` | Ray azimutu | deg |
| `referenceHeight` | Rüzgâr referans yüksekliği | m |
| `minimumHeight` | Asgari rüzgâr yüksekliği | m |
| `exponent` | Rüzgâr üssü | 1 |
| `roughness` | Yüzey pürüzlülüğü | m |
| `groundDownrange` | Yere göre yatay hız | m/s |
| `groundVertical` | Yere göre dikey hız | m/s |
| `referenceLength` | Reynolds referans uzunluğu | m |

### Hesap nodeları

#### `environment/absoluteAltitude` — Deniz seviyesine göre irtifa

- Hesap: h_ASL = h_site + max(h_AGL,0).
- Girdiler/bağımlılıklar: `launchAltitude` (m), `height` (m).
- Çıktı: `absoluteAltitude` · m; çerçeve: mean-sea-level.
- Python node: [engine/environment/absolute_altitude.py](engine/environment/absolute_altitude.py).
- C++ hesap: [native/environment/absolute_altitude.cpp](native/environment/absolute_altitude.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/windDirection` — Rüzgârın geldiği yön

- Hesap: FROM = normalize360(direction + gradient×max(h_AGL,0)/1000).
- Girdiler/bağımlılıklar: `direction` (deg), `directionGradient` (deg/km), `height` (m).
- Çıktı: `windDirection` · deg; çerçeve: skaler.
- Python node: [engine/environment/wind_direction.py](engine/environment/wind_direction.py).
- C++ hesap: [native/environment/wind_direction.cpp](native/environment/wind_direction.cpp).
- Kaynak: RoketSiM src/env/WindModel.cpp · turbulence disabled.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/windMultiplier` — Rüzgâr yükseklik çarpanı

- Hesap: Sabit: 1. Üs: h=max(h_AGL,minimumHeight), h≤0 ise 0, değilse (h/referenceHeight)^exponent. Log: h=max(h_AGL,0), h≤z0 ise 0, değilse max(log(h/z0)/log(referenceHeight/z0),0).
- Girdiler/bağımlılıklar: `windModel` (1), `height` (m), `referenceHeight` (m), `minimumHeight` (m), `exponent` (1), `roughness` (m).
- Çıktı: `windMultiplier` · 1; çerçeve: skaler.
- Python node: [engine/environment/__init__.py](engine/environment/__init__.py).
- C++ hesap: [native/environment/wind_multiplier.cpp](native/environment/wind_multiplier.cpp).
- Kaynak: RoketSiM src/env/WindModel.cpp · turbulence disabled.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/gravity` — Yerel yerçekimi

- Hesap: g = 9.80665 [6356766/(6356766+h_ASL)]².
- Girdiler/bağımlılıklar: `absoluteAltitude` (m).
- Çıktı: `gravity` · m/s²; çerçeve: skaler.
- Python node: [engine/environment/gravity.py](engine/environment/gravity.py).
- C++ hesap: [native/environment/gravity.cpp](native/environment/gravity.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/temperature` — Sıcaklık

- Hesap: Yüzey: max(T_surface − 0.0065 min(max(h_AGL,0),11000),1). US1976: H=r0 h/(r0+h); kaynak tablosundaki katmanı seç; max(Tb+Lb(H−Hb),1).
- Girdiler/bağımlılıklar: `atmosphereModel` (1), `height` (m), `absoluteAltitude` (m), `surfaceTemperature` (K).
- Çıktı: `temperature` · K; çerçeve: skaler.
- Python node: [engine/environment/temperature.py](engine/environment/temperature.py).
- C++ hesap: [native/environment/temperature.cpp](native/environment/temperature.cpp).
- Kaynak: RoketSiM src/env/Atmosphere.cpp.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/windSpeed` — Yerel rüzgâr hızı

- Hesap: U_local = U_reference × heightMultiplier; türbülans kapalı.
- Girdiler/bağımlılıklar: `meanSpeed` (m/s), `windMultiplier` (1).
- Çıktı: `windSpeed` · m/s; çerçeve: skaler.
- Python node: [engine/environment/wind_speed.py](engine/environment/wind_speed.py).
- C++ hesap: [native/environment/wind_speed.cpp](native/environment/wind_speed.cpp).
- Kaynak: RoketSiM src/env/WindModel.cpp · turbulence disabled.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/pressure` — Atmosfer basıncı

- Hesap: Yüzey: P_surface (T/T_surface)^(g0/(R_spec×0.0065)); 11 km üstünde exp[−g0(h−11000)/(R_spec T)] ile çarpılır. US1976: Lb=0 ise Pb exp[−g0(H−Hb)/(R_spec Tb)], değilse Pb(Tb/T)^(g0/(R_spec Lb)); negatif basınç 0 yapılır.
- Girdiler/bağımlılıklar: `atmosphereModel` (1), `height` (m), `absoluteAltitude` (m), `surfaceTemperature` (K), `surfacePressure` (Pa), `temperature` (K).
- Çıktı: `pressure` · Pa; çerçeve: skaler.
- Python node: [engine/environment/pressure.py](engine/environment/pressure.py).
- C++ hesap: [native/environment/pressure.cpp](native/environment/pressure.cpp).
- Kaynak: RoketSiM src/env/Atmosphere.cpp.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/speedOfSound` — Ses hızı

- Hesap: a = sqrt(1.40 R_spec T).
- Girdiler/bağımlılıklar: `temperature` (K).
- Çıktı: `speedOfSound` · m/s; çerçeve: skaler.
- Python node: [engine/environment/speed_of_sound.py](engine/environment/speed_of_sound.py).
- C++ hesap: [native/environment/speed_of_sound.cpp](native/environment/speed_of_sound.cpp).
- Kaynak: RoketSiM src/env/Atmosphere.cpp.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/viscosity` — Dinamik viskozite

- Hesap: μ = 1.716e−5 (T/273.15)^1.5 (273.15+110.4)/(T+110.4).
- Girdiler/bağımlılıklar: `temperature` (K).
- Çıktı: `viscosity` · Pa·s; çerçeve: skaler.
- Python node: [engine/environment/viscosity.py](engine/environment/viscosity.py).
- C++ hesap: [native/environment/viscosity.cpp](native/environment/viscosity.cpp).
- Kaynak: RoketSiM src/env/Atmosphere.cpp.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/windEast` — Doğu rüzgârı

- Hesap: U_east = −U_local sin(FROM π/180).
- Girdiler/bağımlılıklar: `windSpeed` (m/s), `windDirection` (deg).
- Çıktı: `windEast` · m/s; çerçeve: east-north-launch-plane.
- Python node: [engine/environment/wind_east.py](engine/environment/wind_east.py).
- C++ hesap: [native/environment/wind_east.cpp](native/environment/wind_east.cpp).
- Kaynak: RoketSiM src/env/WindModel.cpp · turbulence disabled.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/windNorth` — Kuzey rüzgârı

- Hesap: U_north = −U_local cos(FROM π/180).
- Girdiler/bağımlılıklar: `windSpeed` (m/s), `windDirection` (deg).
- Çıktı: `windNorth` · m/s; çerçeve: east-north-launch-plane.
- Python node: [engine/environment/wind_north.py](engine/environment/wind_north.py).
- C++ hesap: [native/environment/wind_north.cpp](native/environment/wind_north.cpp).
- Kaynak: RoketSiM src/env/WindModel.cpp · turbulence disabled.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/density` — Hava yoğunluğu

- Hesap: ρ = P/(R_spec T), R_spec=8314.32/28.9644.
- Girdiler/bağımlılıklar: `pressure` (Pa), `temperature` (K).
- Çıktı: `density` · kg/m³; çerçeve: skaler.
- Python node: [engine/environment/density.py](engine/environment/density.py).
- C++ hesap: [native/environment/density.cpp](native/environment/density.cpp).
- Kaynak: RoketSiM src/env/Atmosphere.cpp.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/windAlong` — Uçuş düzlemindeki rüzgâr

- Hesap: U_along = U_east sin(heading π/180) + U_north cos(heading π/180).
- Girdiler/bağımlılıklar: `windEast` (m/s), `windNorth` (m/s), `heading` (deg).
- Çıktı: `windAlong` · m/s; çerçeve: east-north-launch-plane.
- Python node: [engine/environment/wind_along.py](engine/environment/wind_along.py).
- C++ hesap: [native/environment/wind_along.cpp](native/environment/wind_along.cpp).
- Kaynak: RoketSiM src/env/WindModel.cpp · turbulence disabled.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/airDownrange` — Havaya göre yatay hız

- Hesap: V_air_horizontal = V_ground_horizontal − U_along.
- Girdiler/bağımlılıklar: `groundDownrange` (m/s), `windAlong` (m/s).
- Çıktı: `airDownrange` · m/s; çerçeve: launch-plane.
- Python node: [engine/environment/air_downrange.py](engine/environment/air_downrange.py).
- C++ hesap: [native/environment/air_downrange.cpp](native/environment/air_downrange.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/speed` — Havaya göre hız

- Hesap: V_air = sqrt(V_ground_vertical² + V_air_horizontal²); kaynakta dikey rüzgâr 0.
- Girdiler/bağımlılıklar: `airDownrange` (m/s), `groundVertical` (m/s).
- Çıktı: `speed` · m/s; çerçeve: skaler.
- Python node: [engine/environment/speed.py](engine/environment/speed.py).
- C++ hesap: [native/environment/speed.cpp](native/environment/speed.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/dynamicPressure` — Dinamik basınç

- Hesap: q = 0.5 ρ V_air².
- Girdiler/bağımlılıklar: `density` (kg/m³), `speed` (m/s).
- Çıktı: `dynamicPressure` · Pa; çerçeve: skaler.
- Python node: [engine/environment/dynamic_pressure.py](engine/environment/dynamic_pressure.py).
- C++ hesap: [native/environment/dynamic_pressure.cpp](native/environment/dynamic_pressure.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/mach` — Mach

- Hesap: Mach = V_air/max(a,1e−9).
- Girdiler/bağımlılıklar: `speed` (m/s), `speedOfSound` (m/s).
- Çıktı: `mach` · 1; çerçeve: skaler.
- Python node: [engine/environment/mach.py](engine/environment/mach.py).
- C++ hesap: [native/environment/mach.cpp](native/environment/mach.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `environment/reynolds` — Reynolds

- Hesap: V_air ≤0.1 ise kaynak gibi 0; aksi halde ν = ρ>0 ? μ/ρ : 1e30; Re = V_air L/max(ν,1e−30).
- Girdiler/bağımlılıklar: `speed` (m/s), `referenceLength` (m), `viscosity` (Pa·s), `density` (kg/m³).
- Çıktı: `reynolds` · 1; çerçeve: skaler.
- Python node: [engine/environment/reynolds.py](engine/environment/reynolds.py).
- C++ hesap: [native/environment/reynolds.cpp](native/environment/reynolds.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Kanat statik aerodinamiği — `fins-static-aero`

Eski üretim tasarım analizindeki trapez kanat Barrowman CNa ve CP yolu. Mach/AoA bağımlı FinSetBarrowman hesabı, gövde girişimi, kanat adedi girişim katsayısı, transonik enterpolasyon ve Mach bağımlı CP konumu korunur. Kullanıcı override değeri etkinse kaynak davranışıyla hesaplanan değerin yerini alır.

Model dosyası: [engine/models/fins_static.py](engine/models/fins_static.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `root` | Kök veter | m |
| `tip` | Uç veter | m |
| `span` | Açıklık | m |
| `sweep` | Süpürme | m |
| `count` | Kanat sayısı | count |
| `bodyRadius` | Gövde yarıçapı | m |
| `referenceArea` | Referans alan | m² |
| `mach` | Mach | 1 |
| `alpha` | Hücum açısı | rad |
| `cnaOverrideEnabled` | CNa override | 1 |
| `cnaOverride` | CNa değeri | 1/rad |
| `cpOverrideEnabled` | CP override | 1 |
| `cpOverride` | CP değeri | m |

### Hesap nodeları

#### `fins-static-aero/cna` — Kanat CNa

- Hesap: override açıksa girilen değer; değilse FinSetBarrowman::aggregateCna ile Mach/AoA, planform, yön dağılımı, gövde ve kanat sayısı girişimi.
- Girdiler/bağımlılıklar: `root` (m), `tip` (m), `span` (m), `sweep` (m), `count` (count), `bodyRadius` (m), `referenceArea` (m²), `mach` (1), `alpha` (rad), `cnaOverrideEnabled` (1), `cnaOverride` (1/rad), `cpOverrideEnabled` (1), `cpOverride` (m).
- Çıktı: `cna` · 1/rad; çerçeve: skaler.
- Python node: [engine/static_fins/cna.py](engine/static_fins/cna.py).
- C++ hesap: [native/static_aero/fin_cna.cpp](native/static_aero/fin_cna.cpp).
- Kaynak: RoketSiM include/aero/FinSetBarrowman.hpp::aggregateCna + src/cli/design_analysis.hpp::finCnaAtMach · override.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `fins-static-aero/cp` — Kanat yerel CP

- Hesap: override açıksa girilen yerel değer; değilse x_MAC_lead + cpFraction(AR,Mach) MAC.
- Girdiler/bağımlılıklar: `root` (m), `tip` (m), `span` (m), `sweep` (m), `count` (count), `bodyRadius` (m), `referenceArea` (m²), `mach` (1), `alpha` (rad), `cnaOverrideEnabled` (1), `cnaOverride` (1/rad), `cpOverrideEnabled` (1), `cpOverride` (m).
- Çıktı: `cp` · m; çerçeve: component-leading-origin.
- Python node: [engine/static_fins/cp.py](engine/static_fins/cp.py).
- C++ hesap: [native/static_aero/fin_cp.cpp](native/static_aero/fin_cp.cpp).
- Kaynak: RoketSiM include/aero/FinSetBarrowman.hpp::cpFraction + src/cli/design_analysis.hpp trapezoidal MAC · override.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Tek kademe 2B RK4 uçuş — `flight-axial`

Tek kademe için azaltılmış 2B noktasal kütle uçuş çözücüsü. Üretim CLI itki enterpolasyonu, impulsa bağlı yakıt tüketimi, yüzey/US1976 atmosferi, rüzgâr projeksiyonu, değişken yerçekimi, eksenel sürükleme, pad desteği, ray kısıtı ve klasik RK4 kullanılır. Araç ray çıkışına kadar ray doğrultusuna kısıtlıdır; ardından yatay/dikey düzlemde serbesttir ancak gövde ekseni ilk ray yönünde sabit kalır. Yunuslama, kademe ayrılması, kurtarma, profil rüzgârı ve türbülans bu ilk dilimde yoktur. Çıktı en fazla 2500 adet t/irtifa/hız/ivme/yatay konum/yatay hız/dikey hız/ray durumu satırıdır; integrasyon en fazla iki milyon adımdır.

Model dosyası: [engine/models/flight_axial.py](engine/models/flight_axial.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `curve` | İtki eğrisi | s,N |
| `wetMass` | Kalkış kütlesi | kg |
| `propellant` | Yakıt kütlesi | kg |
| `cd` | Eksenel Cd | 1 |
| `area` | Referans alanı | 1 |
| `atmosphereModel` | Atmosfer modeli | 1 |
| `launchAltitude` | Saha irtifası | 1 |
| `surfaceTemperature` | Yüzey sıcaklığı | 1 |
| `surfacePressure` | Yüzey basıncı | 1 |
| `windSpeed` | Rüzgâr hızı | 1 |
| `windDirection` | Rüzgâr yönü | 1 |
| `heading` | Ray yönü | 1 |
| `railAngle` | Ray açısı | 1 |
| `railLength` | Ray uzunluğu | 1 |
| `dt` | Zaman adımı | 1 |
| `maxTime` | Azami süre | 1 |

### Hesap nodeları

#### `flight-axial/series` — RK4 uçuş serisi

- Hesap: m(t)=m_wet−m_prop clamp[J(t)/max(J_total,1e−12),0,1]; ρ(h) seçilen atmosfer modelinden; q=ρ|V−W|²/2; F_drag üretim axial-force büyüklüğüyle bağıl akışa karşı. Rayda ivme ray doğrultusuna izdüşürülür ve pad negatif hareketi tutar; ray mesafesi aşılınca x/z serbest kalır. Durum klasik dört aşamalı RK4 ile ilerletilir..
- Girdiler/bağımlılıklar: `curve` (s,N), `wetMass` (kg), `propellant` (kg), `cd` (1), `area` (1), `atmosphereModel` (1), `launchAltitude` (1), `surfaceTemperature` (1), `surfacePressure` (1), `windSpeed` (1), `windDirection` (1), `heading` (1), `railAngle` (1), `railLength` (1), `dt` (1), `maxTime` (1).
- Çıktı: `series` · s,m,m/s,m/s²,m,m/s,m/s,boolean; çerçeve: skaler.
- Python node: [engine/flight/trajectory.py](engine/flight/trajectory.py).
- C++ hesap: [native/flight/axial.cpp](native/flight/axial.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::deriv/rk4Step.
- Sürüm: `1.2.0`; sözleşme: `1`.

## Serbest kanat seti — `freeform-fins`

Eski üretim design_analysis.hpp Freeform Fin Set yolu. FinPlanform alan, eksenel boy ve centroid değerleri; trapez üretim yoluyla aynı kesit katsayısı, kök dili hacmi, toplam kütle ve yaklaşık atalet formülleri. Poligon noktaları metre cinsindedir.

Model dosyası: [engine/models/freeform_structure.py](engine/models/freeform_structure.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `points` | Kanat poligonu | m,m |
| `count` | Kanat sayısı | count |
| `thickness` | Kalınlık | m |
| `sectionCode` | Kesit | 1 |
| `density` | Yoğunluk | kg/m³ |
| `bodyRadius` | Gövde yarıçapı | m |
| `tabHeight` | Dil yüksekliği | m |
| `tabLength` | Dil uzunluğu | m |

### Hesap nodeları

#### `freeform-fins/area` — Kanat planform alanı

- Hesap: FinPlanform::calculate(points).area.
- Girdiler/bağımlılıklar: `points` (m,m).
- Çıktı: `area` · m²; çerçeve: skaler.
- Python node: [engine/freeform/area.py](engine/freeform/area.py).
- C++ hesap: [native/freeform/area.cpp](native/freeform/area.cpp).
- Kaynak: RoketSiM include/aero/FinPlanform.hpp::calculate::area.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `freeform-fins/cg` — Serbest kanat yerel CG

- Hesap: FinPlanform::calculate(points).centroidX.
- Girdiler/bağımlılıklar: `points` (m,m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/freeform_structure/cg.py](engine/freeform_structure/cg.py).
- C++ hesap: [native/freeform/centroid.cpp](native/freeform/centroid.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Freeform Fin Set) · FinPlanform::centroidX.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `freeform-fins/length` — Serbest kanat eksenel boyu

- Hesap: FinPlanform::calculate(points).axialLength.
- Girdiler/bağımlılıklar: `points` (m,m).
- Çıktı: `length` · m; çerçeve: skaler.
- Python node: [engine/freeform_structure/length.py](engine/freeform_structure/length.py).
- C++ hesap: [native/freeform/length.cpp](native/freeform/length.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Freeform Fin Set) · FinPlanform::axialLength.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `freeform-fins/radial` — Serbest kanat radyal konumu

- Hesap: R_body + FinPlanform::calculate(points).centroidY.
- Girdiler/bağımlılıklar: `points` (m,m), `bodyRadius` (m).
- Çıktı: `radial` · m; çerçeve: skaler.
- Python node: [engine/freeform_structure/radial.py](engine/freeform_structure/radial.py).
- C++ hesap: [native/freeform/radial.cpp](native/freeform/radial.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Freeform Fin Set) · bodyRadius + centroidY.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `freeform-fins/sectionFactor` — Kesit katsayısı

- Hesap: Kesit katsayısı: düz 1, rounded 0.99, airfoil 0.65, diamond 0.5, biconvex 0.6.
- Girdiler/bağımlılıklar: `sectionCode` (1).
- Çıktı: `sectionFactor` · 1; çerçeve: skaler.
- Python node: [engine/fins/section.py](engine/fins/section.py).
- C++ hesap: [native/fins/section.cpp](native/fins/section.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `freeform-fins/volume` — Hacim

- Hesap: N(area + h_tab L_tab) thickness k_section.
- Girdiler/bağımlılıklar: `count` (count), `area` (m²), `tabHeight` (m), `tabLength` (m), `thickness` (m), `sectionFactor` (1).
- Çıktı: `volume` · m³; çerçeve: skaler.
- Python node: [engine/fins/volume.py](engine/fins/volume.py).
- C++ hesap: [native/fins/volume.cpp](native/fins/volume.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `freeform-fins/mass` — Kütle

- Hesap: density × volume.
- Girdiler/bağımlılıklar: `volume` (m³), `density` (kg/m³).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/fins/mass.py](engine/fins/mass.py).
- C++ hesap: [native/fins/mass.cpp](native/fins/mass.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `freeform-fins/axial` — Eksenel atalet

- Hesap: mass × radial².
- Girdiler/bağımlılıklar: `mass` (kg), `radial` (m).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/fins/axial.py](engine/fins/axial.py).
- C++ hesap: [native/fins/axial.cpp](native/fins/axial.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `freeform-fins/transverse` — Enine atalet

- Hesap: mass × (length² + radial²)/12.
- Girdiler/bağımlılıklar: `mass` (kg), `length` (m), `radial` (m).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/fins/transverse.py](engine/fins/transverse.py).
- C++ hesap: [native/fins/transverse.cpp](native/fins/transverse.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Serbest kanat planformu — `freeform-planform`

Eski FinPlanform.hpp poligon alanı. Girdi 3–500 adet (x,y) noktasının metre cinsinden düz dizisidir. Ardışık yinelenen noktalar temizlenir; yön ters olsa da pozitif alan döner. Bu yalnız geometri alanı nodedur; henüz serbest kanat kütle veya CNa/CP toplamına bağlı değildir.

Model dosyası: [engine/models/freeform.py](engine/models/freeform.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `points` | Kanat poligonu | m,m |

### Hesap nodeları

#### `freeform-planform/area` — Kanat planform alanı

- Hesap: FinPlanform::calculate: shoelace alanı A = 1/2 |Σ(x_i y_{i+1}−x_{i+1} y_i)|; kaynak temizleme ve geçerlilik eşiği aynen kullanılır..
- Girdiler/bağımlılıklar: `points` (m,m).
- Çıktı: `area` · m²; çerçeve: skaler.
- Python node: [engine/freeform/area.py](engine/freeform/area.py).
- C++ hesap: [native/freeform/area.cpp](native/freeform/area.cpp).
- Kaynak: RoketSiM include/aero/FinPlanform.hpp::calculate::area.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Serbest kanat statik aerodinamiği — `freeform-static-aero`

Eski FreeformFinSet.cpp ve FinPlanform.hpp statik aero yolu. Poligon 48 istasyonda dilimlenir; CNa Mach/AoA ve gövde girişimiyle, CP MAC ve Mach kesriyle bulunur. freeform-fins yapı modeliyle tasarım senaryosunda birlikte kullanılır.

Model dosyası: [engine/models/freeform_static.py](engine/models/freeform_static.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `points` | Kanat poligonu | m,m |
| `count` | Kanat sayısı | count |
| `bodyRadius` | Gövde yarıçapı | m |
| `referenceArea` | Referans alan | m² |
| `mach` | Mach | 1 |
| `alpha` | Hücum açısı | rad |
| `cnaOverrideEnabled` | CNa override | 1 |
| `cnaOverride` | CNa değeri | 1/rad |
| `cpOverrideEnabled` | CP override | 1 |
| `cpOverride` | CP değeri | m |

### Hesap nodeları

#### `freeform-static-aero/cna` — Serbest kanat CNa

- Hesap: FinPlanform::calculate(points) → area, span, midChordCosine; FinSetBarrowman::aggregateCna(area,span,cosine,Mach,alpha,Sref,N,Rbody).
- Girdiler/bağımlılıklar: `points` (m,m), `count` (count), `bodyRadius` (m), `referenceArea` (m²), `mach` (1), `alpha` (rad), `cnaOverrideEnabled` (1), `cnaOverride` (1/rad).
- Çıktı: `cna` · 1/rad; çerçeve: skaler.
- Python node: [engine/freeform_static/cna.py](engine/freeform_static/cna.py).
- C++ hesap: [native/freeform/cna.cpp](native/freeform/cna.cpp).
- Kaynak: RoketSiM src/components/FreeformFinSet.cpp::rawAeroProperties + include/aero/FinPlanform.hpp.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `freeform-static-aero/cp` — Serbest kanat yerel CP

- Hesap: FinPlanform::calculate(points) → x_MAC_lead + cpFraction(2 span²/area,Mach) × MAC.
- Girdiler/bağımlılıklar: `points` (m,m), `mach` (1), `cpOverrideEnabled` (1), `cpOverride` (m).
- Çıktı: `cp` · m; çerçeve: component-leading-origin.
- Python node: [engine/freeform_static/cp.py](engine/freeform_static/cp.py).
- C++ hesap: [native/freeform/cp.cpp](native/freeform/cp.cpp).
- Kaynak: RoketSiM src/components/FreeformFinSet.cpp::rawAeroProperties + include/aero/FinPlanform.hpp.
- Sürüm: `1.0.0`; sözleşme: `1`.

## İç tüp — `inner-tube`

Homojen iç tüp. İç yarıçap pozitif ve dış yarıçaptan küçük. Alt parçalar ve override değerleri dahil değil.

Model dosyası: [engine/models/inner_tube.py](engine/models/inner_tube.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `length` | Uzunluk | m |
| `radius` | Dış yarıçap | m |
| `innerRadius` | İç yarıçap | m |
| `density` | Yoğunluk | kg/m³ |

### Hesap nodeları

#### `inner-tube/cg` — Yerel CG

- Hesap: x_CG = L/2.
- Girdiler/bağımlılıklar: `length` (m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/inner_tube/centroid.py](engine/inner_tube/centroid.py).
- C++ hesap: [native/inner_tube/centroid.cpp](native/inner_tube/centroid.cpp).
- Kaynak: RoketSiM src/components/InnerTube.cpp: InnerTube::rawMassProperties.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `inner-tube/volume` — Hacim

- Hesap: V = π (R²−r²)L.
- Girdiler/bağımlılıklar: `radius` (m), `innerRadius` (m), `length` (m).
- Çıktı: `volume` · m³; çerçeve: skaler.
- Python node: [engine/inner_tube/volume.py](engine/inner_tube/volume.py).
- C++ hesap: [native/inner_tube/volume.cpp](native/inner_tube/volume.cpp).
- Kaynak: RoketSiM src/components/InnerTube.cpp: InnerTube::volume.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `inner-tube/mass` — Kütle

- Hesap: m = ρV.
- Girdiler/bağımlılıklar: `volume` (m³), `density` (kg/m³).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/inner_tube/mass.py](engine/inner_tube/mass.py).
- C++ hesap: [native/inner_tube/mass.cpp](native/inner_tube/mass.cpp).
- Kaynak: RoketSiM src/components/InnerTube.cpp: InnerTube::rawMassProperties.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `inner-tube/axial` — Eksenel atalet

- Hesap: Ixx = m(R²+r²)/2.
- Girdiler/bağımlılıklar: `mass` (kg), `radius` (m), `innerRadius` (m).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/inner_tube/axial.py](engine/inner_tube/axial.py).
- C++ hesap: [native/inner_tube/axial.cpp](native/inner_tube/axial.cpp).
- Kaynak: RoketSiM src/components/InnerTube.cpp: InnerTube::rawMassProperties.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `inner-tube/transverse` — Enine atalet

- Hesap: Iyy = Izz = m[3(R²+r²)+L²]/12.
- Girdiler/bağımlılıklar: `mass` (kg), `radius` (m), `innerRadius` (m), `length` (m).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/inner_tube/transverse.py](engine/inner_tube/transverse.py).
- C++ hesap: [native/inner_tube/transverse.cpp](native/inner_tube/transverse.cpp).
- Kaynak: RoketSiM src/components/InnerTube.cpp: InnerTube::rawMassProperties.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Atanan motor — `installed-motor`

Üretim CLI atanan motor modeli: t_local=t−ateşleme gecikmesi. Ateşleme öncesi itki 0, yakıt tamdır. CG uzunluğun yarısıdır (kaynağın geometrik fallback değeri). Enine atalet kuru motor ve kalan yakıtın ayrı katkılarından gelir. Üretim runtime modelinde motor eksenel atalet katkısı 0’dır; bu kaynak sınırlaması korunur. Motor yuvasının tüp kütlesi ayrıca hesaplanır. Yalnız launch gecikmesi, eş eksenli yerleşim; kullanıcı yuva başından motor başlangıcını mm olarak belirtir. Bağımsız kütle profili ve ayrılma desteklenmez.

Model dosyası: [engine/models/installed_motor.py](engine/models/installed_motor.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `curve` | İtki eğrisi | s,N |
| `time` | Simülasyon zamanı | s |
| `wet` | Başlangıç toplam kütlesi | kg |
| `propellant` | Başlangıç yakıt kütlesi | kg |
| `delay` | Ateşleme gecikmesi | s |
| `length` | Motor uzunluğu | m |
| `radius` | Motor yarıçapı | m |

### Hesap nodeları

#### `installed-motor/dry` — Kuru kütle

- Hesap: m_dry = m_wet − m_propellant; yakıt toplam kütleyi aşarsa hata.
- Girdiler/bağımlılıklar: `wet` (kg), `propellant` (kg).
- Çıktı: `dry` · kg; çerçeve: skaler.
- Python node: [engine/motor/dry.py](engine/motor/dry.py).
- C++ hesap: [native/motor/dry.cpp](native/motor/dry.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp · motor dry mass.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/totalImpulse` — Toplam impuls

- Hesap: J_total = tüm eğri segmentlerinin trapez impuls toplamı.
- Girdiler/bağımlılıklar: `curve` (s,N).
- Çıktı: `totalImpulse` · N·s; çerçeve: skaler.
- Python node: [engine/motor/total_impulse.py](engine/motor/total_impulse.py).
- C++ hesap: [native/motor/total_impulse.cpp](native/motor/total_impulse.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::remainingPropellantKg · totalImpulse loop.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/axial` — Üretim motor modeli eksenel ataleti

- Hesap: 0; kaynak evaluateMassProperties motor katkısı eksenel atalet taşımıyor.
- Girdiler/bağımlılıklar: .
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/installed_motor/axial.py](engine/installed_motor/axial.py).
- C++ hesap: [native/motor/axial.cpp](native/motor/axial.cpp).
- Kaynak: RoketSiM roketsim_cli.cpp::evaluateMassProperties · unsupported roll inertia = 0.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/cg` — Motor yerel CG

- Hesap: CG_local = L/2; kaynak üretim geometrik fallback.
- Girdiler/bağımlılıklar: `length` (m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/installed_motor/centroid.py](engine/installed_motor/centroid.py).
- C++ hesap: [native/motor/centroid.cpp](native/motor/centroid.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Motor) · midpoint fallback.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/inertiaCoefficient` — Motor atalet katsayısı

- Hesap: k = [m_wet (3R²+L²)/12] / m_wet; kaynak işlem sırası korunur.
- Girdiler/bağımlılıklar: `wet` (kg), `radius` (m), `length` (m).
- Çıktı: `inertiaCoefficient` · m²; çerçeve: skaler.
- Python node: [engine/installed_motor/inertia_coefficient.py](engine/installed_motor/inertia_coefficient.py).
- C++ hesap: [native/motor/inertia_coefficient.cpp](native/motor/inertia_coefficient.cpp).
- Kaynak: RoketSiM design_analysis.hpp Motor + motor_instances transverse_inertia_per_mass.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/localTime` — Motor yerel zamanı

- Hesap: t_local = t_simulation − delay; ateşleme öncesi negatif olabilir.
- Girdiler/bağımlılıklar: `time` (s), `delay` (s).
- Çıktı: `localTime` · s; çerçeve: skaler.
- Python node: [engine/installed_motor/local_time.py](engine/installed_motor/local_time.py).
- C++ hesap: [native/motor/local_time.cpp](native/motor/local_time.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp: t - resolved_ignition_time_s.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/impulse` — Tüketilen impuls

- Hesap: J(t) = zaman aralığına kırpılmış trapez impuls toplamı; üretim remainingPropellantKg döngüsü.
- Girdiler/bağımlılıklar: `curve` (s,N), `localTime` (s).
- Çıktı: `impulse` · N·s; çerçeve: skaler.
- Python node: [engine/motor/impulse.py](engine/motor/impulse.py).
- C++ hesap: [native/motor/impulse.cpp](native/motor/impulse.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::remainingPropellantKg · impulse loop.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/thrust` — Atanan motor itkisi

- Hesap: t_local < 0 ise 0; aksi halde kaynak üretim lerp.
- Girdiler/bağımlılıklar: `curve` (s,N), `localTime` (s).
- Çıktı: `thrust` · N; çerçeve: skaler.
- Python node: [engine/installed_motor/thrust.py](engine/installed_motor/thrust.py).
- C++ hesap: [native/motor/installed_thrust.cpp](native/motor/installed_thrust.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp: ignition gate + lerp.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/remaining` — Kalan yakıt

- Hesap: t ≤ 0 ise max(0,m_wet−m_dry); aksi halde bu başlangıç yakıtı × clamp(1−J(t)/max(J_total,1e−12),0,1).
- Girdiler/bağımlılıklar: `wet` (kg), `dry` (kg), `impulse` (N·s), `totalImpulse` (N·s), `localTime` (s).
- Çıktı: `remaining` · kg; çerçeve: skaler.
- Python node: [engine/motor/remaining.py](engine/motor/remaining.py).
- C++ hesap: [native/motor/remaining.cpp](native/motor/remaining.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::remainingPropellantKg · boundary/final expression.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/mass` — Anlık toplam kütle

- Hesap: m_motor(t) = m_dry + m_remaining(t).
- Girdiler/bağımlılıklar: `dry` (kg), `remaining` (kg).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/motor/mass.py](engine/motor/mass.py).
- C++ hesap: [native/motor/mass.cpp](native/motor/mass.cpp).
- Kaynak: RoketSiM src/propulsion/MotorModel.cpp::mass · dry + propellant.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `installed-motor/transverse` — Motor enine ataleti

- Hesap: I_transverse = m_dry k + m_remaining k; kaynak kuru/yakıt katkıları.
- Girdiler/bağımlılıklar: `dry` (kg), `remaining` (kg), `inertiaCoefficient` (m²).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/installed_motor/transverse.py](engine/installed_motor/transverse.py).
- C++ hesap: [native/motor/transverse.cpp](native/motor/transverse.cpp).
- Kaynak: RoketSiM roketsim_cli.cpp::evaluateMassProperties · dry/propellant contributions.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Kütle bileşeni — `mass-component`

Kullanıcı kütlesi pozitif bir homojen dolu silindir olarak modellenir. Yoğunluktan kütle türetilmez; CG L/2, ataletler dolu silindir kabulüdür.

Model dosyası: [engine/models/mass_component.py](engine/models/mass_component.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `length` | Uzunluk | m |
| `radius` | Yarıçap | m |
| `suppliedMass` | Girilen kütle | kg |

### Hesap nodeları

#### `mass-component/cg` — Yerel CG

- Hesap: x_CG = L/2.
- Girdiler/bağımlılıklar: `length` (m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/mass_component/centroid.py](engine/mass_component/centroid.py).
- C++ hesap: [native/mass_component/centroid.cpp](native/mass_component/centroid.cpp).
- Kaynak: RoketSiM src/components/MassComponent.cpp: MassComponent::rawMassProperties.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `mass-component/mass` — Kütle

- Hesap: m = kullanıcının girdiği pozitif kütle.
- Girdiler/bağımlılıklar: `suppliedMass` (kg).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/mass_component/mass.py](engine/mass_component/mass.py).
- C++ hesap: [native/mass_component/mass.cpp](native/mass_component/mass.cpp).
- Kaynak: RoketSiM src/components/MassComponent.cpp: MassComponent::rawMassProperties.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `mass-component/axial` — Eksenel atalet

- Hesap: Ixx = mR²/2.
- Girdiler/bağımlılıklar: `mass` (kg), `radius` (m).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/mass_component/axial.py](engine/mass_component/axial.py).
- C++ hesap: [native/mass_component/axial.cpp](native/mass_component/axial.cpp).
- Kaynak: RoketSiM src/components/MassComponent.cpp: MassComponent::rawMassProperties.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `mass-component/transverse` — Enine atalet

- Hesap: Iyy = Izz = m(3R²+L²)/12.
- Girdiler/bağımlılıklar: `mass` (kg), `radius` (m), `length` (m).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/mass_component/transverse.py](engine/mass_component/transverse.py).
- C++ hesap: [native/mass_component/transverse.cpp](native/mass_component/transverse.cpp).
- Kaynak: RoketSiM src/components/MassComponent.cpp: MassComponent::rawMassProperties.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Motor — `motor`

Üretim CLI motor hesabı: eğri 2–10000 zaman/itki çifti (düz liste), zamanlar artan ve değerler negatif olmayan sonlu sayılar. lerp uçlarda ilk/son itkiye sabitlenir; araya nokta eklenmez. Yerel zaman s, kütle kg. Yakıt tüketimi toplam impulsa oranlıdır; toplam impuls paydasındaki 1e-12 sınırı kaynak gibi korunur. Bu bağımsız model motor yerel zamanını alır. Montaj/gecikme installed-motor modelindedir; bağımsız kütle profili henüz bağlı değil.

Model dosyası: [engine/models/motor.py](engine/models/motor.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `curve` | İtki eğrisi | s,N |
| `time` | Motor yerel zamanı | s |
| `wet` | Başlangıç toplam kütlesi | kg |
| `propellant` | Başlangıç yakıt kütlesi | kg |

### Hesap nodeları

#### `motor/dry` — Kuru kütle

- Hesap: m_dry = m_wet − m_propellant; yakıt toplam kütleyi aşarsa hata.
- Girdiler/bağımlılıklar: `wet` (kg), `propellant` (kg).
- Çıktı: `dry` · kg; çerçeve: skaler.
- Python node: [engine/motor/dry.py](engine/motor/dry.py).
- C++ hesap: [native/motor/dry.cpp](native/motor/dry.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp · motor dry mass.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `motor/impulse` — Tüketilen impuls

- Hesap: J(t) = zaman aralığına kırpılmış trapez impuls toplamı; üretim remainingPropellantKg döngüsü.
- Girdiler/bağımlılıklar: `curve` (s,N), `time` (s).
- Çıktı: `impulse` · N·s; çerçeve: skaler.
- Python node: [engine/motor/impulse.py](engine/motor/impulse.py).
- C++ hesap: [native/motor/impulse.cpp](native/motor/impulse.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::remainingPropellantKg · impulse loop.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `motor/thrust` — Anlık itki

- Hesap: F(t) = üretim lerp; komşu örnekler arasında doğrusal, eğri uçlarında sabit.
- Girdiler/bağımlılıklar: `curve` (s,N), `time` (s).
- Çıktı: `thrust` · N; çerçeve: skaler.
- Python node: [engine/motor/thrust.py](engine/motor/thrust.py).
- C++ hesap: [native/motor/thrust.cpp](native/motor/thrust.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::lerp.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `motor/totalImpulse` — Toplam impuls

- Hesap: J_total = tüm eğri segmentlerinin trapez impuls toplamı.
- Girdiler/bağımlılıklar: `curve` (s,N).
- Çıktı: `totalImpulse` · N·s; çerçeve: skaler.
- Python node: [engine/motor/total_impulse.py](engine/motor/total_impulse.py).
- C++ hesap: [native/motor/total_impulse.cpp](native/motor/total_impulse.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::remainingPropellantKg · totalImpulse loop.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `motor/remaining` — Kalan yakıt

- Hesap: t ≤ 0 ise max(0,m_wet−m_dry); aksi halde bu başlangıç yakıtı × clamp(1−J(t)/max(J_total,1e−12),0,1).
- Girdiler/bağımlılıklar: `wet` (kg), `dry` (kg), `impulse` (N·s), `totalImpulse` (N·s), `time` (s).
- Çıktı: `remaining` · kg; çerçeve: skaler.
- Python node: [engine/motor/remaining.py](engine/motor/remaining.py).
- C++ hesap: [native/motor/remaining.cpp](native/motor/remaining.cpp).
- Kaynak: RoketSiM src/cli/roketsim_cli.cpp::remainingPropellantKg · boundary/final expression.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `motor/mass` — Anlık toplam kütle

- Hesap: m_motor(t) = m_dry + m_remaining(t).
- Girdiler/bağımlılıklar: `dry` (kg), `remaining` (kg).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/motor/mass.py](engine/motor/mass.py).
- C++ hesap: [native/motor/mass.cpp](native/motor/mass.cpp).
- Kaynak: RoketSiM src/propulsion/MotorModel.cpp::mass · dry + propellant.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Burun konisi — `nose`

Eski üretim analiz yolu: 128 kesik koniyle kabuk integrasyonu; et kalınlığı yüzeye normaldir. Konik, teğet ogiv, elipsoid, parabolik, üs ve Haack profilleri; dolu yapı, omuz ve kapak dahil. Hacim/CG yoğunluk 1 ile geometrik olarak değerlendirilir; kütle ve ataletler gerçek yoğunlukla değerlendirilir. Bu grup burun aerodinamiği hesaplamaz. Profil kodları: 0 konik, 1 teğet ogiv, 2 elipsoid, 3 parabolik, 4 üs, 5 Haack. filled: 0 kabuk, 1 dolu; capped: 0 kapak yok, 1 kapak var. Sekant ogiv desteklenmez.

Model dosyası: [engine/models/nose.py](engine/models/nose.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `length` | Uzunluk | m |
| `radius` | Taban yarıçapı | m |
| `wall` | Et kalınlığı | m |
| `profile` | Profil | 1 |
| `parameter` | Profil parametresi | 1 |
| `filled` | Dolu yapı | 1 |
| `shoulderLength` | Omuz uzunluğu | m |
| `shoulderRadius` | Omuz yarıçapı | m |
| `shoulderWall` | Omuz et kalınlığı | m |
| `capped` | Omuz kapağı | 1 |
| `density` | Yoğunluk | kg/m³ |

### Hesap nodeları

#### `nose/axial` — Eksenel atalet

- Hesap: Kesitlerde ½ dm(r_outer²+r_inner²) toplamı; omuz ve kapak kendi CG ataletleriyle eklenir..
- Girdiler/bağımlılıklar: `length` (m), `radius` (m), `wall` (m), `profile` (1), `parameter` (1), `filled` (1), `shoulderLength` (m), `shoulderRadius` (m), `shoulderWall` (m), `capped` (1), `density` (kg/m³).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/nose/axial.py](engine/nose/axial.py).
- C++ hesap: [native/nose/axial.cpp](native/nose/axial.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: noseRadius + integrateShell + analyzeComponent(Nose Cone).
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `nose/cg` — Yerel CG

- Hesap: Geometrik ilk moment / hacim; omuz/kapak eklenirken ağırlıklı birleşim. Yoğunluk homojen olduğundan bu node ρ=1 kullanır. Sıfır kütlede kaynak gibi 0..
- Girdiler/bağımlılıklar: `length` (m), `radius` (m), `wall` (m), `profile` (1), `parameter` (1), `filled` (1), `shoulderLength` (m), `shoulderRadius` (m), `shoulderWall` (m), `capped` (1).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/nose/centroid.py](engine/nose/centroid.py).
- C++ hesap: [native/nose/centroid.cpp](native/nose/centroid.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: noseRadius + integrateShell + analyzeComponent(Nose Cone).
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `nose/mass` — Kütle

- Hesap: Her kesitte dm = ρ dV; kesit kütlelerinin, omuzun ve kapağın toplamı..
- Girdiler/bağımlılıklar: `length` (m), `radius` (m), `wall` (m), `profile` (1), `parameter` (1), `filled` (1), `shoulderLength` (m), `shoulderRadius` (m), `shoulderWall` (m), `capped` (1), `density` (kg/m³).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/nose/mass.py](engine/nose/mass.py).
- C++ hesap: [native/nose/mass.cpp](native/nose/mass.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: noseRadius + integrateShell + analyzeComponent(Nose Cone).
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `nose/transverse` — Enine atalet

- Hesap: Kesitlerde dm[¼(r_outer²+r_inner²)+x²] toplanır, toplam CG’ye kaydırılır. Omuz/kapak paralel eksen terimleriyle birleştirilir..
- Girdiler/bağımlılıklar: `length` (m), `radius` (m), `wall` (m), `profile` (1), `parameter` (1), `filled` (1), `shoulderLength` (m), `shoulderRadius` (m), `shoulderWall` (m), `capped` (1), `density` (kg/m³).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/nose/transverse.py](engine/nose/transverse.py).
- C++ hesap: [native/nose/transverse.cpp](native/nose/transverse.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: noseRadius + integrateShell + analyzeComponent(Nose Cone).
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `nose/volume` — Hacim

- Hesap: 128 kesik koninin dış−iç hacimlerinin toplamı + omuz halka hacmi + varsa kapak hacmi. radialWall = t hypot(Δr,Δx)/Δx; integral gövdesi shell.hpp içinde..
- Girdiler/bağımlılıklar: `length` (m), `radius` (m), `wall` (m), `profile` (1), `parameter` (1), `filled` (1), `shoulderLength` (m), `shoulderRadius` (m), `shoulderWall` (m), `capped` (1).
- Çıktı: `volume` · m³; çerçeve: skaler.
- Python node: [engine/nose/volume.py](engine/nose/volume.py).
- C++ hesap: [native/nose/volume.cpp](native/nose/volume.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: noseRadius + integrateShell + analyzeComponent(Nose Cone).
- Sürüm: `1.0.0`; sözleşme: `1`.

Ortak sayısal yardımcılar: [native/nose/profile.hpp](native/nose/profile.hpp), [native/nose/shell.hpp](native/nose/shell.hpp), [native/nose/shoulder.hpp](native/nose/shoulder.hpp), [native/nose/properties.hpp](native/nose/properties.hpp).

## Burun statik aerodinamiği — `nose-static-aero`

Eski üretim tasarım analizindeki burun CNa ve CP yolu. CNa taban alanının roket referans alanına oranıyla ölçeklenir. Konik CP 2L/3, teğet ogiv CP 2000 dilimli hacim integraliyle, diğer desteklenen profiller L/2 alınır. Kullanıcı override değeri etkinse kaynak davranışıyla hesaplanan değerin yerini alır.

Model dosyası: [engine/models/nose_static.py](engine/models/nose_static.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `length` | Uzunluk | m |
| `radius` | Taban yarıçapı | m |
| `profile` | Profil | 1 |
| `referenceRadius` | Referans yarıçap | m |
| `cnaOverrideEnabled` | CNa override | 1 |
| `cnaOverride` | CNa değeri | 1/rad |
| `cpOverrideEnabled` | CP override | 1 |
| `cpOverride` | CP değeri | m |

### Hesap nodeları

#### `nose-static-aero/cna` — Burun CNa

- Hesap: override açıksa girilen değer; değilse CNa = 2 R_base²/R_ref².
- Girdiler/bağımlılıklar: `length` (m), `radius` (m), `profile` (1), `referenceRadius` (m), `cnaOverrideEnabled` (1), `cnaOverride` (1/rad), `cpOverrideEnabled` (1), `cpOverride` (m).
- Çıktı: `cna` · 1/rad; çerçeve: skaler.
- Python node: [engine/static_nose/cna.py](engine/static_nose/cna.py).
- C++ hesap: [native/static_aero/nose_cna.cpp](native/static_aero/nose_cna.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Nose Cone) · CNa and override.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `nose-static-aero/cp` — Burun yerel CP

- Hesap: override açıksa girilen yerel değer; değilse konik 2L/3, teğet ogiv L−V/(πR²), diğer profiller L/2.
- Girdiler/bağımlılıklar: `length` (m), `radius` (m), `profile` (1), `referenceRadius` (m), `cnaOverrideEnabled` (1), `cnaOverride` (1/rad), `cpOverrideEnabled` (1), `cpOverride` (m).
- Çıktı: `cp` · m; çerçeve: component-leading-origin.
- Python node: [engine/static_nose/cp.py](engine/static_nose/cp.py).
- C++ hesap: [native/static_aero/nose_cp.cpp](native/static_aero/nose_cp.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::tangentOgiveCpFromVolume + analyzeComponent(Nose Cone) · CP and override.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Paketlenmiş kurtarma elemanı — `packed-recovery`

Eski üretim tasarım analizindeki paketlenmiş paraşüt/şok kordonu kütle katkısı. Kütle açık girdidir, yerel CG paket boyunun yarısıdır; kaynak bu bileşenlere atalet atamadığı için eksenel ve enine atalet sıfırdır. Paraşüt kütlesi kullanıcıdan, kordon kütlesi doğrusal yoğunluk × gerçek kordon uzunluğundan gelir.

Model dosyası: [engine/models/recovery.py](engine/models/recovery.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `length` | Paket boyu | m |
| `suppliedMass` | Paket kütlesi | kg |

### Hesap nodeları

#### `packed-recovery/cg` — Yerel CG

- Hesap: x_CG = paketlenmiş boy / 2.
- Girdiler/bağımlılıklar: `length` (m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/recovery/centroid.py](engine/recovery/centroid.py).
- C++ hesap: [native/recovery/centroid.cpp](native/recovery/centroid.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Parachute / Shock Cord) · packed length / 2.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `packed-recovery/mass` — Paketlenmiş kütle

- Hesap: m = girilen paket kütlesi; kordon için adaptörde λ L_cord.
- Girdiler/bağımlılıklar: `suppliedMass` (kg).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/recovery/mass.py](engine/recovery/mass.py).
- C++ hesap: [native/recovery/mass.cpp](native/recovery/mass.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Parachute / Shock Cord) · supplied packed mass.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `packed-recovery/axial` — Eksenel atalet

- Hesap: Ixx = 0; eski üretim analizinde atalet atanmaz.
- Girdiler/bağımlılıklar: `mass` (kg).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/recovery/axial.py](engine/recovery/axial.py).
- C++ hesap: [native/recovery/inertia.cpp](native/recovery/inertia.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Parachute / Shock Cord) · no inertia assigned.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `packed-recovery/transverse` — Enine atalet

- Hesap: Iyy = Izz = 0; eski üretim analizinde atalet atanmaz.
- Girdiler/bağımlılıklar: `mass` (kg).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/recovery/transverse.py](engine/recovery/transverse.py).
- C++ hesap: [native/recovery/inertia.cpp](native/recovery/inertia.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Parachute / Shock Cord) · no inertia assigned.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Ray düğmesi — `rail-button`

Eski üretim analizindeki ray düğmesi fizik modeli. Taban ve flanş dış çapla, orta standoff iç çapla, opsiyonel vida başı 2/3 silindir hacmiyle hesaplanır. Birden çok düğme eksen boyunca aralıklıysa toplam CG ve enine atalet paralel eksen katkısıyla gruplanır.

Model dosyası: [engine/models/rail_button.py](engine/models/rail_button.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `height` | Yükseklik | m |
| `outerRadius` | Dış yarıçap | m |
| `innerRadius` | İç yarıçap | m |
| `baseHeight` | Taban yüksekliği | m |
| `flangeHeight` | Flanş yüksekliği | m |
| `screwHeight` | Vida yüksekliği | m |
| `count` | Tekrar sayısı | count |
| `separation` | Tekrar aralığı | m |
| `density` | Yoğunluk | kg/m³ |

### Hesap nodeları

#### `rail-button/cg` — Yerel grup CG

- Hesap: x_CG = h/2 + (N−1) separation/2.
- Girdiler/bağımlılıklar: `height` (m), `outerRadius` (m), `innerRadius` (m), `baseHeight` (m), `flangeHeight` (m), `screwHeight` (m), `count` (count), `separation` (m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/rail_button/centroid.py](engine/rail_button/centroid.py).
- C++ hesap: [native/rail_button/centroid.cpp](native/rail_button/centroid.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::aggregateLocalCg · height/2 + mean instance offset.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `rail-button/volume` — Hacim

- Hesap: Nπ[R²(h_base+h_flange)+r² max(h−h_base−h_flange,0)+(2/3)R²h_screw].
- Girdiler/bağımlılıklar: `height` (m), `outerRadius` (m), `innerRadius` (m), `baseHeight` (m), `flangeHeight` (m), `screwHeight` (m), `count` (count), `separation` (m).
- Çıktı: `volume` · m³; çerçeve: skaler.
- Python node: [engine/rail_button/volume.py](engine/rail_button/volume.py).
- C++ hesap: [native/rail_button/volume.cpp](native/rail_button/volume.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Rail Button) · physical volume and instances.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `rail-button/mass` — Kütle

- Hesap: m = ρV.
- Girdiler/bağımlılıklar: `volume` (m³), `density` (kg/m³).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/rail_button/mass.py](engine/rail_button/mass.py).
- C++ hesap: [native/rail_button/mass.cpp](native/rail_button/mass.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Rail Button) · density × volume.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `rail-button/axial` — Eksenel atalet

- Hesap: Ixx = ½m(R²+r²).
- Girdiler/bağımlılıklar: `mass` (kg), `outerRadius` (m), `innerRadius` (m).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/rail_button/axial.py](engine/rail_button/axial.py).
- C++ hesap: [native/rail_button/axial.cpp](native/rail_button/axial.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Rail Button) · iAxial.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `rail-button/transverse` — Enine atalet

- Hesap: Iyy=Izz=m[3(R²+r²)+h²]/12 + Σ(m/N)(x_i−x_group)².
- Girdiler/bağımlılıklar: `mass` (kg), `height` (m), `outerRadius` (m), `innerRadius` (m), `count` (count), `separation` (m).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/rail_button/transverse.py](engine/rail_button/transverse.py).
- C++ hesap: [native/rail_button/transverse.cpp](native/rail_button/transverse.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp::analyzeComponent(Rail Button) + generic axial instance spread.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Geçiş konisi — `transition`

Eski Transition sınıfının kesik koni kabuk modeli. Ön/arka yarıçap, uzunluk ve sabit radyal et kalınlığıyla dış hacimden iç hacim çıkarılır. CG analitik kesik koni farkıdır; ataletler kaynak gibi 2000 orta nokta dilimiyle hesaplanır.

Model dosyası: [engine/models/transition.py](engine/models/transition.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `length` | Uzunluk | m |
| `foreRadius` | Ön yarıçap | m |
| `aftRadius` | Arka yarıçap | m |
| `wall` | Et kalınlığı | m |
| `density` | Yoğunluk | kg/m³ |

### Hesap nodeları

#### `transition/axial` — Eksenel atalet

- Hesap: Ixx = ∫ ½ρπ(ro⁴−ri⁴) dx; 2000 orta nokta.
- Girdiler/bağımlılıklar: `length` (m), `foreRadius` (m), `aftRadius` (m), `wall` (m), `density` (kg/m³).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/transition/axial.py](engine/transition/axial.py).
- C++ hesap: [native/transition/axial.cpp](native/transition/axial.cpp).
- Kaynak: RoketSiM src/components/Transition.cpp::rawMassProperties · Izz midpoint integration, 2000 slices.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `transition/cg` — Yerel CG

- Hesap: Dış ve iç kesik konilerin analitik hacim-ağırlıklı CG farkı.
- Girdiler/bağımlılıklar: `length` (m), `foreRadius` (m), `aftRadius` (m), `wall` (m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/transition/centroid.py](engine/transition/centroid.py).
- C++ hesap: [native/transition/centroid.cpp](native/transition/centroid.cpp).
- Kaynak: RoketSiM src/components/Transition.cpp::cgZ.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `transition/volume` — Hacim

- Hesap: V = πL(Rf²+RfRa+Ra²)/3 − πL(rf²+rfra+ra²)/3.
- Girdiler/bağımlılıklar: `length` (m), `foreRadius` (m), `aftRadius` (m), `wall` (m).
- Çıktı: `volume` · m³; çerçeve: skaler.
- Python node: [engine/transition/volume.py](engine/transition/volume.py).
- C++ hesap: [native/transition/volume.cpp](native/transition/volume.cpp).
- Kaynak: RoketSiM src/components/Transition.cpp::volume.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `transition/transverse` — Enine atalet

- Hesap: Iyy=Izz=∫ρπ(ro²−ri²)[¼(ro²+ri²)+(x−CG)²]dx; 2000 orta nokta.
- Girdiler/bağımlılıklar: `length` (m), `foreRadius` (m), `aftRadius` (m), `wall` (m), `density` (kg/m³), `cg` (m).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/transition/transverse.py](engine/transition/transverse.py).
- C++ hesap: [native/transition/transverse.cpp](native/transition/transverse.cpp).
- Kaynak: RoketSiM src/components/Transition.cpp::rawMassProperties · Ixx midpoint integration, 2000 slices.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `transition/mass` — Kütle

- Hesap: m = ρV.
- Girdiler/bağımlılıklar: `volume` (m³), `density` (kg/m³).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/transition/mass.py](engine/transition/mass.py).
- C++ hesap: [native/transition/mass.cpp](native/transition/mass.cpp).
- Kaynak: RoketSiM src/components/Transition.cpp::rawMassProperties · density × volume.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Geçiş statik aerodinamiği — `transition-static-aero`

Eski Barrowman geçiş hesabı. CNa ön/arka taban alanı farkından, yerel CP klasik konik geçiş ifadesinden gelir. Kullanıcı override değeri etkinse hesaplanan değerin yerini alır.

Model dosyası: [engine/models/transition_static.py](engine/models/transition_static.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `length` | Uzunluk | m |
| `foreRadius` | Ön yarıçap | m |
| `aftRadius` | Arka yarıçap | m |
| `referenceRadius` | Referans yarıçap | m |
| `cnaOverrideEnabled` | CNa override | 1 |
| `cnaOverride` | CNa değeri | 1/rad |
| `cpOverrideEnabled` | CP override | 1 |
| `cpOverride` | CP değeri | m |

### Hesap nodeları

#### `transition-static-aero/cna` — Geçiş CNa

- Hesap: override açıksa girilen değer; değilse 2(Ra²−Rf²)/Rref².
- Girdiler/bağımlılıklar: `length` (m), `foreRadius` (m), `aftRadius` (m), `referenceRadius` (m), `cnaOverrideEnabled` (1), `cnaOverride` (1/rad), `cpOverrideEnabled` (1), `cpOverride` (m).
- Çıktı: `cna` · 1/rad; çerçeve: skaler.
- Python node: [engine/static_transition/cna.py](engine/static_transition/cna.py).
- C++ hesap: [native/static_aero/transition_cna.cpp](native/static_aero/transition_cna.cpp).
- Kaynak: RoketSiM include/aero/Barrowman.hpp::transitionCna + override.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `transition-static-aero/cp` — Geçiş yerel CP

- Hesap: override açıksa girilen değer; değilse L(Rf+2Ra)/[3(Rf+Ra)].
- Girdiler/bağımlılıklar: `length` (m), `foreRadius` (m), `aftRadius` (m), `referenceRadius` (m), `cnaOverrideEnabled` (1), `cnaOverride` (1/rad), `cpOverrideEnabled` (1), `cpOverride` (m).
- Çıktı: `cp` · m; çerçeve: component-leading-origin.
- Python node: [engine/static_transition/cp.py](engine/static_transition/cp.py).
- C++ hesap: [native/static_aero/transition_cp.cpp](native/static_aero/transition_cp.cpp).
- Kaynak: RoketSiM include/aero/Barrowman.hpp::transitionCpLocal + override.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Trapez kanat seti — `trapezoidal-fins`

Eski üretim analizindeki trapez kanat yolu. Kesit kodu sırası: 0 düz, 1 yuvarlatılmış, 2 airfoil, 3 diamond, 4 biconvex. Kesit hacim katsayıları: düz 1, yuvarlatılmış 0.99, airfoil 0.65, diamond 0.5, biconvex 0.6. Kök dili hacim/kütleye katılır; eski kodun CG ve atalet yaklaşımı aynen korunur (dil nedeniyle ek CG kayması eklenmez). Serbest/tüp kanat, hex kesit, kant ve radyal dönüş bu modelin kapsamında değil.

Model dosyası: [engine/models/fins.py](engine/models/fins.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `root` | Kök veter | m |
| `tip` | Uç veter | m |
| `span` | Açıklık | m |
| `sweep` | Süpürme | m |
| `thickness` | Kalınlık | m |
| `count` | Kanat sayısı | count |
| `sectionCode` | Kesit | 1 |
| `density` | Yoğunluk | kg/m³ |
| `bodyRadius` | Gövde yarıçapı | m |
| `tabHeight` | Dil yüksekliği | m |
| `tabLength` | Dil uzunluğu | m |

### Hesap nodeları

#### `trapezoidal-fins/area` — Alan

- Hesap: Tek kanadın açık alanı A = (c_root+c_tip) span/2.
- Girdiler/bağımlılıklar: `root` (m), `tip` (m), `span` (m).
- Çıktı: `area` · m²; çerçeve: skaler.
- Python node: [engine/fins/area.py](engine/fins/area.py).
- C++ hesap: [native/fins/area.cpp](native/fins/area.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `trapezoidal-fins/cg` — Yerel CG

- Hesap: x_CG = [c_root²+c_root c_tip+c_tip²+sweep(c_root+2c_tip)]/[3(c_root+c_tip)]; payda ≤1e−12 ise 0.
- Girdiler/bağımlılıklar: `root` (m), `tip` (m), `sweep` (m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/fins/centroid.py](engine/fins/centroid.py).
- C++ hesap: [native/fins/centroid.cpp](native/fins/centroid.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `trapezoidal-fins/length` — Eksenel boy

- Hesap: L_effective = max(c_root,sweep+c_tip).
- Girdiler/bağımlılıklar: `root` (m), `tip` (m), `sweep` (m).
- Çıktı: `length` · m; çerçeve: skaler.
- Python node: [engine/fins/length.py](engine/fins/length.py).
- C++ hesap: [native/fins/length.cpp](native/fins/length.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `trapezoidal-fins/radial` — Radyal konum

- Hesap: r_station = R_parent + span/2.
- Girdiler/bağımlılıklar: `bodyRadius` (m), `span` (m).
- Çıktı: `radial` · m; çerçeve: skaler.
- Python node: [engine/fins/radial.py](engine/fins/radial.py).
- C++ hesap: [native/fins/radial.cpp](native/fins/radial.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `trapezoidal-fins/sectionFactor` — Kesit katsayısı

- Hesap: Kesit kodu → kaynak üretim hacim katsayısı.
- Girdiler/bağımlılıklar: `sectionCode` (1).
- Çıktı: `sectionFactor` · 1; çerçeve: skaler.
- Python node: [engine/fins/section.py](engine/fins/section.py).
- C++ hesap: [native/fins/section.cpp](native/fins/section.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `trapezoidal-fins/volume` — Hacim

- Hesap: V = N (A+h_tab L_tab) t k_section.
- Girdiler/bağımlılıklar: `count` (count), `area` (m²), `tabHeight` (m), `tabLength` (m), `thickness` (m), `sectionFactor` (1).
- Çıktı: `volume` · m³; çerçeve: skaler.
- Python node: [engine/fins/volume.py](engine/fins/volume.py).
- C++ hesap: [native/fins/volume.cpp](native/fins/volume.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `trapezoidal-fins/mass` — Kütle

- Hesap: m = ρV.
- Girdiler/bağımlılıklar: `volume` (m³), `density` (kg/m³).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/fins/mass.py](engine/fins/mass.py).
- C++ hesap: [native/fins/mass.cpp](native/fins/mass.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `trapezoidal-fins/axial` — Eksenel atalet

- Hesap: Ixx = m r_station².
- Girdiler/bağımlılıklar: `mass` (kg), `radial` (m).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/fins/axial.py](engine/fins/axial.py).
- C++ hesap: [native/fins/axial.cpp](native/fins/axial.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `trapezoidal-fins/transverse` — Enine atalet

- Hesap: Iyy = Izz = m(L_effective²+r_station²)/12.
- Girdiler/bağımlılıklar: `mass` (kg), `length` (m), `radial` (m).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/fins/transverse.py](engine/fins/transverse.py).
- C++ hesap: [native/fins/transverse.cpp](native/fins/transverse.cpp).
- Kaynak: RoketSiM src/cli/design_analysis.hpp: analyzeComponent(Fins), trapezoidal branch.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Gövde tüpü — `tube`

Homojen, tek gövde tüpü. Et kalınlığı yarıçaptan küçük; sıfır et kalınlığı sıfır hacim verir. Alt parçalar ve kütle/CG override değerleri dahil değil.

Model dosyası: [engine/models/tube.py](engine/models/tube.py).

### Kullanıcı girdileri

| Port | Anlam | SI birimi |
|---|---|---|
| `length` | Uzunluk | m |
| `radius` | Dış yarıçap | m |
| `wall` | Et kalınlığı | m |
| `density` | Yoğunluk | kg/m³ |

### Hesap nodeları

#### `tube/cg` — Yerel CG

- Hesap: x_CG = L/2.
- Girdiler/bağımlılıklar: `length` (m).
- Çıktı: `cg` · m; çerçeve: component-leading-origin.
- Python node: [engine/nodes/centroid.py](engine/nodes/centroid.py).
- C++ hesap: [native/tube/centroid.cpp](native/tube/centroid.cpp).
- Kaynak: RoketSiM src/components/BodyTube.cpp: BodyTube::rawMassProperties · cgLocal.z.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `tube/volume` — Hacim

- Hesap: V = π [R² − (R−t)²] L.
- Girdiler/bağımlılıklar: `radius` (m), `wall` (m), `length` (m).
- Çıktı: `volume` · m³; çerçeve: skaler.
- Python node: [engine/nodes/volume.py](engine/nodes/volume.py).
- C++ hesap: [native/tube/volume.cpp](native/tube/volume.cpp).
- Kaynak: RoketSiM src/components/BodyTube.cpp: BodyTube::volume.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `tube/mass` — Kütle

- Hesap: m = ρV.
- Girdiler/bağımlılıklar: `volume` (m³), `density` (kg/m³).
- Çıktı: `mass` · kg; çerçeve: skaler.
- Python node: [engine/nodes/mass.py](engine/nodes/mass.py).
- C++ hesap: [native/tube/mass.cpp](native/tube/mass.cpp).
- Kaynak: RoketSiM src/components/BodyTube.cpp: BodyTube::rawMassProperties · mass.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `tube/axial` — Eksenel atalet

- Hesap: Ixx = m [R²+(R−t)²]/2.
- Girdiler/bağımlılıklar: `mass` (kg), `radius` (m), `wall` (m).
- Çıktı: `axial` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/nodes/axial.py](engine/nodes/axial.py).
- C++ hesap: [native/tube/axial.cpp](native/tube/axial.cpp).
- Kaynak: RoketSiM src/components/BodyTube.cpp: BodyTube::rawMassProperties · Izz → STARLAB Ixx.
- Sürüm: `1.0.0`; sözleşme: `1`.

#### `tube/transverse` — Enine atalet

- Hesap: Iyy = Izz = m [3(R²+(R−t)²)+L²]/12.
- Girdiler/bağımlılıklar: `mass` (kg), `radius` (m), `wall` (m), `length` (m).
- Çıktı: `transverse` · kg·m²; çerçeve: component-local-cg.
- Python node: [engine/nodes/transverse.py](engine/nodes/transverse.py).
- C++ hesap: [native/tube/transverse.cpp](native/tube/transverse.cpp).
- Kaynak: RoketSiM src/components/BodyTube.cpp: BodyTube::rawMassProperties · Ixx = Iyy → STARLAB Iyy = Izz.
- Sürüm: `1.0.0`; sözleşme: `1`.

## Dinamik roket yapı ağı — `rocket`

Dosya: [engine/assembly.py](engine/assembly.py). Mevcut parça modellerinden otomatik kurulur; parça ID’si hash’iyle kalıcı prefix kullanılır. Aynı parça listesinde yalnız değişen kaynakların bağlı nodeları çalışır; ekleme/silmede geçerli cache korunur.
İlk kapsam: tek kademe, eş eksenli yapı, en fazla 64 fiziksel parça. Desteklenen her fiziksel bileşen ayrı katkıdır. Desteklenmeyen/eksik parçalar ve destek dışı radyal/tekrarlı montaj hesap başlamadan bildirilir; gizlice atlanan parça yoktur.
Bileşen kütle ve yerel CG override değerleri ham parça hesabından sonra toplamaya uygulanır; kaynak üretim yolu gibi geometrik ataletler ham modelden kalır. Alt ağaç kapsamlı override henüz desteklenmez.
UI veri projeksiyonu: [src/engine/rocketInputs.ts](src/engine/rocketInputs.ts); sonuç: [src/components/engineering/RocketMass.tsx](src/components/engineering/RocketMass.tsx) (Analiz → Kütle). Konum resolveParts üzerinden SI’ya çevrilir; fizik UI’da hesaplanmaz.
Aşağıdaki tarifler parça başına ve birleştirme adımı başına çoğaltılır; parçaların asıl nodeları yukarıdaki tablolardan gelir.

#### `p<hash>_globalCg`

- Hesap: Global CG = bileşen konumu + yerel CG. Çıktı: m.
- Python node fabrikası: [engine/assembly.py](engine/assembly.py).
- C++: [native/assembly/sum.cpp](native/assembly/sum.cpp).
- Değiştirilmeden alınan kaynak yardımcı: [native/assembly/runtime_mass_properties.hpp](native/assembly/runtime_mass_properties.hpp).

#### `p<hash>_moment`

- Hesap: İlk moment = m x; OriginAccumulator::add. Çıktı: kg·m.
- Python node fabrikası: [engine/assembly.py](engine/assembly.py).
- C++: [native/assembly/moment.cpp](native/assembly/moment.cpp).
- Değiştirilmeden alınan kaynak yardımcı: [native/assembly/runtime_mass_properties.hpp](native/assembly/runtime_mass_properties.hpp).

#### `p<hash>_origin`

- Hesap: Enine atalet ortak başlangıca taşınır: I_origin = I_cg + m x². Çıktı: kg·m².
- Python node fabrikası: [engine/assembly.py](engine/assembly.py).
- C++: [native/assembly/origin.cpp](native/assembly/origin.cpp).
- Değiştirilmeden alınan kaynak yardımcı: [native/assembly/runtime_mass_properties.hpp](native/assembly/runtime_mass_properties.hpp).

#### `p<hash>_axialOrigin`

- Hesap: Eş eksenli X kaydırmasında Ixx değişmez. Çıktı: kg·m².
- Python node fabrikası: [engine/assembly.py](engine/assembly.py).
- C++: [native/assembly/sum.cpp](native/assembly/sum.cpp).
- Değiştirilmeden alınan kaynak yardımcı: [native/assembly/runtime_mass_properties.hpp](native/assembly/runtime_mass_properties.hpp).

#### `p<hash>_sum_mass / sum_moment / sum_axial / sum_origin`

- Hesap: İlgili katkıların sıralı toplamı; OriginAccumulator::merge. Çıktı: ilgili port.
- Python node fabrikası: [engine/assembly.py](engine/assembly.py).
- C++: [native/assembly/sum.cpp](native/assembly/sum.cpp).
- Değiştirilmeden alınan kaynak yardımcı: [native/assembly/runtime_mass_properties.hpp](native/assembly/runtime_mass_properties.hpp).

#### `total_mass`

- Hesap: Tüm fiziksel parçaların kütle toplamı. Çıktı: kg.
- Python node fabrikası: [engine/assembly.py](engine/assembly.py).
- C++: [native/assembly/sum.cpp](native/assembly/sum.cpp).
- Değiştirilmeden alınan kaynak yardımcı: [native/assembly/runtime_mass_properties.hpp](native/assembly/runtime_mass_properties.hpp).

#### `total_cg`

- Hesap: CG_x = ilk moment / toplam kütle; kaynak finalize gibi sıfır kütlede 0. Çıktı: m.
- Python node fabrikası: [engine/assembly.py](engine/assembly.py).
- C++: [native/assembly/centroid.cpp](native/assembly/centroid.cpp).
- Değiştirilmeden alınan kaynak yardımcı: [native/assembly/runtime_mass_properties.hpp](native/assembly/runtime_mass_properties.hpp).

#### `total_axial`

- Hesap: Tüm Ixx katkıları; eş eksenli yapı. Çıktı: kg·m².
- Python node fabrikası: [engine/assembly.py](engine/assembly.py).
- C++: [native/assembly/sum.cpp](native/assembly/sum.cpp).
- Değiştirilmeden alınan kaynak yardımcı: [native/assembly/runtime_mass_properties.hpp](native/assembly/runtime_mass_properties.hpp).

#### `total_transverse`

- Hesap: Iyy = Izz = max(0, toplam I_origin − toplam kütle CG_x²). Çıktı: kg·m².
- Python node fabrikası: [engine/assembly.py](engine/assembly.py).
- C++: [native/assembly/transverse.cpp](native/assembly/transverse.cpp).
- Değiştirilmeden alınan kaynak yardımcı: [native/assembly/runtime_mass_properties.hpp](native/assembly/runtime_mass_properties.hpp).

## Bağlı aero ağı — `rocket-aero`

Senaryo: [engine/scenarios/rocket_aero.py](engine/scenarios/rocket_aero.py); genel tipli model bağlayıcı: [engine/coupling.py](engine/coupling.py). aero-forces.cg kaynağı yerine rocket.total_cg çıkışı bağlanır. Aero girdisi değişince statik yapı çalışmaz; motor yakıtı CG’yi değiştirince yalnız moment/marj kolu etkilenir. Her hesap kendi Python/C++ dosyasındadır.

## Doğrulama ve sınırlar

Yeni üretim yolu kaynak kaydı: [native/source-provenance.json](native/source-provenance.json).
Karşılaştırma: `python3 scripts/check-legacy-design.py /home/ayberk/Projects/B3/roketsimdeneme1` — kaynak üretim fonksiyonları bağımsız derlenir, modüler native sonuçlarla karşılaştırılır; göreli tolerans 2e−13, mutlak taban 1e−14.
Çevre: `python3 scripts/check-legacy-environment.py …` — 302 durum /4530 çıktı; eski Atmosphere.cpp, WindModel.cpp, PinkNoise.cpp bağımsız derlenir.
Aero: `python3 scripts/check-legacy-aero.py …` — 1000 durum / 12000 çıktı.
Motor: `python3 scripts/check-legacy-motor.py …`; atanan motor: `python3 scripts/check-legacy-installed-motor.py …` (300 durum / 1200 çıktı); yapı birleştirme: `python3 scripts/check-legacy-assembly.py …`.
Gövde: `node scripts/check-legacy-parity.mjs …`; iç tüp/kütle: `node scripts/check-legacy-structure.mjs …`.
DAG/FFI/regresyon testleri: `npm run test:engine`; arayüz veri sınırları: `npm test`.
UI katalog özetinde src/domain/motors.ts::motorStats hâlâ var; bu, native motor modeli veya uçuş çözücüsü değildir. Uçuşun fizik hesabı bu UI yardımcı fonksiyonuna bağlanmayacak.
Kaynak programdaki sayısal yaklaşım korunmuştur; bu liste bütün uçuş çözücüsünün doğrulandığı anlamına gelmez.

Toplam: 20 hesap modeli, 114 kayıtlı hesap node’u + 1 dinamik roket modeli (node sayısı parça sayısına göre değişir).

## Ayrı süreç: ray sonrası 3/6DOF uçuş

Kaynak: kullanıcı tarafından sağlanan ENTEGRASYON v0.7 C++ paketi; alınan hesap dosyaları: [flight_native/vendor/flight.hpp](flight_native/vendor/flight.hpp), [flight_native/vendor/geometry.hpp](flight_native/vendor/geometry.hpp), [flight_native/vendor/flight_types.hpp](flight_native/vendor/flight_types.hpp). Bu yol B3 kaynaklı `flight-axial` node’unu değiştirmez.
Girdi projeksiyonu: [src/engine/freeFlightInputs.ts](src/engine/freeFlightInputs.ts); yapı kütle/CG/atalet verisi `rocket` ağından okunur. C++ koşucu: [flight_native/runner.cpp](flight_native/runner.cpp); ayrı süreç köprüsü: [server/freeFlight.ts](server/freeFlight.ts).
Çıktı: zaman, N/E/D konumu, gövde hızı, Mach, Q, CP/CD/CL/Cm ve parça yükleri. Kaynak modeli: raydan çıkmış tek kademe, sabit faz CG, konik/boru/konik geçiş/trapez kanat, Mach ≤ 3 ve geliş açısı ≤ 10°. Ray, paraşüt, yere temas ve ayrılan booster burada hesaplanmaz.
Doğrulama: `npx vitest run server/freeFlight.test.ts src/engine/freeFlightInputs.test.ts`; paket CMake testi ayrıca bağımsız çalıştırıldı. Bu modül zaman adımlı tek iş olarak çalışır, normal DAG içine adım başına node eklenmez.
