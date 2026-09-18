# Animekinoteka — Anime me Titra shqip për Anikoto

Shtojcë për Chrome që shton titra shqip drejt te webfaqja e **anikototv.to**. Titrat
ngarkohen vetvetiu sipas serisë dhe episodit që po shikon — nuk ke nevojë të shkarkosh
asgjë manualisht.

---

## Instalimi

### 1. Shkarko skedarin "extension"

[**Shkarko animekinoteka-extension-0.2.2.zip**](https://github.com/ilirkl/animekinoteka-shqip/raw/main/extension/animekinoteka-extension-0.2.2.zip)

### 2. Shpaketo "unzip"

Kliko me të djathtën mbi skedarin e shkarkuar → **Extract All…** (Nxirr të gjitha).
Duhet të të dalë një folder që përmban `manifest.json`, `background.js` dhe të tjera.

> Mos e ngarko skedarin `.zip` drejtpërdrejt — Chrome kërkon dosjen e shpaketuar "unzip".

### 3. Ngarko në Chrome

1. Hap `chrome://extensions`
2. Ndiz **Developer mode** (Mënyra e zhvilluesit) — sipër djathtas
3. Kliko **Load unpacked** (Ngarko të pashpaketuar)
4. Zgjidh folderin që sapo shpaketove

**Kaq.** Shtojca "extension" punon menjëherë pas instalimit.

---

## Si përdoret

1. Hap një episod në anikototv.to
2. Shtyp **Play** — titrat shqip ngarkohen vetvetiu
3. Nëse nuk zgjidhen vetë, zgjidh **Shqip/Albanian** te menuja e titrave e lojtarit

### Shenjat që do të shohësh

| Shenja | Kuptimi |
| --- | --- |
| ✓ SHQIP mbi poster | Seria ka titra shqip |
| ✓ SHQIP pranë episodit | Ai episod ka titra |
| `−0.5` / `+0.5` | Zhvendos titrat më herët ose më vonë |
| `⛶` | Ekran i plotë **me** titra |

Rregullimi i kohës ruhet veçmas për çdo episod, vetëm në kompjuterin tënd.

Titrat e reja shtohen vazhdimisht dhe shtojca i merr vetvetiu — mjafton ta rihapësh
faqen. Ndryshimet mund të duan deri në 10 minuta që të dalin.

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

Versioni 0.2.2
