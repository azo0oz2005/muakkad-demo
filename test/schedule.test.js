'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DEFAULT_CONFIG,slotsFor,validDay,normalizeConfig}=require('../src/schedule');
const now=new Date('2026-10-01T08:00:00Z');
const office={workspace_config:DEFAULT_CONFIG,duration_min:30};
test('uses Riyadh dates, rejects impossible dates and past slots',()=>{
  assert.equal(validDay('2026-02-30',now),false);
  assert.equal(validDay('2026-09-30',now),false);
  assert.equal(slotsFor(office,'2026-10-01',[],now)[0].time,'11:30');
  assert.equal(slotsFor(office,'2026-10-02',[],now).length,0);
});
test('keeps overlaps unavailable after duration changes, permits adjacent appointments',()=>{
  const busy=[{starts_at:'2026-10-04T06:00:00Z',ends_at:'2026-10-04T07:00:00Z'}];
  const slots=slotsFor(office,'2026-10-04',busy,now);
  assert.equal(slots.find(x=>x.time==='09:00').available,false);
  assert.equal(slots.find(x=>x.time==='09:30').available,false);
  assert.equal(slots.find(x=>x.time==='10:00').available,true);
});
test('validates working hours, work days and services',()=>{
  assert.equal(normalizeConfig({days:[0],start:'17:00',end:'09:00',services:['رد']},DEFAULT_CONFIG),null);
  assert.equal(normalizeConfig({days:[],start:'09:00',end:'17:00',services:['رد']},DEFAULT_CONFIG),null);
  const c=normalizeConfig({days:[0,0,7],start:'09:00',end:'17:00',services:['رد','رد'],testMode:false},DEFAULT_CONFIG);
  assert.deepEqual(c.days,[0]);assert.deepEqual(c.services,['رد']);assert.equal(c.testMode,false);
});
