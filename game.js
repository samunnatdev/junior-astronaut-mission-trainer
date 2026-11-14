// Game settings and shop data. Change numbers here to rebalance the game.
const MAX_DAYS = 14;          // survive this many days to win
const BASE_POWER_MAX = 100;   // base battery size
const DAILY_RECHARGE = 25;    // power the base gets back each night
const SHIELD_COST = 30;       // power the emergency shield uses
const CRATER_STEPS = 4;       // steps from base to crater
const DAY_HOURS = 36;         // hours you have on each mission
const REWARD = 100;           // credits for a full mission
const BASE_EVENT_CHANCE = 0.3; // baseline chance of an emergency each step
let EVENT_CHANCE = BASE_EVENT_CHANCE; // adjusted by live DONKI space weather
const FLARE_RAD = 40;         // radiation from an unshielded solar flare
const RAD_REST = 40;          // radiation you recover each night

// Upgrade levels (index = level owned)
const TANK = [60, 80, 100, 120];        // max oxygen
const SUIT = [0, 10, 20, 30];           // radiation blocked per flare
const ROVER_HRS = [3, 2.5, 2, 1.5];     // hours per step
const ROVER_O2 = [5, 4, 4, 3];          // oxygen per step

const SHOP = [
  { key: 'tank',  name: 'Oxygen Tank',    icon: 'O₂', costs: [80, 160, 240], desc: l => `holds ${TANK[l]} oxygen` },
  { key: 'suit',  name: 'Radiation Suit', icon: '🧥', costs: [80, 160, 240], desc: l => `blocks ${SUIT[l]} flare radiation` },
  { key: 'rover', name: 'Faster Rover',   icon: '🚙', costs: [100, 180, 260], desc: l => `${ROVER_HRS[l]}h and ${ROVER_O2[l]} oxygen per step` }
];

// Use CCMC's public DONKI endpoints for all three feeds. This avoids the
// shared, low-quota NASA DEMO_KEY and keeps requests on the current API host.
const DONKI_BASE = 'https://ccmc.gsfc.nasa.gov/DONKI-API';
const SPACE_WEATHER = (() => {
  const state = { status:'Connecting…', threat:'unknown', flare:null, cme:null, notification:null, updated:null, source:'CCMC DONKI public API', errors:[] };
  const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0,10);
  const get = async path => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const r = await fetch(`${DONKI_BASE}${path}`, { headers:{Accept:'application/json'}, cache:'no-store', signal:controller.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error('Unexpected response format');
      return data;
    } finally { clearTimeout(timer); }
  };
  const classRank = c => ({A:1,B:2,C:3,M:4,X:5}[String(c || '').charAt(0).toUpperCase()] || 0);
  const latest = (items, field) => (Array.isArray(items) ? items : []).slice().sort((a,b) => String(b[field] || '').localeCompare(String(a[field] || '')))[0] || null;
  const cmeSpeed = item => {
    const analyses = item && Array.isArray(item.cmeAnalyses) ? item.cmeAnalyses : [];
    const analysis = analyses.find(x => x.isMostAccurate) || analyses[0];
    return Number(analysis && analysis.speed) || 0;
  };
  const refresh = async () => {
    const end = day(0), start = day(30);
    const results = await Promise.allSettled([
      get(`/get/FLR?startDate=${start}&endDate=${end}`),
      get(`/get/CME?startDate=${start}&endDate=${end}`),
      get(`/get/notifications?startDate=${day(7)}&endDate=${end}&type=ALL`)
    ]);
    const names = ['solar flare','CME','notification'];
    state.errors = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        state.errors.push(names[i]);
        console.warn(`CCMC DONKI ${names[i]} feed failed:`, result.reason);
      }
    });
    if (results[0].status === 'fulfilled') state.flare = latest(results[0].value, 'beginTime');
    if (results[1].status === 'fulfilled') state.cme = latest(results[1].value, 'startTime');
    if (results[2].status === 'fulfilled') state.notification = latest(results[2].value, 'messageIssueTime');
    const goodFeeds = results.filter(x => x.status === 'fulfilled').length;
    const flareRank = classRank(state.flare && state.flare.classType);
    const speed = cmeSpeed(state.cme);
    state.threat = flareRank >= 5 || speed >= 1000 ? 'high' : flareRank >= 4 || speed >= 700 ? 'elevated' : goodFeeds ? 'quiet' : 'unknown';
    const activity = state.threat === 'high' ? 'High activity' : state.threat === 'elevated' ? 'Elevated activity' : 'Quiet conditions';
    state.status = goodFeeds === 0 ? 'Feed unavailable' : goodFeeds < 3 ? `Partial live data · ${activity}` : activity;
    state.updated = goodFeeds ? new Date() : state.updated;
    EVENT_CHANCE = Math.min(.72, BASE_EVENT_CHANCE + (state.threat === 'high' ? .22 : state.threat === 'elevated' ? .1 : 0));
    render();
    if (goodFeeds === 0) setTimeout(refresh, 60000);
    return state;
  };
  const render = () => {
    const flare = state.flare, cme = state.cme, note = state.notification;
    const flareText = flare ? (flare.classType || 'Unknown class') : 'No recorded flare';
    const speed = cmeSpeed(cme);
    const cmeText = cme ? (speed ? `${Math.round(speed)} km/s` : 'CME recorded') : 'No recent CME';
    const stamp = state.updated ? `Fetched ${state.updated.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : 'Waiting for feed…';
    const when = item => item ? (item.beginTime || item.startTime || item.messageIssueTime || '') : '';
    let detail;
    if (state.errors.length === 3) detail = 'Live feed unavailable. Check your internet connection; retrying automatically.';
    else if (state.errors.length) detail = `Some live feeds did not respond (${state.errors.join(', ')}). Available feeds are still shown.`;
    else if (note) detail = `Latest alert: ${note.messageType} · ${note.messageID} · ${note.messageIssueTime}`;
    else detail = 'No recent DONKI notification in the last 7 days.';
    const panel = document.getElementById('weatherPanel');
    if (panel) {
      panel.className = `live-panel threat-${state.threat}`;
      document.getElementById('weatherState').textContent = state.status;
      document.getElementById('weatherFlare').textContent = flareText;
      document.getElementById('weatherCme').textContent = cmeText;
      document.getElementById('weatherDetail').textContent = detail;
      document.getElementById('weatherUpdated').textContent = `${stamp} · CCMC DONKI${when(flare) || when(cme) ? ` · Latest event ${when(flare) || when(cme)}` : ''}`;
    }
    const strip = document.getElementById('missionWeather');
    if (strip) { strip.className = `live-strip threat-${state.threat}`; strip.textContent = `☀️ ${state.status} · Flare ${flareText} · CME ${cmeText} · ${stamp}`; }
  };
  return { state, refresh, render };
})();

(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const HIT = 'HIT';

  // ---------- Self-contained mission audio ----------
  const AUDIO = (() => {
    let ctx = null, enabled = true;
    try { enabled = JSON.parse(localStorage.getItem('jamtAudio') ?? 'true'); } catch (e) {}
    const ensure = () => {
      if (!enabled) return null;
      if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    const tone = (freq, duration=.08, type='sine', volume=.035, delay=0, endFreq=freq) => {
      const c = ensure(); if (!c) return;
      const now = c.currentTime + delay, osc = c.createOscillator(), gain = c.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, now); osc.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq), now + duration);
      gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + .012); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain).connect(c.destination); osc.start(now); osc.stop(now + duration + .02);
    };
    const api = {
      get enabled(){ return enabled; },
      setEnabled(v){ enabled=!!v; try{localStorage.setItem('jamtAudio', JSON.stringify(enabled));}catch(e){} },
      click(){ tone(520,.045,'square',.018,0,390); },
      select(){ tone(330,.07,'triangle',.024,0,440); },
      launch(){ tone(150,.32,'sawtooth',.045,0,55); tone(440,.18,'sine',.035,.12,880); },
      step(){ tone(220,.12,'triangle',.022,0,285); tone(560,.08,'sine',.018,.08,700); },
      flare(){ tone(740,.14,'sawtooth',.055,0,180); tone(120,.32,'square',.04,.12,65); },
      meteor(){ tone(180,.38,'sawtooth',.05,0,60); tone(95,.25,'triangle',.035,.18,45); },
      shield(){ tone(260,.18,'sine',.032,0,620); tone(620,.2,'sine',.026,.12,900); },
      success(){ [523,659,784,1047].forEach((f,i)=>tone(f,.16,'sine',.035,i*.1,f*1.02)); },
      faint(){ tone(300,.25,'triangle',.04,0,120); tone(110,.45,'sine',.03,.18,55); },
      fail(){ tone(220,.24,'sawtooth',.04,0,110); tone(130,.4,'sawtooth',.035,.18,55); },
      day(){ tone(390,.12,'sine',.025,0,520); }
    };
    return api;
  })();

  // ---------- Spoken countdown and astronaut radio chatter ----------
  const VOICE = (() => {
    let enabled = true;
    try { enabled = JSON.parse(localStorage.getItem('jamtVoice') ?? 'true'); } catch (e) {}
    const available = () => enabled && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    const say = (text, opts={}) => {
      if (!available()) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = opts.rate ?? 1.02; u.pitch = opts.pitch ?? 0.82; u.volume = .86;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => /^en(-US)?/i.test(v.lang)); if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
    };
    const radio = text => { say(`Astronaut radio. ${text}`, {rate:1.08, pitch:.72}); AUDIO.select(); };
    const countdown = done => {
      const overlay = $('countdownOverlay'), number = $('countdownNumber'), caption = $('countdownCaption');
      if (!overlay || !enabled) return done();
      overlay.classList.add('show'); overlay.setAttribute('aria-hidden','false');
      let n = 3;
      const tick = () => {
        if (n <= 0) {
          overlay.classList.remove('show'); overlay.setAttribute('aria-hidden','true');
          say('Go.', {rate:.9, pitch:.7}); return done();
        }
        number.textContent = n; number.style.animation='none'; void number.offsetWidth; number.style.animation='countdownPop .8s ease both';
        caption.textContent = n === 1 ? 'Emergency channel opening…' : 'Stand by for mission control…';
        AUDIO.step(); say(String(n), {rate:.78, pitch:.62});
        n -= 1; setTimeout(tick, 820);
      };
      tick();
    };
    return { get enabled(){return enabled;}, setEnabled(v){enabled=!!v; try{localStorage.setItem('jamtVoice',JSON.stringify(enabled));}catch(e){}}, say, radio, countdown };
  })();


  // ---------- Saved progress (credits + upgrades) ----------
  const store = { credits: 0, up: { tank: 0, suit: 0, rover: 0 } };
  try { Object.assign(store, JSON.parse(localStorage.getItem('jamt') || '{}')); } catch (e) {}
  // Normalize older, partial, or malformed saved progress so it cannot break mission controls.
  store.credits = Number.isFinite(Number(store.credits)) ? Math.max(0, Number(store.credits)) : 0;
  store.up = { tank: 0, suit: 0, rover: 0, ...(store.up && typeof store.up === 'object' ? store.up : {}) };
  for (const key of ['tank', 'suit', 'rover']) {
    const max = SHOP.find(item => item.key === key).costs.length;
    const level = Number(store.up[key]);
    store.up[key] = Number.isFinite(level) ? Math.max(0, Math.min(max, Math.floor(level))) : 0;
  }
  const persist = () => { try { localStorage.setItem('jamt', JSON.stringify(store)); } catch (e) {} };

  // ---------- Current run ----------
  let G = null, onResult = null;
  const show = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  const coop = () => G.crew === 'coop';
  const stepHrs = () => ROVER_HRS[store.up.rover];
  const stepO2 = () => ROVER_O2[store.up.rover] * (coop() ? 0.75 : 1);
  const reward = () => Math.round(REWARD * (coop() ? 0.75 : 1));
  const note = t => { $('msg').textContent = t; };
  const gain = n => { store.credits += n; G.earned += n; persist(); };

  // ---------- Stat bars: Power, Oxygen, Radiation ----------
  function bar(label, icon, val, max, cls, unit) {
    const pct = Math.max(0, Math.min(100, val / max * 100));
    return `<div class="stat"><span>${icon} ${label}</span><div class="bar"><i class="${cls}" style="width:${pct}%"></i></div><b>${Math.round(Math.max(0, val))}${unit || ''}</b></div>`;
  }
  function stats(el) {
    let h = bar('Base Power', '⚡', G.power, BASE_POWER_MAX, 'pw');
    if (G.m) h += bar('Oxygen', 'O₂', G.m.oxygen, TANK[store.up.tank], 'ox');
    h += bar('Radiation', '☢️', G.rad, 100, 'rd');
    if (G.m) h += `<div class="chips"><span>⏱ ${Math.max(0, G.m.hours)} hours left</span><span>${G.m.ice ? '🧊 Carrying water ice' : 'No ice yet'}</span></div>`;
    el.innerHTML = h;
  }

  // ---------- Hub & Shop ----------
  function toHub() { G = null; $('hubCredits').textContent = store.credits; SPACE_WEATHER.render(); show('hub'); }
  function renderShop() {
    $('shopCredits').textContent = store.credits;
    $('shopList').innerHTML = SHOP.map(it => {
      const lvl = store.up[it.key], max = it.costs.length, maxed = lvl >= max;
      const next = maxed ? '' : ` → ${it.desc(lvl + 1)}`;
      return `<div class="item"><div class="ic">${it.icon}</div>
        <div class="info"><b>${it.name}</b> (level ${lvl}/${max})<br><small>${it.desc(lvl)}${next}</small></div>
        <button data-k="${it.key}" ${maxed || store.credits < it.costs[lvl] ? 'disabled' : ''}>${maxed ? 'MAX' : '<span class="credit-mark small" aria-hidden="true">C</span> ' + it.costs[lvl]}</button></div>`;
    }).join('');
  }
  $('shopList').onclick = e => {
    const k = e.target.dataset && e.target.dataset.k;
    if (!k) return;
    const it = SHOP.find(i => i.key === k), cost = it.costs[store.up[k]];
    if (store.credits >= cost) { store.credits -= cost; store.up[k]++; persist(); renderShop(); }
  };
  $('shopBtn').onclick = () => { AUDIO.select(); renderShop(); show('shop'); };
  $('shopBack').onclick = () => { AUDIO.click(); toHub(); };
  $('audioBtn').onclick = (e) => {
    e.stopPropagation(); AUDIO.setEnabled(!AUDIO.enabled); VOICE.setEnabled(AUDIO.enabled);
    const b = $('audioBtn'); b.textContent = AUDIO.enabled ? '🔊 Sound + voice on' : '🔇 Sound + voice off';
    b.classList.toggle('muted', !AUDIO.enabled); b.setAttribute('aria-pressed', String(AUDIO.enabled));
    if (AUDIO.enabled) { AUDIO.select(); VOICE.say('Sound and astronaut radio online.', {rate:.95, pitch:.78}); }
  };
  document.addEventListener('click', e => {
    if (e.target.closest('button') && e.target.id !== 'audioBtn') AUDIO.click();
  });
  $('playBtn').onclick = () => { AUDIO.launch(); G = { day: 1, power: BASE_POWER_MAX, rad: 0, crew: 'solo', earned: 0, m: null }; showBase(); };

  // ---------- Phase 1: Base Camp ----------
  function showBase() {
    G.m = null;
    $('dayNum').textContent = G.day;
    stats($('baseStats'));
    const max = Math.min(TANK[store.up.tank], G.power * 2), sl = $('o2Slider');
    sl.min = 0; sl.max = max; sl.step = 2; sl.value = Math.min(max, 50);
    updateBase();
    show('base');
  }
  function updateBase() {
    $('solo').classList.toggle('on', !coop());
    $('coop').classList.toggle('on', coop());
    const astronaut = $('astronaut');
    astronaut.classList.toggle('crew-coop', coop());
    astronaut.setAttribute('aria-label', coop() ? 'Two astronauts exploring together' : 'One astronaut exploring');
    const o2 = +$('o2Slider').value;
    $('o2Label').textContent = `O₂ ${o2} oxygen · costs ⚡ ${Math.ceil(o2 / 2)} power`;
    $('need').textContent = `A trip to the crater and back needs about ${Math.ceil(2 * CRATER_STEPS * stepO2())} oxygen, plus extra for emergencies.`;
  }
  $('solo').onclick = () => { G.crew = 'solo'; updateBase(); };
  $('coop').onclick = () => { G.crew = 'coop'; updateBase(); };
  $('o2Slider').oninput = updateBase;
  $('restBtn').onclick = () => { AUDIO.day(); endDay(); };
  $('launchBtn').addEventListener('click', (event) => {
    event.preventDefault();
    // Build the mission state before drawing it, then move screens immediately.
    // Keep navigation independent from optional audio/browser features.
    const slider = $('o2Slider');
    const requestedOxygen = Number(slider.value);
    const o2 = Number.isFinite(requestedOxygen) ? Math.max(0, requestedOxygen) : 0;
    G.power -= Math.ceil(o2 / 2);
    G.m = { pos: 0, dir: 1, oxygen: o2, hours: DAY_HOURS, ice: false, banked: 0 };
    note('Walk to the crater and find water ice!');
    drawMission();
    show('mission');
  });

  // ---------- Phase 2: The Mission ----------
  function drawMission() {
    const m = G.m;
    $('mDay').textContent = G.day;
    stats($('mStats'));
    let t = '';
    const crewMarker = coop() ? '👩‍🚀👩‍🚀' : '👩‍🚀';
    for (let i = 0; i <= CRATER_STEPS; i++) {
      t += `<div class="cell ${i === m.pos ? 'here' : ''}">${i === m.pos ? crewMarker : i === 0 ? '🏠' : i === CRATER_STEPS ? '🕳️' : '·'}</div>`;
    }
    $('track').innerHTML = t;
    const progress = (m.pos / CRATER_STEPS) * 72;
    $('missionScene').style.setProperty('--mission-progress', `${progress}%`);
    $('missionScene').classList.remove('alert');
    $('stepBtn').textContent = m.dir === 1 ? '👣 Walk to the crater' : '👣 Walk back to base';
    $('stepBtn').disabled = false;
  }
  $('stepBtn').onclick = () => {
    const m = G.m;
    AUDIO.step();
    $('missionScene').classList.add('walking');
    setTimeout(() => $('missionScene').classList.remove('walking'), 650);
    m.pos += m.dir; m.hours -= stepHrs(); m.oxygen -= stepO2(); G.rad += 2; // space rays add a little radiation
    if (G.rad >= 100) return die('Your radiation got too high.');
    if (m.pos === 0 && m.dir === -1) return arriveHome();
    if (m.oxygen <= 0) return faint('You ran out of oxygen!');
    if (m.hours <= 0) return faint('The Sun set and time ran out!');
    if (m.pos === CRATER_STEPS && m.dir === 1) {
      m.dir = -1; m.ice = true; m.banked = Math.floor(reward() / 2); gain(m.banked);
      note(`🎉 You reached the crater and found water ice! +${m.banked} credits (50%). Get home safely for the rest!`);
    } else if (Math.random() < EVENT_CHANCE) {
      return startEvent();
    } else {
      note('You walk across the grey moon dust...');
    }
    drawMission();
  };

  // ---------- Random emergencies (every choice costs something) ----------
  function startEvent() {
    drawMission();
    $('missionScene').classList.add('alert');
    AUDIO[Math.random() < 0.5 ? 'flare' : 'meteor']();
    $('stepBtn').disabled = true;
    const cut = SUIT[store.up.suit], dmg = FLARE_RAD - cut;
    const ev = Math.random() < 0.5 ? {
      title: '☀️ Solar flare!',
      text: 'Radiation spike detected! ' + (SPACE_WEATHER.state.flare ? `DONKI reports ${SPACE_WEATHER.state.flare.classType} flare activity.` : NASA.flareLine()),
      opts: [
        { t: '🛡 Turn on the emergency shield', s: `Safe, but drains ${SHIELD_COST} Base Power`, off: G.power < SHIELD_COST,
          f() { G.power -= SHIELD_COST; return `The shield kept you safe. Base Power dropped by ${SHIELD_COST}.`; } },
        { t: '🔧 Keep working', s: `You take ${dmg} radiation damage`,
          f() { G.rad += dmg; return `You kept working and took ${dmg} radiation.`; } }
      ]
    } : {
      title: '☄️ Meteor shower!',
      text: 'Meteors are falling!',
      opts: [
        { t: '<span class="rock-mark" aria-hidden="true"></span>Hide behind a rock', s: 'Safe, but you lose 12 hours and 10 oxygen',
          f() { G.m.hours -= 12; G.m.oxygen -= 10; return 'You hid until it passed. That cost 12 hours and 10 oxygen.'; } },
        { t: '🏃 Run for it', s: 'Fast, but 50% chance you get hit',
          f() { return Math.random() < 0.5 ? HIT : 'You dodged every meteor. Phew!'; } }
      ]
    };
    VOICE.countdown(() => {
      VOICE.radio(ev.title.includes('Solar') ? 'Radiation spike detected. I need a decision.' : 'Meteor shower inbound. I need a route now.');
      $('evTitle').textContent = ev.title;
      $('evText').textContent = ev.text;
      const box = $('evBtns');
      box.innerHTML = '';
      ev.opts.forEach(o => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.disabled = !!o.off;
      b.innerHTML = `${o.t}<small>${o.s}</small>`;
        b.onclick = () => { $('evBox').classList.add('hidden'); if (o.t.includes('shield')) { AUDIO.shield(); VOICE.radio('Emergency shield engaged. Base power is dropping.'); } else { AUDIO.select(); VOICE.radio('Copy that. Continuing the mission.'); } resolve(o.f()); };
        box.appendChild(b);
      });
      $('evBox').classList.remove('hidden');
    });
  }
  function resolve(r) {
    if (G.rad >= 100) return die('Your radiation got too high.');
    if (r === HIT) return faint('A meteor hit you!');
    if (G.m.oxygen <= 0) return faint('You ran out of oxygen!');
    if (G.m.hours <= 0) return faint('The Sun set and time ran out!');
    note(r);
    drawMission();
  }

  // ---------- Endings ----------
  function result(title, text, btn, fn) {
    $('evBox').classList.add('hidden');
    $('resTitle').textContent = title;
    $('resText').textContent = text;
    $('resBtn').textContent = btn;
    onResult = fn;
    show('result');
  }
  $('resBtn').onclick = () => onResult && onResult();

  function faint(why) {
    AUDIO.faint(); VOICE.radio('I am losing consciousness. Mission control, do you copy?');
    const kept = G.m.banked;
    result('😵 You fainted!', `${why} You lost everything you collected and woke up at Base Camp.` +
      (kept ? ` You keep the ${kept} credits from the crater.` : ''), 'Continue', endDay);
  }
  function arriveHome() {
    AUDIO.success(); VOICE.radio('Base camp in sight. Water ice secured.');
    const rest = reward() - G.m.banked;
    gain(rest);
    result('🏠 Back at Base Camp!', `You got home safely with water ice! +${rest} credits (100% total: ${reward()}).`, 'Continue', endDay);
  }
  function die(why) {
    AUDIO.fail(); VOICE.radio('Mission control, I cannot continue. Abort the sortie.');
    result('💔 Mission failed', `${why} Your astronaut could not continue. Buy a better Radiation Suit and try again!`, 'Back to hub', toHub);
  }
  function endDay() {
    G.rad = Math.max(0, G.rad - RAD_REST);
    G.power = Math.min(BASE_POWER_MAX, G.power + DAILY_RECHARGE);
    G.day++;
    G.m = null;
    if (G.day > MAX_DAYS) {
      return result('🏅 Junior Astronaut Badge!', `You survived all ${MAX_DAYS} days! Final score: ${G.earned} credits earned.`, 'Back to hub', toHub);
    }
    showBase();
  }

  const audioButton = $('audioBtn');
  audioButton.textContent = AUDIO.enabled ? '🔊 Sound + voice on' : '🔇 Sound + voice off';
  audioButton.classList.toggle('muted', !AUDIO.enabled);
  audioButton.setAttribute('aria-pressed', String(AUDIO.enabled));
  SPACE_WEATHER.render();
  SPACE_WEATHER.refresh();
  setInterval(() => SPACE_WEATHER.refresh(), 10 * 60 * 1000);
  toHub();
})();
