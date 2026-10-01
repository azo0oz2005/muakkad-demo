'use strict';

const DEFAULT_SERVICES = ['مذكرة رد', 'تحرير دعوى', 'اعتراض', 'التماس', 'ترافع', 'طلب نقض'];
const DEFAULT_CONFIG = { enabled: true, testMode: true, city: 'خميس مشيط', days: [0,1,2,3,4], start: '09:00', end: '17:00', services: DEFAULT_SERVICES };

function riyadhDay(now = new Date()) { return new Date(now.getTime() + 3 * 3600000).toISOString().slice(0,10); }
function validDay(day, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00+03:00`);
  return Number.isFinite(date.getTime()) && riyadhDay(date) === day && day >= riyadhDay(now) && date.getTime() < now.getTime() + 31 * 86400000;
}
function minutes(time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return NaN;
  return Number(time.slice(0,2)) * 60 + Number(time.slice(3));
}
function overlap(start, end, row) {
  return new Date(row.starts_at).getTime() < end && new Date(row.ends_at).getTime() > start;
}
function slotsFor(office, day, occupied = [], now = new Date()) {
  const config = office.workspace_config;
  if (!config?.enabled || !validDay(day, now)) return [];
  const weekday = new Date(`${day}T12:00:00+03:00`).getUTCDay();
  if (!config.days.includes(weekday)) return [];
  const slots = [];
  for (let minute = minutes(config.start); minute + office.duration_min <= minutes(config.end); minute += office.duration_min) {
    const time = `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
    const start = new Date(`${day}T${time}:00+03:00`).getTime();
    const end = start + office.duration_min * 60000;
    if (start <= now.getTime()) continue;
    slots.push({ time, start: new Date(start).toISOString(), end: new Date(end).toISOString(), available: !occupied.some(row => overlap(start,end,row)) });
  }
  return slots;
}
function normalizeConfig(body, existing) {
  const days = Array.isArray(body.days) ? [...new Set(body.days.map(Number))].filter(x => Number.isInteger(x) && x >= 0 && x <= 6) : [];
  const start = String(body.start || ''); const end = String(body.end || '');
  const services = Array.isArray(body.services) ? [...new Set(body.services.map(x=>String(x).trim().replace(/[<>]/g,'').slice(0,60)).filter(Boolean))].slice(0,12) : [];
  if (!days.length || !Number.isFinite(minutes(start)) || !Number.isFinite(minutes(end)) || minutes(end) <= minutes(start) || !services.length) return null;
  return { ...existing, days, start, end, services, testMode: body.testMode !== false };
}
module.exports = { DEFAULT_CONFIG, DEFAULT_SERVICES, riyadhDay, validDay, slotsFor, normalizeConfig };
