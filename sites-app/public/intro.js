/*
 * Pre-game comic intro by Rebecca Chiu.
 * Adapted from AI Lab/invoice-guess-game commit bb158b4f5e483938f469c3f667d8f0232a0700d0.
 * This file owns presentation only; room, question, score, and flow logic remain in detective.js.
 */
(() => {
  const introEl = document.querySelector("#stageIntro");
  if (!introEl) return;

  const $ = (selector) => introEl.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const introOn = params.get("intro") === "1" && !params.get("room") && !params.get("preview");
  if (!introOn) return;

  const introTimers = [];
  const introAudio = { nodes: [], gain: null, heartbeat: null, sweep: null };
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let audioContext = null;
  let masterGain = null;
  let running = false;

  introEl.hidden = false;
  document.body.style.overflow = "hidden";

  function after(seconds, callback) {
    introTimers.push(setTimeout(callback, seconds * 1000));
  }

  function audio() {
    if (!AudioContextClass) return null;
    if (!audioContext) {
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
      masterGain.gain.value = .86;
      masterGain.connect(audioContext.destination);
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function tone(frequency, { type = "sine", delay = 0, duration = .15, volume = .15, slide = 0 } = {}) {
    try {
      const context = audio();
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0008, start + duration);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(start);
      oscillator.stop(start + duration + .05);
    } catch { /* Sound is progressive enhancement. */ }
  }

  function noise({ delay = 0, duration = .2, volume = .3, frequency = 1800, quality = 1, type = "bandpass", slide = 0 } = {}) {
    try {
      const context = audio();
      if (!context) return;
      const start = context.currentTime + delay;
      const length = Math.ceil(context.sampleRate * duration);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = type;
      filter.frequency.setValueAtTime(frequency, start);
      filter.Q.value = quality;
      if (slide) filter.frequency.exponentialRampToValueAtTime(Math.max(60, frequency + slide), start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      source.start(start);
    } catch { /* Sound is progressive enhancement. */ }
  }

  function gem() {
    [784, 1046, 1318, 1568].forEach((frequency, index) => tone(frequency, { delay: index * .09, duration: .32, volume: .11 }));
  }

  function stamp() {
    noise({ duration: .12, volume: .5, frequency: 160, type: "lowpass" });
    tone(65, { type: "triangle", duration: .24, volume: .35 });
  }

  function droneStart() {
    try {
      const context = audio();
      if (!context) return;
      const gain = context.createGain();
      gain.gain.setValueAtTime(.001, context.currentTime);
      gain.gain.linearRampToValueAtTime(.055, context.currentTime + 2.5);
      gain.connect(masterGain);
      introAudio.gain = gain;
      [55, 55.6, 110.7].forEach((frequency) => {
        const oscillator = context.createOscillator();
        const lowpass = context.createBiquadFilter();
        oscillator.type = "sawtooth";
        oscillator.frequency.value = frequency;
        lowpass.type = "lowpass";
        lowpass.frequency.value = 260;
        oscillator.connect(lowpass);
        lowpass.connect(gain);
        oscillator.start();
        introAudio.nodes.push(oscillator);
      });
    } catch { /* Sound is progressive enhancement. */ }
  }

  function heartThump() {
    noise({ duration: .09, volume: .26, frequency: 120, type: "lowpass" });
    tone(52, { type: "triangle", duration: .13, volume: .28 });
    setTimeout(() => {
      noise({ duration: .07, volume: .16, frequency: 110, type: "lowpass" });
      tone(48, { type: "triangle", duration: .1, volume: .18 });
    }, 190);
  }

  function scream() {
    noise({ duration: .5, volume: .24, frequency: 2800, quality: 2 });
    tone(1500, { type: "sawtooth", duration: .7, volume: .08, slide: -900 });
  }

  function gasp() { noise({ duration: .3, volume: .13, frequency: 900, slide: 1700 }); }

  function hit() {
    [220, 261.63, 311.13, 369.99].forEach((frequency) => tone(frequency, { type: "sawtooth", duration: .9, volume: .055 }));
    noise({ duration: .5, volume: .28, frequency: 3000 });
  }

  function speedLines(centerX, centerY, count, color) {
    let lines = "";
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radiusOne = 62 + Math.random() * 44;
      const radiusTwo = 215 + Math.random() * 70;
      const width = 1 + Math.random() * 2.4;
      lines += `<line x1="${(centerX + Math.cos(angle) * radiusOne).toFixed(1)}" y1="${(centerY + Math.sin(angle) * radiusOne).toFixed(1)}" x2="${(centerX + Math.cos(angle) * radiusTwo).toFixed(1)}" y2="${(centerY + Math.sin(angle) * radiusTwo).toFixed(1)}" stroke="${color}" stroke-width="${width.toFixed(1)}"/>`;
    }
    return lines;
  }

  const ART = {
    messy: '<ellipse cx="100" cy="128" rx="82" ry="8" fill="#000" opacity=".45"/><g stroke="#f2f3f7" stroke-width="2.5" fill="#0c0f0a" stroke-linejoin="round" transform="rotate(68 138 96)"><rect x="126" y="70" width="26" height="6"/><rect x="126" y="76" width="5" height="24"/><rect x="147" y="76" width="5" height="24"/><rect x="126" y="52" width="5" height="20"/></g><g><g transform="rotate(-14 48 96)"><rect x="36" y="80" width="24" height="32" fill="#efe6cf" stroke="#14170f" stroke-width="1.6"/><line x1="40" y1="88" x2="56" y2="88" stroke="#8b8574" stroke-width="1.4"/><line x1="40" y1="94" x2="56" y2="94" stroke="#8b8574" stroke-width="1.4"/><ellipse cx="50" cy="103" rx="8" ry="4.5" fill="#4a4232" opacity=".9"/></g><g transform="rotate(11 88 108)"><rect x="76" y="92" width="24" height="32" fill="#efe6cf" stroke="#14170f" stroke-width="1.6"/><line x1="80" y1="100" x2="96" y2="100" stroke="#8b8574" stroke-width="1.4"/><ellipse cx="85" cy="112" rx="7" ry="4" fill="#3a3226" opacity=".9"/></g><g transform="rotate(-7 122 116)"><rect x="110" y="100" width="22" height="28" fill="#efe6cf" stroke="#14170f" stroke-width="1.6"/><ellipse cx="121" cy="112" rx="8" ry="5" fill="#4a4232" opacity=".85"/></g><g transform="rotate(20 60 44)"><rect x="48" y="30" width="22" height="28" fill="#efe6cf" stroke="#14170f" stroke-width="1.6"/><line x1="52" y1="38" x2="66" y2="38" stroke="#8b8574" stroke-width="1.4"/><ellipse cx="62" cy="48" rx="6" ry="3.5" fill="#3a3226" opacity=".85"/></g></g>',
    receipt: '<g transform="rotate(-3 100 75)"><rect x="58" y="14" width="84" height="122" fill="#efe6cf" stroke="#14170f" stroke-width="2.5"/><text x="100" y="32" font-family="DM Mono" font-size="10" font-weight="700" text-anchor="middle" fill="#14170f">電子發票證明聯</text><line x1="66" y1="40" x2="134" y2="40" stroke="#8b8574" stroke-width="1.5" stroke-dasharray="3 2"/><text x="66" y="56" font-family="DM Mono" font-size="9" fill="#14170f">日期 08/19</text><text x="66" y="74" font-family="DM Mono" font-size="9" fill="#14170f">品項 咖啡 $95</text><text x="66" y="92" font-family="DM Mono" font-size="9" fill="#14170f">地點</text><ellipse cx="112" cy="89" rx="22" ry="9" fill="#3a3226"/><ellipse cx="98" cy="112" rx="18" ry="8" fill="#4a4232" opacity=".9"/><text x="66" y="130" font-family="DM Mono" font-size="9" fill="#14170f">載具 /A1..B2</text></g><circle cx="118" cy="90" r="19" fill="none" stroke="#d9ff57" stroke-width="3.5"/><line x1="132" y1="105" x2="150" y2="126" stroke="#d9ff57" stroke-width="6" stroke-linecap="round"/><text x="118" y="96" font-family="Noto Serif TC" font-size="16" font-weight="900" text-anchor="middle" fill="#d9ff57">?</text>',
    mapPins: '<rect x="30" y="16" width="140" height="112" rx="4" fill="#0c0f0a" stroke="#f2f3f7" stroke-width="2.5"/><g stroke="#39402f" stroke-width="3"><path d="M30 62 L170 54"/><path d="M84 16 L92 128"/><path d="M30 100 L170 106"/></g><path d="M52 108 Q76 74 104 82 Q132 90 146 40" stroke="#d9ff57" stroke-width="2.2" fill="none" stroke-dasharray="6 5"/><g><circle cx="52" cy="102" r="7" fill="#ff594b" stroke="#fff" stroke-width="1.8"/><path d="M52 109 L52 118" stroke="#ff594b" stroke-width="3"/><circle cx="104" cy="80" r="7" fill="#ff594b" stroke="#fff" stroke-width="1.8"/><path d="M104 87 L104 96" stroke="#ff594b" stroke-width="3"/><circle cx="146" cy="42" r="7" fill="#ff594b" stroke="#fff" stroke-width="1.8"/><path d="M146 49 L146 58" stroke="#ff594b" stroke-width="3"/></g>',
    trio: '<path d="M100 -4 L58 132 L142 132 Z" fill="#d9ff5712"/><g fill="#0c0f0a" stroke="#f2f3f7" stroke-width="2.5"><circle cx="52" cy="72" r="13"/><path d="M34 132 Q34 94 52 90 Q70 94 70 132 Z"/><circle cx="100" cy="66" r="14"/><path d="M81 132 Q81 90 100 86 Q119 90 119 132 Z"/><circle cx="148" cy="72" r="13"/><path d="M130 132 Q130 94 148 90 Q166 94 166 132 Z"/></g><path d="M117 50 q4 7 -1 9 M123 58 q4 7 -1 9" stroke="#91d7ff" stroke-width="2.2" fill="none" stroke-linecap="round"/><text x="100" y="40" font-family="Noto Serif TC" font-size="15" font-weight="900" text-anchor="middle" fill="#ff594b">？</text>',
    board: '<rect x="26" y="14" width="148" height="114" rx="3" fill="#141a10" stroke="#f2f3f7" stroke-width="2.5"/><g><rect x="38" y="26" width="26" height="30" fill="#efe6cf" stroke="#14170f" stroke-width="1.5"/><rect x="88" y="22" width="26" height="30" fill="#efe6cf" stroke="#14170f" stroke-width="1.5"/><rect x="136" y="30" width="26" height="30" fill="#efe6cf" stroke="#14170f" stroke-width="1.5"/><rect x="60" y="82" width="26" height="30" fill="#efe6cf" stroke="#14170f" stroke-width="1.5"/><rect x="116" y="86" width="26" height="30" fill="#efe6cf" stroke="#14170f" stroke-width="1.5"/></g><g fill="#0c0f0a"><circle cx="51" cy="36" r="6"/><circle cx="101" cy="32" r="6"/><circle cx="149" cy="40" r="6"/><circle cx="73" cy="92" r="6"/><circle cx="129" cy="96" r="6"/></g><g stroke="#ff594b" stroke-width="1.6"><line x1="51" y1="41" x2="73" y2="87"/><line x1="101" y1="37" x2="73" y2="87"/><line x1="101" y1="37" x2="129" y2="91"/><line x1="149" y1="45" x2="129" y2="91"/><line x1="73" y1="92" x2="129" y2="96"/></g><g fill="#ff594b"><circle cx="51" cy="41" r="2.4"/><circle cx="101" cy="37" r="2.4"/><circle cx="149" cy="45" r="2.4"/><circle cx="73" cy="87" r="2.4"/><circle cx="129" cy="91" r="2.4"/></g>',
    suspects: '<g fill="#0c0f0a" stroke="#f2f3f7" stroke-width="2.5"><ellipse cx="40" cy="76" rx="18" ry="24"/><ellipse cx="80" cy="69" rx="18" ry="24"/><ellipse cx="120" cy="77" rx="18" ry="24"/><ellipse cx="160" cy="70" rx="18" ry="24"/></g><g fill="#f2f3f7"><rect x="30" y="71" width="7.5" height="3.4"/><rect x="42" y="71" width="7.5" height="3.4"/><rect x="70" y="64" width="7.5" height="3.4"/><rect x="82" y="64" width="7.5" height="3.4"/><rect x="110" y="72" width="7.5" height="3.4"/><rect x="122" y="72" width="7.5" height="3.4"/><rect x="150" y="65" width="7.5" height="3.4"/><rect x="162" y="65" width="7.5" height="3.4"/></g>',
  };

  function panel({ art = "", tilt = 0, background = "", lineColor = "#ffffff20", dense = 42, sound = "", soundPosition = [0, 0], bubble = "", bubbleType = "talk", bubblePosition = [0, 0] }) {
    const stage = $("#comicStage");
    stage.style.display = "block";
    stage.innerHTML = `<div class="cpanel" style="--tilt:${tilt}deg${background ? `;--pbg:${background}` : ""}"><svg class="plines" viewBox="0 0 400 300" aria-hidden="true">${speedLines(200, 150, dense, lineColor)}</svg><svg class="part" viewBox="0 0 200 150" aria-hidden="true">${art}</svg>${sound ? `<div class="sfxWord" style="left:${soundPosition[0]}%;top:${soundPosition[1]}%">${sound}</div>` : ""}${bubble ? `<div class="bubble ${bubbleType}" style="left:${bubblePosition[0]}%;top:${bubblePosition[1]}%">${bubble}</div>` : ""}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => stage.querySelector(".cpanel")?.classList.add("in")));
  }

  function flash() {
    const element = $("#introFlash");
    element.classList.add("on");
    setTimeout(() => element.classList.remove("on"), 500);
  }

  function runIntro() {
    if (running) return;
    running = true;
    $("#stagePlay").style.display = "none";
    try { audio(); } catch { /* Optional audio. */ }
    droneStart();
    heartThump();
    introAudio.heartbeat = setInterval(heartThump, 1150);
    introAudio.sweep = setInterval(() => tone(620, { type: "sawtooth", duration: 1.4, volume: .028, slide: 70 }), 3400);

    after(1.2, () => {
      scream();
      $("#stageCap").textContent = "STEP 01 · 蒐集資訊";
      panel({ art: ART.messy, bubble: "犯罪現場一片狼藉，地上散落著沾滿污漬的發票。", bubbleType: "cap", bubblePosition: [5, 5], sound: "嘩啦⋯", soundPosition: [64, 10], tilt: -1.6 });
      navigator.vibrate?.([60, 50, 60]);
    });
    after(4.8, () => {
      gasp();
      panel({ art: ART.receipt, bubble: "重要資訊被污漬遮住了——先推理出消費品項或地點。", bubbleType: "cap", bubblePosition: [5, 5], tilt: 1.3 });
    });
    after(8.4, () => {
      $("#stageCap").textContent = "STEP 02 · 框出嫌疑人";
      panel({ art: ART.mapPins, bubble: "發票供出了嫌疑人當天的出沒地點與行動軌跡。", bubbleType: "cap", bubblePosition: [5, 5], tilt: -1.1 });
    });
    after(12, () => {
      gasp();
      panel({ art: ART.trio, bubble: "三人一組接受偵訊——其中一人在說謊，他就是嫌疑人。", bubbleType: "cap", bubblePosition: [4, 4], tilt: 1.2 });
    });
    after(15.8, () => {
      $("#stageCap").textContent = "STEP 03 · 找出犯人";
      gem();
      panel({ art: ART.board, bubble: "警探列出了四位嫌疑人的完整消費軌跡。", bubbleType: "cap", bubblePosition: [5, 5], tilt: -1.2 });
    });
    after(18.8, () => {
      hit();
      panel({ art: ART.suspects, bubble: "四位說謊的嫌疑人——誰才是犯人！", bubbleType: "shout", bubblePosition: [8, 5], sound: "！？", soundPosition: [76, 64], tilt: 2, background: "#1c0d0b", lineColor: "#ff594b38", dense: 56 });
      flash();
      navigator.vibrate?.(80);
    });
    after(22.2, () => {
      $("#comicStage").style.display = "none";
      $("#stageLine").style.display = "none";
      $("#stageCap").textContent = "";
      $("#stageTitle").style.display = "flex";
      stamp();
      endIntroAudio();
    });
    after(23.2, endIntro);
  }

  function endIntroAudio() {
    clearInterval(introAudio.heartbeat);
    clearInterval(introAudio.sweep);
    try {
      const context = audio();
      if (context && introAudio.gain) introAudio.gain.gain.linearRampToValueAtTime(.0005, context.currentTime + .8);
      introAudio.nodes.forEach((oscillator) => {
        try { oscillator.stop((context?.currentTime ?? 0) + .9); } catch { /* Already stopped. */ }
      });
    } catch { /* Optional audio. */ }
  }

  function endIntro() {
    introTimers.forEach(clearTimeout);
    introTimers.length = 0;
    endIntroAudio();
    introEl.classList.add("fade");
    setTimeout(() => {
      introEl.hidden = true;
      document.body.style.overflow = "";
      const nextUrl = new URL(location.href);
      nextUrl.searchParams.delete("intro");
      history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      window.dispatchEvent(new CustomEvent("invoice-intro-ended", { detail: { source: "rebecca-gitlab" } }));
      document.querySelector("#detective-app")?.focus({ preventScroll: true });
    }, document.documentElement.dataset.testMode === "true" ? 0 : 750);
  }

  $("#stagePlay").addEventListener("click", runIntro);
  $("#stageSkip").addEventListener("click", endIntro);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") endIntro(); });
  window.addEventListener("pagehide", endIntroAudio, { once: true });
})();
