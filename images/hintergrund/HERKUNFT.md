# Hintergrundbilder

Vier Motive, die als weich ausgeblendete Ebene hinter den Clan-Abschnitten
liegen (siehe `css/hintergrund.css`).

## Woher sie stammen

Es sind die offiziellen Wallpaper-Downloads von minecraft.net, jeweils die
1920×1080-Fassung des Key Arts eines Drops:

| Datei | Quelle |
|---|---|
| `hoehle.webp` | The Copper Age (Fall Drop) |
| `ritt.webp` | Mounts of Mayhem (Holiday Drop 2025) |
| `weite.webp` | Chaos Cubed (Summer Drop) |
| `bluete.webp` | Tiny Takeover (Spring Drop 2026) |

Die Bilder gehören Mojang/Microsoft. DarkNova ist eine nicht-kommerzielle
Fanseite ohne Werbung und ohne Verkauf; im Fuß jeder Seite steht der
Hinweis, dass es sich um kein offizielles Angebot von Mojang, Microsoft,
Discord oder OPSUCHT handelt.

## Wie sie bearbeitet wurden

Nicht bloß verkleinert: die Motive sind entsättigt, in den jeweiligen
Akzentton gezogen und abgedunkelt worden. Dadurch passen sie zur dunklen
Seite, ohne dass der Browser bei jedem Bild Filter rechnen muss — und die
Deckkraft in der CSS bleibt das einzige, woran man später noch dreht.

```py
from PIL import Image, ImageEnhance, ImageOps

DUNKEL = (6, 6, 11)  # der Seitengrund

# (Zielname, Akzentfarbe, Anteil Originalfarbe, Helligkeit)
AUFTRAEGE = [
    ('hoehle', (169, 126, 240), 0.30, 0.62),
    ('ritt',   (140, 150, 255), 0.26, 0.52),
    ('weite',  ( 91, 225, 255), 0.22, 0.48),
    ('bluete', (232,  92, 214), 0.24, 0.50),
]

im = Image.open(quelle).convert('RGB').resize((1600, 900), Image.LANCZOS)
duo = ImageOps.colorize(ImageOps.grayscale(im), DUNKEL, akzent)
fertig = ImageEnhance.Brightness(Image.blend(duo, im, farbanteil)).enhance(helligkeit)
fertig.save(ziel, 'WEBP', quality=82, method=6)
```

1600×900 als WebP ergibt rund 60–75 KB je Datei. Grösser lohnt nicht: die
Bilder liegen ohnehin bei 17–26 % Deckkraft hinter einer weichen Maske.
