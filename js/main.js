/* LOUD · Campeões do Mundo 2026
   Orquestra o scroll (Lenis + GSAP ScrollTrigger), o preloader e as seções.
   O troféu 3D vive em ./trophy.js e é carregado sob demanda: se ele falhar,
   o resto da página continua funcionando. */

window.__loudBoot = true;

const root = document.documentElement;
const { gsap, ScrollTrigger, Lenis } = window;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// Versão com texturas recomprimidas primeiro; o original fica de reserva.
const MODEL_URLS = ['img/trofeu_3d_otimizado.glb', 'img/trofeu_3d.glb'];

let lenis = null;

if (root.classList.contains('no-js') || !gsap || !ScrollTrigger) {
  root.classList.replace('js', 'no-js');
} else {
  try {
    boot();
  } catch (err) {
    console.error('[LOUD] falha ao iniciar animações', err);
    root.classList.remove('is-loading');
    root.classList.replace('js', 'no-js');
  }
}

function boot() {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  root.classList.add('is-loading');

  lenis = setupLenis();
  lenis?.stop();

  const loader = createLoader();
  const trophy = { timeline: null, enter: 0, api: null, visible: false };

  // O download do modelo começa já, em paralelo com o módulo three.js.
  const modelPromise = loadModel((p) => loader.progress('model', p));
  const trophyModule = import('./trophy.js');

  const heroIntro = setupHero();
  setupManifesto();
  setupElenco();
  setupTrofeu(trophy);
  setupGaleria();
  setupOutro();
  setupRecordes();
  setupReel();
  setupNav();

  Promise.all([document.fonts?.ready, decodeImage($('.hero__media img'))])
    .finally(() => loader.progress('base', 1));

  // Rede lenta: não segura o visitante por mais de ~9s.
  setTimeout(() => loader.finish(), 9000);

  Promise.all([modelPromise, trophyModule])
    .then(([buffer, mod]) => mod.initTrophy({ canvas: $('.trofeu__canvas'), buffer, state: trophy, reduceMotion }))
    .then((api) => {
      trophy.api = api;
      $('.trofeu').classList.add('is-ready');
      api.setActive(trophy.visible);
    })
    .catch((err) => {
      console.warn('[LOUD] troféu 3D indisponível, usando imagem estática.', err);
      $('.trofeu').classList.add('is-fallback');
      loader.finish();
    });

  loader.done.then(() => {
    root.classList.remove('is-loading');
    lenis?.start();
    ScrollTrigger.refresh();
    loader.hide();
    gsap.delayedCall(0.45, () => heroIntro.play());
  });

  window.addEventListener('load', () => ScrollTrigger.refresh());
}

/* ---------------------------------------------------------------- utilidades */

function setupLenis() {
  if (reduceMotion || !Lenis) return null;
  const instance = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
  instance.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => instance.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return instance;
}

function scrollToY(y) {
  if (lenis) lenis.scrollTo(y, { duration: 2.2 });
  else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function decodeImage(img) {
  if (!img) return Promise.resolve();
  return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    onProgress(1);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded / total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

async function loadModel(onProgress) {
  for (const url of MODEL_URLS) {
    try {
      return await fetchWithProgress(url, onProgress);
    } catch (err) {
      console.warn('[LOUD] não foi possível baixar', url, err);
    }
  }
  throw new Error('modelo 3D indisponível');
}

/* ---------------------------------------------------------------- preloader */

function createLoader() {
  const el = $('.loader');
  const pct = $('.loader__pct');
  const bar = $('.loader__bar span');
  const fill = $('.loader__fill');
  const parts = { base: 0, model: 0 };
  let shown = 0;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  const target = () => parts.base * 0.15 + parts.model * 0.85;
  const tick = () => {
    const t = target();
    shown += (t - shown) * 0.14;
    if (t >= 1 && shown > 0.994) shown = 1;
    pct.textContent = String(Math.round(shown * 100)).padStart(3, '0');
    bar.style.transform = `scaleX(${shown})`;
    fill.style.clipPath = `inset(${(1 - shown) * 100}% 0 0 0)`;
    if (shown === 1) {
      gsap.ticker.remove(tick);
      resolveDone();
    }
  };
  gsap.ticker.add(tick);

  return {
    done,
    progress(key, value) { parts[key] = Math.max(parts[key], Math.min(1, value)); },
    finish() { parts.base = 1; parts.model = 1; },
    hide() {
      gsap.to(el, {
        clipPath: 'inset(0% 0% 100% 0%)',
        duration: 1.1,
        ease: 'expo.inOut',
        onComplete: () => el.remove(),
      });
    },
  };
}

/* ---------------------------------------------------------------- hero */

function setupHero() {
  const strike = $('.hero__strike');
  gsap.set(strike, { scaleX: 0 });

  const intro = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
  intro
    .fromTo('.hero__media img', { scale: 1.28, autoAlpha: 0 }, { scale: 1.04, autoAlpha: 1, duration: 2.6 }, 0)
    .from('.nav', { y: -24, autoAlpha: 0, duration: 1.2 }, 0.3)
    .from('.hero__eyebrow', { y: 24, autoAlpha: 0, duration: 1.1 }, 0.25)
    .from('.hero__title .line__in', { yPercent: 115, duration: 1.4, stagger: 0.13 }, 0.35)
    .to(strike, { scaleX: 1, duration: 0.8, ease: 'power3.inOut' }, 1.25)
    .from(['.hero__lead', '.hero__foot'], { y: 24, autoAlpha: 0, duration: 1.1, stagger: 0.12 }, 1.2);

  // Parallax ao sair da primeira dobra.
  const out = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
  gsap.to('.hero__media', { yPercent: 16, ease: 'none', scrollTrigger: out });
  gsap.to('.hero__content', { yPercent: -18, autoAlpha: 0.15, ease: 'none', scrollTrigger: out });

  return intro;
}

/* ---------------------------------------------------------------- 01 · a virada */

function splitWords(el) {
  const words = [];
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(' ');
          } else {
            const span = document.createElement('span');
            span.className = 'w';
            span.textContent = part;
            frag.append(span);
            words.push(span);
          }
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.classList.contains('chip')) {
          child.classList.add('w');
          words.push(child);
        } else {
          walk(child);
        }
      }
    }
  };
  walk(el);
  return words;
}

function setupManifesto() {
  const pin = $('.manifesto__pin');
  const text = $('.manifesto__text');
  const steps = $$('.manifesto__steps li');
  const stepsEl = $('.manifesto__steps');
  const words = splitWords(text);
  const STAGGER = 0.1;
  const WORD = 0.5;

  ScrollTrigger.create({ trigger: pin, start: 'top top', end: '+=170%', pin: true, anticipatePin: 1 });

  // Começa a acender um pouco antes do pin e termina pouco antes de soltar.
  // (Sem invalidateOnRefresh: o refresh reverteria o estado inicial das palavras ainda não animadas.)
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: pin,
      start: 'top 40%',
      end: () => `+=${window.innerHeight * 1.85}`,
      scrub: 0.6,
    },
  });
  tl.fromTo(words, { opacity: 0.13 }, { opacity: 1, duration: WORD, stagger: STAGGER, ease: 'none' }, 0);
  for (const chip of $$('.chip', text)) {
    tl.fromTo(chip, { scale: 0.2 }, { scale: 1, duration: WORD, ease: 'back.out(2.2)' }, words.indexOf(chip) * STAGGER);
  }

  // Cada marco da linha do tempo acende junto com a palavra correspondente.
  const total = tl.duration();
  const marks = [0, ...$$('[data-step]', text).map((el) => words.indexOf($('.w', el)) * STAGGER + WORD * 0.5)]
    .map((t) => t / total);
  const dots = [0, 1 / 3, 2 / 3, 1];
  // onUpdate da timeline (e não do ScrollTrigger) para acompanhar a suavização do scrub.
  tl.eventCallback('onUpdate', update);
  function update() {
    const p = tl.progress();
    steps.forEach((li, i) => li.classList.toggle('is-on', i === 0 || p >= marks[i]));
    let bar = 1;
    for (let i = 0; i < marks.length; i++) {
      const a = marks[i];
      const b = marks[i + 1] ?? 1;
      if (p < b) {
        bar = dots[i] + (dots[i + 1] - dots[i]) * gsap.utils.clamp(0, 1, (p - a) / (b - a));
        break;
      }
    }
    stepsEl.style.setProperty('--bar', bar.toFixed(4));
  }
  update();
}

/* ---------------------------------------------------------------- 02 · o elenco */

function setupElenco() {
  const mm = gsap.matchMedia();

  mm.add('(min-width: 900px)', () => {
    const track = $('.elenco__track');
    const distance = () => track.scrollWidth - root.clientWidth;

    const scroll = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: '.elenco__pin',
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });

    gsap.from('.elenco__intro > *', {
      y: 60,
      autoAlpha: 0,
      duration: 1.1,
      stagger: 0.1,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.elenco', start: 'top 65%' },
    });

    for (const player of $$('.player')) {
      const along = { trigger: player, containerAnimation: scroll, scrub: true };
      gsap.fromTo($('.player__photo', player),
        { clipPath: 'inset(100% 0% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.out', scrollTrigger: { ...along, start: 'left 92%', end: 'left 30%' } });
      // Camadas "ao fundo" andam mais devagar que o painel (deslocam-se para a direita relativo a ele).
      gsap.fromTo($('.player__photo img', player),
        { xPercent: -7, scale: 1.28 },
        { xPercent: 7, scale: 1.16, ease: 'none', scrollTrigger: { ...along, start: 'left right', end: 'right left' } });
      gsap.fromTo($('.player__ghost', player),
        { xPercent: -14 },
        { xPercent: 14, ease: 'none', scrollTrigger: { ...along, start: 'left right', end: 'right left' } });
      gsap.from($('.player__num', player),
        { yPercent: 70, autoAlpha: 0, ease: 'power2.out', scrollTrigger: { ...along, start: 'left 70%', end: 'left 30%' } });
      gsap.from($$('.player__info > *', player),
        { x: 90, autoAlpha: 0, stagger: 0.06, ease: 'power2.out', scrollTrigger: { ...along, start: 'left 78%', end: 'left 18%' } });
    }
  });

  mm.add('(max-width: 899px)', () => {
    for (const player of $$('.player')) {
      gsap.from($('.player__photo', player), {
        clipPath: 'inset(100% 0% 0% 0%)',
        duration: 1.3,
        ease: 'expo.out',
        scrollTrigger: { trigger: player, start: 'top 82%' },
      });
      gsap.from($$('.player__info > *', player), {
        y: 34,
        autoAlpha: 0,
        duration: 0.9,
        stagger: 0.06,
        ease: 'power3.out',
        scrollTrigger: { trigger: $('.player__info', player), start: 'top 88%' },
      });
    }
  });
}

/* ---------------------------------------------------------------- 03 · a taça */

function setupTrofeu(trophy) {
  const section = $('#trofeu');
  const dot = $('.trofeu__rail-dot');
  const arrows = (sel) => $$(`${sel} .era__arrow path`);

  for (const path of $$('.era__arrow path')) {
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
  }

  // Linha do tempo com 10 unidades: 0–4 era 2026 · 4.2–6.2 "rebobina" · 6–10 era 2022.
  // Os mesmos marcos são usados por trophy.js para girar a taça.
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '.trofeu__pin',
      start: 'top top',
      end: '+=360%',
      pin: true,
      scrub: 1,
      anticipatePin: 1,
    },
  });

  tl.from('.era--2026 .era__kicker', { y: 24, autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, 0.15)
    .from('.era--2026 .era__title .line__in', { yPercent: 115, duration: 0.7, stagger: 0.15, ease: 'power3.out' }, 0.25)
    .from('.era--2026 .era__photo', { clipPath: 'inset(0% 100% 0% 0%)', duration: 0.8, ease: 'power2.inOut' }, 0.6)
    .from('.era--2026 .era__roster li', { y: 16, autoAlpha: 0, duration: 0.4, stagger: 0.1 }, 1.0)
    .to(arrows('.era--2026'), { strokeDashoffset: 0, duration: 0.6, stagger: 0.5 }, 1.3)
    .to('.era--2026', { y: -60, autoAlpha: 0, duration: 0.7, ease: 'power2.in' }, 4.0)
    .to('.trofeu__roll-strip', { yPercent: -80, duration: 1.9, ease: 'power2.inOut' }, 4.25)
    .from('.era--2022 .era__kicker', { y: 24, autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, 6.1)
    .from('.era--2022 .era__title .line__in', { yPercent: 115, duration: 0.7, ease: 'power3.out' }, 6.2)
    .from('.era--2022 .era__photo', { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.8, ease: 'power2.inOut' }, 6.5)
    .from('.era--2022 .era__roster li', { y: 16, autoAlpha: 0, duration: 0.4, stagger: 0.1 }, 6.9)
    .to(arrows('.era--2022'), { strokeDashoffset: 0, duration: 0.6, stagger: 0.5 }, 7.2)
    .to({}, { duration: 2.1 }, 7.9);

  tl.eventCallback('onUpdate', () => {
    const p = gsap.utils.clamp(0, 1, (tl.progress() - 0.42) / 0.2);
    dot.style.left = `${(p * 100).toFixed(2)}%`;
  });
  trophy.timeline = tl;

  // Aproximação da seção (antes do pin): a taça sobe girando.
  ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'top top',
    onUpdate: (self) => { trophy.enter = self.progress; },
    onLeave: () => { trophy.enter = 1; },
    onLeaveBack: () => { trophy.enter = 0; },
  });

  // Só renderiza WebGL quando a seção está na tela.
  ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => {
      trophy.visible = self.isActive;
      trophy.api?.setActive(self.isActive);
    },
  });
}

/* ---------------------------------------------------------------- 04 · a galeria */

function setupGaleria() {
  const stage = $('.galeria__stage');
  const floor = $('.galeria__floor');
  // O chão é um padrão periódico: basta deslocá-lo dentro de uma célula da grade (via transform)
  // para dar a ilusão de avanço infinito, sem repintar a camada a cada frame.
  const FLOOR_CELL = 180; // igual ao background-size do chão no CSS
  const FLOOR_BASE = 'translateY(32vh) translateZ(400px) rotateX(-90deg)';
  const items = $$('.g-item').map((el) => ({ el, side: Number(el.dataset.side), depth: Number(el.dataset.depth) }));
  const camera = { t: 0 }; // 0 → 1 ao longo do corredor; a distância real vem de cfg.end
  let cfg;

  const configure = () => {
    const narrow = window.innerWidth < 900;
    const perspective = narrow ? 800 : 1000;
    stage.style.perspective = `${perspective}px`;
    cfg = {
      perspective,
      gap: narrow ? 1100 : 1400,
      spread: narrow ? 0.24 : 0.27,
      turn: narrow ? 14 : 22,
    };
    cfg.end = cfg.gap * 3;
  };

  const layout = () => {
    const vw = window.innerWidth;
    const { gap, perspective, spread, turn } = cfg;
    const travelled = camera.t * cfg.end;
    // Os quadros só surgem depois que o título de entrada começa a sair.
    const intro = gsap.utils.clamp(0, 1, (travelled - 150) / 450);
    for (const it of items) {
      const z = travelled - it.depth * gap;
      const fadeIn = gsap.utils.clamp(0, 1, gsap.utils.mapRange(-gap * 2.6, -gap * 1.9, 0, 1, z));
      const fadeOut = it.side === 0 ? 1 : gsap.utils.clamp(0, 1, gsap.utils.mapRange(perspective * 0.22, perspective * 0.58, 1, 0, z));
      const opacity = intro * fadeIn * fadeOut;
      it.el.style.opacity = opacity.toFixed(3);
      it.el.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
      it.el.style.transform = `translate3d(calc(-50% + ${it.side * spread * vw}px), -50%, ${z.toFixed(1)}px) rotateY(${-it.side * turn}deg)`;
    }
    floor.style.transform = `${FLOOR_BASE} translateY(${(-(travelled % FLOOR_CELL)).toFixed(1)}px)`;
  };

  configure();
  layout();
  // Recalcula antes do refresh para que o valor final da câmera use o tamanho novo.
  ScrollTrigger.addEventListener('refreshInit', configure);

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: stage,
      start: 'top top',
      end: '+=360%',
      pin: true,
      scrub: 1,
      anticipatePin: 1,
      onRefresh: () => { configure(); layout(); },
    },
  });

  // 0–7.6 voo pelo corredor · 7.1–9 revelação do erde (MVP 2026) · o pANcada entra por último, como detalhe.
  tl.to(camera, { t: 1, duration: 7.6, ease: 'power1.inOut', onUpdate: layout }, 0)
    .to('.galeria__hud', { y: -70, scale: 1.06, autoAlpha: 0, duration: 1.4, ease: 'power1.in' }, 0.5)
    .to('.finale__cover', { yPercent: -102, duration: 0.9, ease: 'power2.inOut' }, 7.1)
    .fromTo('.finale__frame img', { scale: 1.3 }, { scale: 1, duration: 1.3, ease: 'power2.out' }, 7.1)
    .fromTo('.finale__rays', { autoAlpha: 0, scale: 0.5 }, { autoAlpha: 1, scale: 1, duration: 1.2, ease: 'power2.out' }, 7.3)
    .fromTo('.finale__shine', { xPercent: -130 }, { xPercent: 130, duration: 0.8, ease: 'power1.inOut' }, 7.6)
    .fromTo('.g-finale', { '--reveal': 0 }, { '--reveal': 1, duration: 1, ease: 'power3.inOut' }, 7.6)
    .from(['.finale__kicker', '.finale__name', '.finale__claim-a'], { y: 30, autoAlpha: 0, duration: 0.6, stagger: 0.12, ease: 'power3.out' }, 7.9)
    .fromTo('.finale__seal', { autoAlpha: 0, scale: 0.3, rotation: -120 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.7, ease: 'back.out(1.7)' }, 8.1)
    .from('.finale__claim-b .flag', { x: -12, autoAlpha: 0, duration: 0.3, ease: 'power2.out' }, 8.35)
    .fromTo('.finale__stamp', { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.5, ease: 'power2.inOut' }, 8.4)
    .from('.finale__note', { y: 20, autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, 8.75)
    .from('.finale__extra', { y: 24, autoAlpha: 0, duration: 0.6, ease: 'power2.out' }, 9.05)
    // Raios e anel do selo giram com o scroll (e não em loop infinito): parado, a GPU descansa.
    .fromTo('.finale__rays > span', { rotation: 0 }, { rotation: 45, duration: 2.9 }, 7.1)
    .fromTo('.finale__seal-ring', { rotation: -90 }, { rotation: 90, duration: 1.9 }, 8.1);

  // Com a galeria na tela, o grão de filme fica parado: a animação dele obriga a GPU
  // a recompor a cena 3D inteira a cada frame, mesmo com a página parada.
  ScrollTrigger.create({
    trigger: '#galeria',
    start: 'top bottom',
    end: 'bottom top',
    toggleClass: { targets: root, className: 'is-galeria' },
  });

  // Confete quando o "Lutou pelo Brasil" aparece (segue a suavização do scrub).
  let celebrated = false;
  tl.eventCallback('onUpdate', () => {
    if (!celebrated && tl.progress() > 0.84) {
      celebrated = true;
      confetti();
    }
  });
}

function confetti() {
  if (reduceMotion) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#00f52e', '#d8bf82', '#f3f0e8', '#a8843e', '#00f52e'];
  const pieces = Array.from({ length: 170 }, (_, i) => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.6,
    y: h * 0.42 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 15,
    vy: -Math.random() * 15 - 5,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 7,
    h: 3 + Math.random() * 4,
    color: colors[i % colors.length],
  }));

  const start = performance.now();
  let last = start;
  const frame = (now) => {
    const t = now - start;
    const k = Math.min((now - last) / 16.67, 3);
    last = now;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - t / 2900);
    for (const p of pieces) {
      p.vy += 0.34 * k;
      p.vx *= 0.99;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.rot += p.vr * k;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
      ctx.restore();
    }
    if (t < 3000) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- epílogo */

function setupOutro() {
  gsap.from('.outro__title .line__in', {
    yPercent: 115,
    duration: 1.3,
    stagger: 0.12,
    ease: 'expo.out',
    scrollTrigger: { trigger: '.outro', start: 'top 70%' },
  });
  gsap.from(['.outro__lead', '.outro__final'], {
    y: 40,
    autoAlpha: 0,
    duration: 1,
    stagger: 0.15,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.outro__lead', start: 'top 88%' },
  });
  gsap.fromTo('.outro__bg img', { yPercent: -8 }, {
    yPercent: 8,
    ease: 'none',
    scrollTrigger: { trigger: '.outro', start: 'top bottom', end: 'bottom top', scrub: true },
  });
}

/* ---------------------------------------------------------------- pós-jogo · recordes */

function setupRecordes() {
  gsap.from('.rec-intro__title .line__in', {
    yPercent: 115,
    duration: 1.2,
    stagger: 0.1,
    ease: 'expo.out',
    scrollTrigger: { trigger: '.rec-intro', start: 'top 75%' },
  });

  // 1 · os campeões mais jovens: contagem "5 de 5" e linhas entrando em sequência
  const young = { trigger: '.young__list', start: 'top 80%' };
  gsap.from('.young__num[data-count]', {
    textContent: 0,
    snap: { textContent: 1 },
    duration: 1.4,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.young', start: 'top 72%' },
  });
  // entrada na vertical: um deslocamento lateral alargaria a página no celular antes de animar
  gsap.from('.young__row', { y: 26, autoAlpha: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out', scrollTrigger: young });
  gsap.from('.young__twins', { scale: 0, autoAlpha: 0, duration: 0.5, delay: 0.7, ease: 'back.out(2)', scrollTrigger: young });

  // 2 · recordes individuais
  gsap.from('.feats__title', { y: 40, autoAlpha: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.feats', start: 'top 78%' } });
  gsap.from('.feat', { y: 60, autoAlpha: 0, duration: 1, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: '.feats__grid', start: 'top 82%' } });

  setupAces();
}

// Gráfico de barras guiado pelo scroll: estreia → atualização → aces por mapa.
// Tudo é desenhado com transform/opacity (composição na GPU, sem repintar a cada frame).
function setupAces() {
  // Jogadores com mais aces na história do Champions (Overtime/@OvertimeVCT).
  // debut = [aces, partidas] no dia da estreia do tkzin (29/09/2026) · update = [aces, mapas] na atualização.
  const ACES = [
    { name: 'ZmjjKK', flag: 'cn', debut: [5, 18], update: [5, 51] },
    { name: 'something', flag: 'ru', debut: [4, 16], update: [5, 50] },
    { name: 'tkzin', flag: 'br', debut: [3, 1], update: [4, 16], hero: true },
    { name: 'Jamppi', flag: 'fi', debut: [3, 12], update: [4, 44] },
    { name: 'keznit', flag: 'cl', debut: [3, 13] },
    { name: 'zekken', flag: 'us', debut: [3, 14] },
    { name: 'Derke', flag: 'fi', debut: [3, 22], update: [4, 71] },
  ];
  const num = (n, digits) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const mapsPerAce = (p) => {
    const r = p.update[1] / p.update[0];
    return num(r, Number.isInteger(r) ? 0 : 1);
  };

  const rowsEl = $('.aces__rows');
  const tip = $('.aces__tip');
  const steps = $$('.aces__step');
  const metricEl = $('.aces__metric');
  const subEl = $('.aces__sub');
  const HEADS = [
    ['Aces na história do Champions', 'no dia da estreia do tkzin · 29/09/2026'],
    ['Aces na história do Champions', 'na atualização'],
    ['Aces por mapa', 'aces ÷ mapas jogados'],
  ];

  const withUpdate = ACES.filter((p) => p.update);
  const rate = (p) => p.update[0] / p.update[1];
  const makeState = (list, value, label, sub) => {
    const max = Math.max(...list.map(value));
    return new Map(list.map((p, i) => [p.name, { rank: i, norm: value(p) / max, label: label(p), sub: sub(p) }]));
  };
  const STATES = [
    makeState(ACES, (p) => p.debut[0], (p) => String(p.debut[0]), (p) => plural(p.debut[1], 'partida', 'partidas')),
    makeState(
      [...withUpdate].sort((a, b) => b.update[0] - a.update[0] || a.update[1] - b.update[1]),
      (p) => p.update[0], (p) => String(p.update[0]), (p) => plural(p.update[1], 'mapa', 'mapas'),
    ),
    makeState(
      [...withUpdate].sort((a, b) => rate(b) - rate(a)),
      rate, (p) => num(rate(p), 2), (p) => `1 a cada ${mapsPerAce(p)} mapas`,
    ),
  ];

  const rows = ACES.map((p) => {
    const el = document.createElement('div');
    el.className = p.hero ? 'ace-row is-hero' : 'ace-row';
    el.innerHTML = '<span class="ace-row__rank"></span>'
      + `<span class="ace-row__who"><span class="ace-row__name"><svg class="flag" aria-hidden="true"><use href="#flag-${p.flag}"/></svg></span><span class="ace-row__sub"></span></span>`
      + '<span class="ace-row__track"><i class="ace-row__bar"></i><span class="ace-row__val"></span></span>';
    $('.ace-row__name', el).append(p.name);
    rowsEl.append(el);
    return {
      p, el, y: 0, cache: {},
      rank: $('.ace-row__rank', el), sub: $('.ace-row__sub', el),
      bar: $('.ace-row__bar', el), val: $('.ace-row__val', el), track: $('.ace-row__track', el),
    };
  });

  const head = { cache: {} };
  const setText = (owner, key, el, value) => {
    if (owner.cache[key] === value) return;
    owner.cache[key] = value;
    el.textContent = value;
  };
  const smooth = (x) => x * x * (3 - 2 * x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = gsap.utils.clamp(0, 1);
  let rowH = 50;
  let barW = 0;
  let t = 0;
  let shown = 0; // etapa cujos números estão na tela (troca junto com os rótulos)
  let hovered = null;

  function render() {
    const seg = Math.min(1, Math.floor(t));
    const f = clamp01(t - seg);
    // Duas fases: primeiro as barras mudam de tamanho, depois o ranking reordena.
    const fv = smooth(clamp01(f / 0.6));
    const fy = smooth(clamp01((f - 0.4) / 0.6));
    const A = STATES[seg];
    const B = STATES[seg + 1];
    for (const r of rows) {
      const a = A.get(r.p.name);
      const b = B.get(r.p.name);
      if (!a && !b) {
        // fora do ranking nas duas etapas (keznit e zekken depois da atualização)
        if (!r.cache.out) {
          r.cache.out = true;
          r.el.style.opacity = '0';
          r.el.style.visibility = 'hidden';
        }
        continue;
      }
      r.cache.out = false;
      // quem sai do ranking some junto com a barra e desce para fora do gráfico
      r.y = lerp(a ? a.rank : 7.4, b ? b.rank : 7.4, fy) * rowH;
      const opacity = lerp(a ? 1 : 0, b ? 1 : 0, fv);
      const v = lerp(a ? a.norm : 0, b ? b.norm : 0, fv);
      r.el.style.transform = `translate3d(0, ${r.y.toFixed(1)}px, 0)`;
      r.el.style.opacity = opacity.toFixed(3);
      r.el.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
      r.bar.style.transform = `scaleX(${Math.max(v, 0.0001).toFixed(4)})`;
      r.val.style.transform = `translate3d(${(v * barW).toFixed(1)}px, -50%, 0)`;
      // o número acompanha a barra; a posição no ranking acompanha o movimento da linha
      const byValue = fv < 0.5 ? a || b : b || a;
      const byRank = fy < 0.5 ? a || b : b || a;
      setText(r, 'rank', r.rank, String(byRank.rank + 1));
      setText(r, 'val', r.val, byValue.label);
      setText(r, 'sub', r.sub, byValue.sub);
    }
    const now = seg + (fv >= 0.5 ? 1 : 0);
    if (now !== shown) {
      shown = now;
      if (hovered) fillTip(hovered.p);
    }
    const [metric, sub] = HEADS[shown];
    setText(head, 'metric', metricEl, metric);
    setText(head, 'sub', subEl, sub);
    steps.forEach((step, i) => {
      const d = t - i;
      const o = gsap.utils.clamp(0, 1, 1 - Math.abs(d) * 2.2);
      step.style.opacity = o.toFixed(3);
      step.style.visibility = o < 0.01 ? 'hidden' : 'visible';
      step.style.transform = `translate3d(0, ${(-d * 28).toFixed(1)}px, 0)`;
    });
    if (hovered) placeTip(hovered);
  }

  function measure() {
    const css = getComputedStyle(rowsEl);
    rowH = parseFloat(css.getPropertyValue('--ar-h')) || 50;
    barW = rows[0].track.clientWidth - (parseFloat(css.getPropertyValue('--lab')) || 0);
    render();
  }

  // Tooltip: o valor da etapa visível vem primeiro; as outras etapas completam a leitura.
  const line = (text) => {
    const s = document.createElement('span');
    s.textContent = text;
    return s;
  };
  function fillTip(p) {
    const debut = `${p.debut[0]} aces em ${plural(p.debut[1], 'partida', 'partidas')}`;
    const update = p.update && `${p.update[0]} aces em ${p.update[1]} mapas`;
    let lead;
    let extra;
    if (shown === 0) {
      lead = debut;
      extra = [update ? `Atualização: ${update}` : 'Fora do top 5 na atualização'];
    } else if (shown === 1) {
      lead = update;
      extra = [`Em 29/09/2026: ${debut}`];
    } else {
      lead = `${num(p.update[0] / p.update[1], 2)} ace por mapa`;
      extra = [`1 ace a cada ${mapsPerAce(p)} mapas`, update];
    }
    const value = document.createElement('strong');
    value.textContent = lead;
    tip.replaceChildren(value, line(p.name), ...extra.map(line));
  }
  function placeTip(r) {
    const above = rowsEl.offsetTop + r.y - tip.offsetHeight - 6;
    const y = above >= 0 ? above : rowsEl.offsetTop + r.y + rowH + 6;
    tip.style.transform = `translate3d(150px, ${y.toFixed(1)}px, 0)`;
  }
  for (const r of rows) {
    r.el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      hovered = r;
      fillTip(r.p);
      placeTip(r);
      tip.classList.add('is-on');
    });
    r.el.addEventListener('pointerleave', () => {
      hovered = null;
      tip.classList.remove('is-on');
    });
  }

  const proxy = { t: 0 };
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '.aces__pin',
      start: 'top top',
      end: '+=240%',
      pin: true,
      scrub: 0.8,
      anticipatePin: 1,
    },
  });
  // pausa · estreia → atualização · pausa · → aces por mapa · pausa
  tl.to(proxy, { t: 1, duration: 1 }, 0.5)
    .to(proxy, { t: 2, duration: 1 }, 2)
    .to({}, { duration: 0.6 }, 3);
  tl.eventCallback('onUpdate', () => {
    t = proxy.t;
    render();
  });

  ScrollTrigger.addEventListener('refresh', measure);
  measure();
}

/* ---------------------------------------------------------------- final · o momento (vídeo) */

function setupReel() {
  const section = $('#momento');
  const pin = $('.reel__pin');
  const media = $('.reel__media');
  const video = $('.reel__video');
  const slot = $('.reel__slot');
  const mark = $('.reel__mark');
  const letterL = $('.reel__l');
  const lettersR = $$('.reel__u, .reel__d');
  const soundBtn = $('.reel__sound');
  const soundLabel = $('.reel__btn-label', soundBtn);
  const toggleBtn = $('.reel__toggle');
  const pulse = $('.reel__pulse');
  const progress = $('.reel__progress span');
  // Autoplay só quando o visitante não pediu menos movimento nem economia de dados.
  const autoplay = !reduceMotion && navigator.connection?.saveData !== true;

  video.removeAttribute('controls');
  slot.disabled = false;
  slot.removeAttribute('aria-hidden');
  slot.removeAttribute('tabindex');

  /* ---- geometria: o triângulo do "O" (T0) cresce até cobrir a tela (T1) ---- */
  const MARK = [[5.5, 7.5], [90.5, 50], [5.5, 92.5]]; // mesmos pontos do <polygon> do símbolo
  const FOCUS = [0.5, 0.34]; // centro da taça no início do vídeo (fração do quadro)
  const CUP = 0.17; // altura da taça, em fração da altura do quadro
  let T0 = null;
  let T1 = null;
  let cam = null;
  const grow = { g: 0 };

  function measure() {
    const p = pin.getBoundingClientRect();
    const r = mark.getBoundingClientRect();
    T0 = MARK.flatMap(([x, y]) => [r.left - p.left + (x / 100) * r.width, r.top - p.top + (y / 100) * r.height]);
    // triângulo semelhante (largura = altura) que contém a tela inteira
    const m = p.width * 0.04;
    const half = ((p.width + m + p.height) / 2) * 1.04;
    T1 = [-m, p.height / 2 - half, -m + 2 * half, p.height / 2, -m, p.height / 2 + half];

    // "Câmera": no início, a taça (FOCUS) fica no centro do triângulo, do tamanho do círculo
    // inscrito; conforme a janela abre, a câmera recua até o enquadramento normal.
    const W = p.width;
    const H = p.height;
    const vw = video.videoWidth || 854;
    const vh = video.videoHeight || 480;
    const s = Math.max(W / vw, H / vh); // object-fit: cover
    const fx = (W - vw * s) / 2 + FOCUS[0] * vw * s;
    const fy = (H - vh * s) / 2 + FOCUS[1] * vh * s;
    const [ax, ay, bx, by, qx, qy] = T0;
    const la = Math.hypot(bx - qx, by - qy);
    const lb = Math.hypot(qx - ax, qy - ay);
    const lc = Math.hypot(ax - bx, ay - by);
    const per = la + lb + lc;
    const ix = (la * ax + lb * bx + lc * qx) / per; // incentro: o "meio" visual do triângulo
    const iy = (la * ay + lb * by + lc * qy) / per;
    const inradius = Math.abs((bx - ax) * (qy - ay) - (qx - ax) * (by - ay)) / per;
    const zoom = gsap.utils.clamp(0.5, 1.4, (1.6 * inradius) / (CUP * vh * s));
    const dx = ix - fx;
    const dy = iy - fy;

    // e(g): quanto a câmera já recuou quando a janela está em g. É o mínimo para o vídeo
    // sempre cobrir a parte visível do triângulo (sem bordas pretas), somado a um recuo suave.
    const box = (e) => {
      const z = zoom + (1 - zoom) * e;
      const cx = fx + dx * (1 - e);
      const cy = fy + dy * (1 - e);
      return [cx - z * fx, cy - z * fy, cx + z * (W - fx), cy + z * (H - fy)];
    };
    const curve = new Float32Array(101);
    let need = 0;
    for (let i = 0; i <= 100; i++) {
      const v = T0.map((a, k) => a + (T1[k] - a) * (i / 100));
      const l = Math.max(0, Math.min(v[0], v[2], v[4]));
      const t = Math.max(0, Math.min(v[1], v[3], v[5]));
      const r = Math.min(W, Math.max(v[0], v[2], v[4]));
      const b = Math.min(H, Math.max(v[1], v[3], v[5]));
      for (;;) {
        const [bl, bt, br, bb] = box(need); // margem de 3px cobre a interpolação entre as amostras
        if (need >= 1 || (bl <= l - 3 && bt <= t - 3 && br >= r + 3 && bb >= b + 3)) break;
        need = Math.min(1, need + 0.01);
      }
      const k = Math.min(1, i / 60);
      curve[i] = Math.max(need, k * k * (3 - 2 * k));
    }
    cam = { dx, dy, zoom, curve };
    video.style.transformOrigin = `${fx.toFixed(1)}px ${fy.toFixed(1)}px`;
    applyGrow();
  }

  function applyGrow() {
    if (!T0) return;
    const g = grow.g;
    const v = T0.map((a, i) => a + (T1[i] - a) * g);
    const k = g * 100;
    const i = Math.min(99, Math.floor(k));
    const e = g >= 1 ? 1 : cam.curve[i] + (cam.curve[i + 1] - cam.curve[i]) * (k - i);
    video.style.transform = e >= 0.985 ? ''
      : `translate3d(${(cam.dx * (1 - e)).toFixed(1)}px, ${(cam.dy * (1 - e)).toFixed(1)}px, 0) scale(${(cam.zoom + (1 - cam.zoom) * e).toFixed(4)})`;
    // as letras empurradas somem enquanto saem da tela
    const fade = (1 - gsap.utils.clamp(0, 1, (g - 0.3) / 0.3)).toFixed(3);
    letterL.style.opacity = fade;
    for (const el of lettersR) el.style.opacity = fade;
    // a janela cobre a tela: sem clip-path, o vídeo volta a ser uma camada simples
    media.style.clipPath = g >= 1 ? 'none'
      : `polygon(${v[0].toFixed(1)}px ${v[1].toFixed(1)}px, ${v[2].toFixed(1)}px ${v[3].toFixed(1)}px, ${v[4].toFixed(1)}px ${v[5].toFixed(1)}px)`;
    // o triângulo empurra as letras: L acompanha a borda esquerda, U e D acompanham a ponta
    letterL.style.transform = `translate3d(${(v[0] - T0[0]).toFixed(1)}px, 0, 0)`;
    const dx = `translate3d(${(v[2] - T0[2]).toFixed(1)}px, 0, 0)`;
    for (const el of lettersR) el.style.transform = dx;
    slot.style.visibility = g > 0.08 ? 'hidden' : '';
    if (g > 0.01) start();
    if (g >= 1 && !revealed) reveal();
    else if (g < 0.97 && revealed) unreveal();
  }

  /* ---- reprodução: só toca com a seção na tela ---- */
  let started = false;
  let userPaused = false;
  let inView = false;
  let loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    video.preload = 'auto';
    video.load();
  }
  function start() {
    if (started || !autoplay) return;
    started = true;
    sync();
  }
  function sync() {
    load();
    if (started && inView && !userPaused) video.play().catch(() => {});
    else video.pause();
  }

  const isPaused = () => video.paused || video.ended;
  function updateUI() {
    section.classList.toggle('is-paused', isPaused());
    section.classList.toggle('is-sound', !video.muted);
    toggleBtn.setAttribute('aria-label', isPaused() ? 'Reproduzir o vídeo' : 'Pausar o vídeo');
    soundBtn.setAttribute('aria-pressed', String(!video.muted));
    soundLabel.textContent = video.muted ? 'Aumenta o som' : 'Som ligado';
    // escuta o áudio só com som ligado, tocando e na tela
    const run = !isPaused() && inView && !video.muted && !!audio;
    if (run && !listening) startListening();
    else if (!run && listening) stopListening();
    listening = run;
    updateProgress();
  }
  ['play', 'playing', 'pause', 'ended', 'volumechange'].forEach((type) => video.addEventListener(type, updateUI));

  // Desempenho: nada sobre o vídeo se mexe continuamente. Qualquer animação contínua por cima
  // (barra, equalizador, brilho) obrigava o navegador a montar a página 60x por segundo em vez
  // de só repassar os quadros do vídeo (medido: +7 a +17 pontos de CPU cada, e até ~10% de GPU).

  // Barra de progresso: acompanha o vídeo em passos (timeupdate, ~4x por segundo).
  function updateProgress() {
    const d = video.duration;
    if (d && Number.isFinite(d)) progress.style.transform = `scaleX(${(video.currentTime / d).toFixed(4)})`;
  }
  ['timeupdate', 'seeked', 'loadedmetadata'].forEach((type) => video.addEventListener(type, updateProgress));

  /* ---- som: o brilho verde explode nos picos da torcida (áudio real, via Web Audio) ---- */
  // No iOS, rotear o vídeo pelo Web Audio pode silenciá-lo; lá o som toca normalmente, sem o brilho.
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let audio = null;

  function initAudio() {
    if (audio !== null) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (isIOS || !Ctx || reduceMotion) {
      audio = false;
      return;
    }
    try {
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; // janela de ~43 ms
      ctx.createMediaElementSource(video).connect(analyser);
      analyser.connect(ctx.destination);
      ctx.resume();
      audio = { ctx, analyser, data: new Float32Array(analyser.fftSize), fast: null, slow: 0, last: 0 };
    } catch (err) {
      audio = false;
    }
  }

  // Lê o volume 8x por segundo (só JS, sem tocar no DOM): um nível rápido (~0,3 s) comparado
  // à média lenta (~4 s). Quando a torcida explode 2,5 dB acima da média, dispara um clarão
  // curto (no máx. 1 a cada 3 s; ~4 por volta do vídeo, incluindo a taça subindo).
  // Entre os picos nada anima: o custo fica igual ao do vídeo sem som.
  let listenTimer = 0;
  let listening = false;
  function listen() {
    const { analyser, data } = audio;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const db = 10 * Math.log10(sum / data.length + 1e-10); // volume RMS, em dBFS
    if (audio.fast === null) {
      audio.fast = audio.slow = db;
      return;
    }
    audio.fast += (db - audio.fast) * 0.35;
    audio.slow += (db - audio.slow) * 0.03;
    const now = performance.now();
    const over = audio.fast - audio.slow;
    if (over > 2.5 && now - audio.last > 3000) {
      audio.last = now;
      pulse.animate(
        [{ opacity: 0 }, { opacity: Math.min(0.9, 0.55 + (over - 2.5) * 0.1), offset: 0.2 }, { opacity: 0 }],
        { duration: 1100, easing: 'ease-out' },
      );
    }
  }
  function startListening() {
    listenTimer = setInterval(listen, 125);
  }
  function stopListening() {
    clearInterval(listenTimer);
  }

  function soundOn(restart) {
    initAudio();
    if (audio) audio.ctx.resume();
    video.muted = false;
    started = true;
    userPaused = false;
    if (restart) video.currentTime = 0;
    sync();
  }

  let heardFromStart = false;
  soundBtn.addEventListener('click', () => {
    if (video.muted) {
      // na primeira vez, recomeça para ouvir a taça subir desde o início
      soundOn(!heardFromStart);
      heardFromStart = true;
    } else {
      video.muted = true;
    }
  });
  toggleBtn.addEventListener('click', () => {
    started = true;
    userPaused = !isPaused();
    sync();
  });

  /* ---- revelação: flash verde e "É BI!" (tempo, não scroll) ---- */
  let revealed = false;
  const slam = gsap.timeline({ paused: true })
    .fromTo('.reel__final', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0)
    .from('.reel__bi', { scale: 1.7, autoAlpha: 0, duration: 0.55, ease: 'power4.out' }, 0.04)
    .from(['.reel__tag', '.reel__sub', '.reel__controls'], { y: 26, autoAlpha: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' }, 0.3)
    .to('.reel__progress', { autoAlpha: 1, duration: 0.4 }, 0.3);
  if (!reduceMotion) {
    slam.fromTo('.reel__flash', { opacity: 0 }, { opacity: 0.5, duration: 0.07, ease: 'none' }, 0)
      .to('.reel__flash', { opacity: 0, duration: 0.65, ease: 'power2.out' }, 0.07);
  }
  function reveal() {
    revealed = true;
    slam.play();
  }
  function unreveal() {
    revealed = false;
    slam.reverse();
  }

  /* ---- linha do tempo guiada pelo scroll ---- */
  const GROW_AT = 0.1;
  const GROW_LEN = 0.45;
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: pin,
      start: 'top top',
      end: '+=230%',
      pin: true,
      scrub: 0.6,
      anticipatePin: 1,
    },
  });
  tl.to(['.reel__eyebrow', '.reel__lead', '.reel__hint'], { autoAlpha: 0, y: -26, duration: 0.14 }, GROW_AT)
    .to(mark, { opacity: 0, duration: 0.08 }, GROW_AT + 0.02)
    .to(grow, { g: 1, duration: GROW_LEN, ease: 'power3.in', onUpdate: applyGrow }, GROW_AT)
    .to('.reel__shade', { autoAlpha: 1, duration: 0.12 }, GROW_AT + GROW_LEN - 0.04)
    .to({}, { duration: 1 - GROW_AT - GROW_LEN }, GROW_AT + GROW_LEN);

  // O símbolo é um botão de play: toca com som e rola até o vídeo abrir por completo.
  slot.addEventListener('click', () => {
    soundOn(true);
    heardFromStart = true;
    const st = tl.scrollTrigger;
    scrollToY(st.start + (st.end - st.start) * ((GROW_AT + GROW_LEN) / tl.duration()) + 4);
  });

  /* ---- gatilhos de visibilidade e carregamento ---- */
  // pré-carrega um pouco antes de chegar (exceto com economia de dados: aí só baixa no play)
  ScrollTrigger.create({
    trigger: section,
    start: 'top bottom+=120%',
    onEnter: () => {
      if (navigator.connection?.saveData !== true) load();
    },
  });
  ScrollTrigger.create({
    trigger: section,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => {
      inView = self.isActive;
      section.classList.toggle('is-inview', inView);
      root.classList.toggle('is-reel', inView); // pausa o grão de filme sobre o vídeo (ver CSS)
      sync();
      updateUI();
    },
  });
  ScrollTrigger.addEventListener('refresh', measure);
  document.fonts?.ready.then(measure);
  measure();
  updateUI();
}

/* ---------------------------------------------------------------- navegação */

function setupNav() {
  const bar = $('.nav__progress span');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => { bar.style.transform = `scaleX(${self.progress.toFixed(4)})`; },
  });
  ScrollTrigger.create({ start: 40, end: 'max', toggleClass: { targets: '.nav', className: 'is-scrolled' } });

  for (const link of $$('.nav__links a')) {
    const section = $(link.getAttribute('href'));
    if (!section) continue;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => link.classList.toggle('is-active', self.isActive),
    });
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const target = $(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    scrollToY(target.getBoundingClientRect().top + window.scrollY);
  });

  $('[data-top]')?.addEventListener('click', () => scrollToY(0));
}
