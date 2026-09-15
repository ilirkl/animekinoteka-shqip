# Animekinoteka — Titra shqip për Anikoto

Shtojcë për Chrome që shton titra shqip drejt te lojtari i **anikototv.to**. Titrat
ngarkohen vetvetiu sipas serisë dhe episodit që po shikon — nuk ke nevojë të shkarkosh
asgjë manualisht.

---

## Instalimi

### 1. Shkarko skedarët

[**Shkarko animekinoteka-extension-0.1.0.zip**](https://github.com/ilirkl/animekinoteka-shqip/raw/main/extension/animekinoteka-extension-0.1.0.zip)

Ose kliko butonin e gjelbër **Code → Download ZIP** për të gjithë depon.

### 2. Shpaketo

Kliko me të djathtën mbi skedarin e shkarkuar → **Extract All…** (Nxirr të gjitha).
Duhet të të dalë një dosje që përmban `manifest.json`, `background.js` dhe të tjera.

> Mos e ngarko skedarin `.zip` drejtpërdrejt — Chrome kërkon dosjen e shpaketuar.

### 3. Ngarko në Chrome

1. Hap `chrome://extensions`
2. Ndiz **Developer mode** (Mënyra e zhvilluesit) — sipër djathtas
3. Kliko **Load unpacked** (Ngarko të pashpaketuar)
4. Zgjidh dosjen që sapo shpaketove

### 4. Konfiguro

1. Te `chrome://extensions` kliko **Details** → **Extension options**
2. Plotëso:

   | Fusha | Vlera |
   | --- | --- |
   | GitHub user or org | `ilirkl` |
   | Repository | `animekinoteka-shqip` |
   | Branch | `main` |

3. Kliko **Save and test** — duhet të shfaqet *"Found 10 subtitle entries"*
4. Kliko **Allow subtitles on any player host** dhe prano kërkesën e Chrome

**Pse duhet ajo leje:** videoja luhet nga një lojtar i jashtëm, jo nga vetë Anikoto, dhe
adresa e tij ndryshon herë pas here. Pa këtë leje shtojca nuk arrin dot te lojtari dhe
titrat nuk shfaqen. Leja jepet vetëm një herë dhe mund ta heqësh kur të duash.

---

## Si përdoret

1. Hap një episod në anikototv.to
2. Shtyp **Play** — titrat shqip ngarkohen vetvetiu

   > Titrat nuk ngarkohen para se të shtypësh Play. Anikoto e krijon lojtarin vetëm në
   > atë moment, ndaj deri atëherë paneli shkruan *"press play"*.

3. Nëse nuk zgjidhen vetë, zgjidh **Albanian** te menuja e titrave e lojtarit

### Shenjat që do të shohësh

| Shenja | Kuptimi |
| --- | --- |
| ✓ SHQIP mbi poster | Seria ka titra shqip |
| ✓ SHQIP pranë episodit | Ai episod ka titra |
| `−0.5` / `+0.5` | Zhvendos titrat më herët ose më vonë |
| `⛶` | Ekran i plotë **me** titra |

Rregullimi i kohës ruhet veçmas për çdo episod, vetëm në kompjuterin tënd.

> Përdor butonin `⛶` të shtojcës për ekran të plotë. Butoni i vetë lojtarit i fsheh
> titrat tona, sepse hap vetëm kornizën e videos.

---

## Episodet me titra shqip

| Buchigire Reijou wa Houfuku wo Chikaimashita | 11 |
| Crowned in a Hundred Days | 25 |
| Grand Blue | 11 |
| Liar Game | 24 |
| Love Unseen Beneath the Clear Night Sky | 11 |
| Oh Boy, Was I Wrong About Her | 11 |
| Skeleton Knight in Another World | 11 |
| The Forsaken Saintess and Her Foodie Roadtrip in Another World | 11 |
| The Insipid Prince's Furtive Grab for The Throne | 11 |
| Young Ladies Don't Play Fighting Games | 11 |

Lista përditësohet sa herë shtohen titra të reja. Shtojca i merr vetvetiu — mjafton ta
rihapësh faqen. Ndryshimet e reja mund të duan deri në 10 minuta; butoni **Save and test**
te opsionet e përditëson menjëherë.

---

## Probleme të zakonshme

| Problemi | Zgjidhja |
| --- | --- |
| Paneli shkruan *"press play"* | Shtyp Play — lojtari nuk ekziston para kësaj |
| *"Set the subtitle repository…"* | Plotëso opsionet (hapi 4 më sipër) |
| *"Allow … in the extension options"* | Jep lejen te seksioni **Player access** |
| *"No Albanian subtitles for this episode"* | Ai episod nuk ka ende titra |
| Titrat s'janë në kohë | Përdor `−0.5` / `+0.5` |

---

## Për zhvilluesit

Shtojca punon në tre kontekste, sepse çdo hap është i mundur vetëm në njërin prej tyre:

- `content/anikoto.js` — faqja e Anikoto-s: gjen serinë dhe episodin, kërkon titrat,
  vizaton mbishkrimin dhe shënon kartat me ✓ SHQIP
- `content/embed.js` — korniza e lojtarit: raporton kohën e luajtjes dhe e kthen titrën
  në një `blob:` brenda origjinës së lojtarit
- `content/inject.js` — korniza e lojtarit, bota e faqes: ia shton titrën shqip listës së
  titrave që kthen lojtari dhe e zgjedh si të parazgjedhur

Përputhja bëhet me `malId` → `anilistId` → `slug`, gjithmonë e lidhur me numrin e
episodit. `malId` mbijeton edhe nëse Anikoto e ndryshon adresën e serisë.

### `index.json`

```json
{
  "id": "liar-game-24",
  "title": "Liar Game",
  "episode": "24",
  "malId": 62331,
  "anilistId": 197754,
  "slugs": ["liar-game-kcq5v"],
  "file": "files/liar-game-24.sq.vtt",
  "offset": 0
}
```

`offset` mbahet si të dhënë, jo i futur në kohët e titrave, që rregullimi te shtojca të
mbetet burimi i vetëm i së vërtetës.

---

Versioni 0.1.0
