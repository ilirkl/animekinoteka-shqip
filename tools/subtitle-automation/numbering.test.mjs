import test from 'node:test';
import assert from 'node:assert/strict';
import {knownNumbering} from './numbering.mjs';
const source = {title:'Yoroi Shin Den Samurai Troopers',season:null,episode:'23'};
test('verified split cour maps source 23 to part 2 episode 11',()=>{
  const result=knownNumbering(source);
  assert.equal(result.episode,'11');
  assert.equal(result.sourceEpisode,'23');
  assert.equal(result.malId,63047);
  assert.equal(result.part,2);
});
test('mapping is bounded to the documented second cour',()=>{
  assert.equal(knownNumbering({...source,episode:'13'}).episode,'1');
  assert.equal(knownNumbering({...source,episode:'24'}).episode,'12');
  for(const episode of ['12','25','23.5']) assert.equal(knownNumbering({...source,episode}),null);
});
test('other titles and seasons cannot inherit this offset',()=>{
  assert.equal(knownNumbering({...source,title:'Yoroiden Samurai Troopers'}),null);
  assert.equal(knownNumbering({...source,season:2}),null);
});

const onePiece = {title:'One Piece',season:null,episode:'1178'};
test('One Piece pins the ongoing series without renumbering the episode',()=>{
  const result=knownNumbering(onePiece);
  assert.equal(result.slug,'one-piece-odmau');
  assert.equal(result.malId,21);
  assert.equal(result.episode,'1178');
  assert.equal(result.sourceEpisode,'1178');
  assert.equal(result.part,undefined,'a straight pin must not claim a split cour');
});
test('the One Piece pin cannot swallow specials or other titles',()=>{
  for(const episode of ['1','13','999','1178.5']) assert.equal(knownNumbering({...onePiece,episode}),null);
  assert.equal(knownNumbering({...onePiece,title:'One Piece Heroines'}),null);
  assert.equal(knownNumbering({...onePiece,season:2}),null);
});
// The spin-off's season 2 is a different Anikoto series from both the 2016 mainline
// "Bungo Stray Dogs 2" and from WAN! season 1.
const wan2 = {title:'Bungou Stray Dogs Wan!',season:2,episode:'12'};
test('Bungo Stray Dogs WAN! season 2 pins the spin-off, not the mainline series',()=>{
  const result=knownNumbering(wan2);
  assert.equal(result.slug,'bungo-stray-dogs-wan-2');
  assert.equal(result.malId,62883);
  assert.equal(result.episode,'12');
  assert.equal(knownNumbering({...wan2,title:'Bungo Stray Dogs Wan!'}).malId,62883,'both spellings pin');
});
test('WAN! season 1 must not inherit the season 2 mapping',()=>{
  assert.equal(knownNumbering({...wan2,season:null}),null);
  assert.equal(knownNumbering({...wan2,season:1}),null);
  assert.equal(knownNumbering({...wan2,season:3}),null);
  // The mainline series shares a prefix and must never be captured by it.
  assert.equal(knownNumbering({title:'Bungou Stray Dogs',season:2,episode:'12'}),null);
  assert.equal(knownNumbering({title:'Bungou Stray Dogs Wan! Special',season:2,episode:'1'}),null);
});

// Anikoto files season 3 under a Chinese title that shares no word with the release,
// so the search can never reach it and the season must be pinned.
const linkClick = {title:'Link Click',season:3,episode:'7'};
test('Link Click season 3 pins the Chinese-titled Anikoto entry',()=>{
  const result=knownNumbering(linkClick);
  assert.equal(result.slug,'shiguang-dailiren-iii');
  assert.equal(result.malId,61607);
  assert.equal(result.episode,'7','season 3 numbering is already continuous');
  assert.equal(result.part,undefined,'a straight pin must not claim a split cour');
});
test('the Link Click pin is confined to season 3',()=>{
  for(const season of [null,1,2,4]) assert.equal(knownNumbering({...linkClick,season}),null);
  assert.equal(knownNumbering({...linkClick,title:'Mini Link Click'}),null);
  assert.equal(knownNumbering({...linkClick,title:'Link Click: Bridon Arc'}),null);
});

// Erai-raws spells these seasons inside the title in forms the trailing "S<number>"
// rule cannot see. prepare() strips ":" from filenames, so the pinned spellings have
// no colon - this is the exact text parseFilename() yields for the release.
const mushokuIII = {title:'Mushoku Tensei III Isekai Ittara Honki Dasu',season:null,episode:'13'};
test('Mushoku Tensei III pins season 3',()=>{
  const result=knownNumbering(mushokuIII);
  assert.equal(result.slug,'mushoku-tensei-jobless-reincarnation-season-3');
  assert.equal(result.malId,59193);
  assert.equal(result.episode,'13');
  assert.equal(result.part,3);
});
test('the Mushoku Tensei III pin is confined to the exact roman-numeral title',()=>{
  assert.equal(knownNumbering({...mushokuIII,title:'Mushoku Tensei: Isekai Ittara Honki Dasu'}),null);
  assert.equal(knownNumbering({...mushokuIII,season:2}),null);
  assert.equal(knownNumbering({...mushokuIII,episode:'13.5'}),null);
});

const azurLaneNi = {title:'Azur Lane Bisoku Zenshin - Ni',season:null,episode:'12'};
test('Azur Lane - Ni pins the second season',()=>{
  const result=knownNumbering(azurLaneNi);
  assert.equal(result.slug,'azur-lane-slow-ahead-season-2-ac697');
  assert.equal(result.malId,56613);
  assert.equal(result.episode,'12');
  assert.equal(result.part,2);
});
test('the Azur Lane - Ni pin cannot swallow the first season',()=>{
  assert.equal(knownNumbering({...azurLaneNi,title:'Azur Lane Bisoku Zenshin'}),null);
  assert.equal(knownNumbering({...azurLaneNi,season:2}),null);
});

const dukesSon = {title:'Kimi wo Aisuru Ki wa Nai to Itta Jiki Koushaku-sama ga Nazeka Dekiai Shitekimasu',season:null,episode:'12'};
test("Duke's Son pins the English-titled Anikoto entry",()=>{
  const result=knownNumbering(dukesSon);
  assert.equal(result.slug,'kimi-wo-aisuru-ki-wa-nai-to-itta-jiki-koushaku-sama-ga-nazeka-dekiai-shitekimasu-ac995');
  assert.equal(result.malId,63537);
  assert.equal(result.episode,'12');
});
test("the Duke's Son pin is confined to the exact title",()=>{
  assert.equal(knownNumbering({...dukesSon,title:'Kimiai'}),null);
  assert.equal(knownNumbering({...dukesSon,season:2}),null);
});

const gaikotsuII = {title:'Gaikotsu Kishi-sama Tadaima Isekai e Odekake-chuu II',season:null,episode:'12'};
test('Gaikotsu Kishi-sama II pins the second season',()=>{
  const result=knownNumbering(gaikotsuII);
  assert.equal(result.slug,'skeleton-knight-in-another-world-season-2');
  assert.equal(result.malId,60522);
  assert.equal(result.episode,'12');
  assert.equal(result.part,2);
});
test('the Gaikotsu Kishi-sama pin cannot capture season 1 or spelling variants',()=>{
  assert.equal(knownNumbering({...gaikotsuII,title:'Gaikotsu Kishi-sama, Tadaima Isekai e Odekakechuu'}),null);
  assert.equal(knownNumbering({...gaikotsuII,title:'Gaikotsu Kishi-sama Tadaima Isekai e Odekake-chuu'}),null);
  assert.equal(knownNumbering({...gaikotsuII,season:2}),null);
});

const grandBlueS3 = {title:'Grand Blue Season 3',season:null,episode:'12'};
test('Grand Blue Season 3 pins the third season despite the season-less parse',()=>{
  const result=knownNumbering(grandBlueS3);
  assert.equal(result.slug,'grand-blue-season-3');
  assert.equal(result.malId,62542);
  assert.equal(result.episode,'12');
  assert.equal(result.part,3);
});
test('the Grand Blue season 3 pin cannot capture other spellings',()=>{
  assert.equal(knownNumbering({...grandBlueS3,title:'Grand Blue'}),null);
  assert.equal(knownNumbering({...grandBlueS3,title:'Grand Blue Dreaming'}),null);
  assert.equal(knownNumbering({...grandBlueS3,season:2}),null);
});

test('rules stay independent of one another',()=>{
  assert.equal(knownNumbering({title:'One Piece',season:null,episode:'23'}),null);
  assert.equal(knownNumbering({...source,episode:'1178'}),null);
});
