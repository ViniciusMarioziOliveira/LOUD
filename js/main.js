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
