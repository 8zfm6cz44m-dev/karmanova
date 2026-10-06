# Släktträd – Evgenia Karmanova

Källkritiskt släktträd med ryska led. Statisk sajt (HTML, CSS, JS), ingen databas eller byggsteg.

## Förhandsgranska lokalt

```
python3 -m http.server
```

Öppna `http://localhost:8000`. Datan läses med `fetch`, så dubbelklick på `index.html` fungerar inte.

## Struktur

| Fil | Innehåll |
|---|---|
| `index.html`, `assets/` | Sidans skal, träd, personkort, sök, GEDCOM-export |
| `data/persons.json` | Personer: namn, kyrilliskt namn och translitterering (`altNames`, `search`), status, källor |
| `data/relations.json` | Relationer med egen status och källgrund (`basis`) |
| `data/views.json` | Placering i trädet (kolumn, rad) |
| `data/flags.json` | Öppna frågor, motsägelser, uteslutet, regler |
| `data/notes.json` | Statusregler, forskningslogg, bildregister |
| `data/images.json` | Bildposter |
| `privat/` | Lokalt, ligger i `.gitignore`: fullständiga datum och platser för levande |
| `tools/validate.py` | Kontroll av id:n, källkrav och regler för levande |

## Källkritik

Statusar: `verified` (kräver primärkälla), `family`, `strong`, `candidate`, `lead`, `excluded`. Samma namn + år räcker aldrig för `verified`. Datumkonflikter ger `strong` + flagga i `flags.json`.

- En person med `verified` måste ha en källa med `"primary": true`, och en relation med `verified` fältet `"source"`.
- Alla personer måste ha minst en källa (arkiv, fond/opis/delo, bild/sida, URL; ordagrann transkription i citattecken).
- Levande personer: bara namn, släktband och födelseår. Exporten döljer dem som standard.

## Ryska specialfall

Patronymikon, kvinnliga släktnamn på -а, kyrilliskt namn + translitterering (ISO 9, BGN/PCGN), gammal stil före 1 februari 1918, historiska och nutida ortnamn, religion och etnicitet. Se Noteringar i sajten.

## Underhåll

Ny person: objekt i `persons.json` + placering i `views.json`. Ny relation: `relations.json` (`child`, `partner`, `sibling`). Kör alltid:

```
python3 tools/validate.py
```
