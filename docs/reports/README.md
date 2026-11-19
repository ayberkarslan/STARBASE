# STARBASE raporu

- Düzenlenecek metin: `YRT-GEN-01_STARBASE_Tanitim_ve_Kullanim_Kilavuzu.md`
- Sunuma hazır çıktı: aynı adlı `.pdf` dosyası (A4, sekiz sayfa).
- Görselleri eklemek için `screenshots/` klasörüne sırasıyla `01-api-akisi.png`, `02-uygulamalar.png`, `03-ana-sayfa.png`, `04-paylasim-yonetim.png` koyun. PDF yeniden üretildiğinde boş görsel alanlarına otomatik yerleşir.
- Hazırlayan, tarih ve rapor kodu değişirse hem Markdown hem `build_starbase_report.py` içindeki kapak bilgilerini güncelleyin. İlk yayımda revizyon numarası yazılmaz.

Yeniden üretim:

```sh
python3 -m venv .venv
.venv/bin/pip install reportlab pypdf
.venv/bin/python build_starbase_report.py /home/ayberk/İndirilenler/starbase.pdf
```

Şablon, kullanıcının antetli PDF'sidir; metin Calibri ile metrik uyumlu açık lisanslı Carlito fontuyla hazırlanır. Font lisansı `assets/OFL.txt` dosyasındadır.
