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
