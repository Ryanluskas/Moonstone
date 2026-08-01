/* =========================================================================
   Moonstone — lógica da experiência
   Fluxo: carregamento → créditos → mapa interativo
   Sem dependências, sem build, funciona offline (inclusive via file://).
   ========================================================================= */
(() => {
  'use strict';

  /* ───────────────────────── Configuração ─────────────────────────
     Para mover/adicionar um ponto no mapa: edite a lista abaixo.
     x/y são porcentagens dentro do recorte do pergaminho (0–100).
     Dica: com o mapa aberto, Shift+clique em qualquer lugar imprime as
     coordenadas prontas no console do navegador. */
  const REGIONS = [
    {
      id: 'moonlight',
      name: 'Moonlight',
      x: 28.9, y: 13.6,
      image: 'imagens_popup/img_area1.jpg',
      description: 'Ao norte, entre cogumelos altos e torres pálidas, fica a vila que deu nome ao reino. Dizem que aqui a lua nunca se põe por completo — e que ninguém dorme de costas para a janela.'
    },
    {
      id: 'three-beasts',
      name: '3 Beasts',
      x: 67.7, y: 23.1,
      image: 'imagens_popup/img_area2.jpg',
      description: 'Picos afiados sob a marca de um crânio. Três feras dividem esse território e nenhuma delas aceita visitantes. Caravanas fazem o desvio longo, mesmo custando semanas de viagem.'
    },
    {
      id: 'capital',
      name: 'Capital',
      x: 50.1, y: 52.6,
      image: 'imagens_popup/img_area3.jpg',
      description: 'O coração de Moonstone: o castelo no centro do continente, cercado por rios, florestas e todas as estradas que importam. Tudo que é decidido aqui chega às bordas do mapa mais cedo ou mais tarde.'
    }
  ];

  const TIMING = {
    creditsRoll: 22000,   // duração da rolagem dos créditos (casa com o CSS)
    creditsAuto: 21000,   // quando o mapa entra sozinho
    fade: 900,            // fade padrão entre telas
    hintFade: 7000        // quando a dica do mapa desaparece
  };

  const VOLUME = { wind: 0.55, music: 0.4 };

  /* ───────────────────────── Utilidades ───────────────────────── */
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* file:// sem storage */ } }
  };

  /* ───────────────────────── Áudio ─────────────────────────
     Fades feitos em requestAnimationFrame, com volume sempre preso
     entre 0 e 1 (passar disso lança IndexSizeError no navegador). */
  const audio = (() => {
    const tracks = {
      wind: new Audio('vento_calmo.mp3'),
      music: new Audio('musica_mapa.mp3')
    };
    Object.values(tracks).forEach((a) => { a.loop = true; a.preload = 'auto'; a.volume = 0; });

    let muted = store.get('moonstone:muted', 'false') === 'true';
    const fades = new WeakMap();

    function fade(track, target, duration = TIMING.fade) {
      return new Promise((resolve) => {
        cancelAnimationFrame(fades.get(track));
        const from = track.volume;
        const to = clamp(target, 0, 1);
        const start = performance.now();
        if (duration <= 0 || from === to) { track.volume = to; return resolve(); }
        const step = (now) => {
          const t = clamp((now - start) / duration, 0, 1);
          track.volume = clamp(from + (to - from) * t, 0, 1);
          if (t < 1) fades.set(track, requestAnimationFrame(step));
          else resolve();
        };
        fades.set(track, requestAnimationFrame(step));
      });
    }

    function play(track) {
      // navegadores rejeitam play() sem gesto do usuário — aqui sempre há um
      const p = track.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }

    function applyMute() {
      Object.values(tracks).forEach((a) => { a.muted = muted; });
    }
    applyMute();

    return {
      tracks,
      isMuted: () => muted,
      toggleMute() {
        muted = !muted;
        applyMute();
        store.set('moonstone:muted', String(muted));
        return muted;
      },
      async start(name, volume) {
        const track = tracks[name];
        track.currentTime = 0;
        play(track);
        await fade(track, volume, TIMING.fade);
      },
      async crossfade(fromName, toName, volume) {
        const from = tracks[fromName];
        const to = tracks[toName];
        to.currentTime = 0;
        play(to);
        await Promise.all([
          fade(from, 0, 1200).then(() => { from.pause(); }),
          fade(to, volume, 2200)
        ]);
      }
    };
  })();

  /* ───────────────────────── Céu (canvas) ─────────────────────────
     Estrelas em três camadas com parallax, cintilância e estrelas
     cadentes. Pausa sozinho quando a aba sai de foco. */
  const sky = (() => {
    const canvas = $('#sky');
    const ctx = canvas.getContext('2d', { alpha: true });
    let stars = [];
    let shooting = [];
    let w = 0, h = 0, dpr = 1;
    let pointer = { x: 0, y: 0 };
    let rafId = null;
    let nextShot = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      const density = clamp(Math.round((w * h) / 5200), 90, 320);
      stars = Array.from({ length: density }, () => {
        const depth = Math.random();
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.4 + depth * 1.5,
          depth,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.6,
          hue: Math.random() < 0.12 ? '215, 225, 255' : '255, 252, 240'
        };
      });
    }

    function spawnShootingStar() {
      const fromLeft = Math.random() < 0.5;
      shooting.push({
        x: fromLeft ? Math.random() * w * 0.4 : w - Math.random() * w * 0.4,
        y: Math.random() * h * 0.45,
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 4),
        vy: 2.2 + Math.random() * 2,
        life: 1,
        len: 90 + Math.random() * 90
      });
    }

    function draw(now) {
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;

      for (const s of stars) {
        const px = s.x + pointer.x * (4 + s.depth * 16);
        const py = s.y + pointer.y * (4 + s.depth * 16);
        const twinkle = reducedMotion ? 0.75 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
        ctx.globalAlpha = clamp(twinkle * (0.35 + s.depth * 0.65), 0, 1);
        ctx.fillStyle = `rgb(${s.hue})`;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!reducedMotion) {
        if (now > nextShot) {
          spawnShootingStar();
          nextShot = now + 4000 + Math.random() * 7000;
        }
        shooting = shooting.filter((s) => s.life > 0);
        for (const s of shooting) {
          s.x += s.vx; s.y += s.vy; s.life -= 0.012;
          const nx = s.x - s.vx * (s.len / 10);
          const ny = s.y - s.vy * (s.len / 10);
          const grad = ctx.createLinearGradient(s.x, s.y, nx, ny);
          grad.addColorStop(0, `rgba(255, 255, 255, ${clamp(s.life, 0, 1)})`);
          grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(nx, ny);
          ctx.stroke();
        }
      }

      if (rafId !== null) rafId = requestAnimationFrame(draw);
    }

    function loop(on) {
      if (on && rafId === null) { rafId = 0; rafId = requestAnimationFrame(draw); }
      if (!on && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    resize();
    window.addEventListener('resize', debounce(resize, 200));
    document.addEventListener('visibilitychange', () => loop(!document.hidden && !reducedMotion));

    // com movimento reduzido o céu é desenhado uma vez e fica parado
    if (reducedMotion) draw(0);
    else loop(true);

    return {
      setPointer(nx, ny) { pointer.x = nx; pointer.y = ny; }
    };
  })();

  function debounce(fn, ms) {
    let id;
    return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
  }

  /* ───────────────────────── Pré-carregamento ─────────────────────────
     Nada de fetch/XHR: em file:// eles são bloqueados. Usamos os próprios
     eventos de <img> e <audio>, com timeout para nunca travar. */
  async function preload(onProgress) {
    const images = ['mapa_moonstone.jpg', 'moonstone_logo.png', ...REGIONS.map((r) => r.image)];
    const sounds = Object.values(audio.tracks);
    const total = images.length + sounds.length;
    let done = 0;

    const tick = () => onProgress(Math.round((++done / total) * 100));

    const loadImage = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = src;
    });

    const loadSound = (track) => new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; cleanup(); resolve(); } };
      const cleanup = () => {
        track.removeEventListener('canplaythrough', finish);
        track.removeEventListener('error', finish);
      };
      track.addEventListener('canplaythrough', finish);
      track.addEventListener('error', finish);
      setTimeout(finish, 12000); // rede lenta não pode prender o usuário
      try { track.load(); } catch { finish(); }
    });

    await Promise.all([
      ...images.map((src) => loadImage(src).then(tick)),
      ...sounds.map((track) => loadSound(track).then(tick))
    ]);
  }

  /* ───────────────────────── Telas ───────────────────────── */
  const screens = {
    loader: $('#loader'),
    credits: $('#credits'),
    map: $('#map-screen')
  };

  async function showScreen(name) {
    const next = screens[name];
    const current = Object.values(screens).find((s) => s.classList.contains('screen--active'));

    if (current && current !== next) {
      current.classList.remove('screen--active');
      await wait(TIMING.fade);
      current.hidden = true;
    }
    next.hidden = false;
    // um frame para o navegador registrar o estado inicial antes da transição
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    next.classList.add('screen--active');
    document.body.dataset.screen = name;
  }

  /* ───────────────────────── Pontos do mapa ───────────────────────── */
  const mapFrame = $('#map-frame');
  const tooltip = $('#tooltip');

  function buildHotspots() {
    const frag = document.createDocumentFragment();
    REGIONS.forEach((region, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hotspot';
      btn.style.left = `${region.x}%`;
      btn.style.top = `${region.y}%`;
      btn.dataset.index = String(index);
      btn.setAttribute('aria-label', `Explorar a região ${region.name}`);
      btn.innerHTML =
        '<span class="hotspot__pulse"></span>' +
        '<span class="hotspot__pulse"></span>' +
        '<span class="hotspot__core"></span>' +
        `<span class="hotspot__label">${region.name}</span>`;

      btn.addEventListener('click', () => modal.open(index));
      btn.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        tooltip.textContent = region.name;
        tooltip.classList.add('tooltip--on');
        tooltip.setAttribute('aria-hidden', 'false');
      });
      btn.addEventListener('pointerleave', hideTooltip);
      btn.addEventListener('focus', () => {
        const r = btn.getBoundingClientRect();
        moveTooltip(r.left + r.width / 2, r.top);
        tooltip.textContent = region.name;
        tooltip.classList.add('tooltip--on');
      });
      btn.addEventListener('blur', hideTooltip);

      frag.appendChild(btn);
    });
    mapFrame.appendChild(frag);
  }

  function moveTooltip(x, y) {
    tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }
  function hideTooltip() {
    tooltip.classList.remove('tooltip--on');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  /* Parallax do céu + tooltip acompanhando o ponteiro (throttled em rAF) */
  (() => {
    let pending = false;
    let last = { x: 0, y: 0 };
    window.addEventListener('pointermove', (e) => {
      last = { x: e.clientX, y: e.clientY };
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const nx = (last.x / window.innerWidth) * 2 - 1;
        const ny = (last.y / window.innerHeight) * 2 - 1;
        sky.setPointer(-nx, -ny);
        if (!reducedMotion && document.body.dataset.screen === 'map') {
          mapFrame.style.transform = `perspective(1400px) rotateY(${nx * 1.6}deg) rotateX(${-ny * 1.1}deg)`;
        }
        moveTooltip(last.x, last.y);
      });
    }, { passive: true });
  })();

  /* ───────────────────────── Modal de região ───────────────────────── */
  const modal = (() => {
    const dialog = $('#popup');
    const img = $('#popup-img');
    const title = $('#popup-title');
    const desc = $('#popup-desc');
    const dots = $('#popup-dots');
    let current = 0;

    REGIONS.forEach((region, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'popup__dot';
      dot.setAttribute('aria-label', `Ir para ${region.name}`);
      dot.addEventListener('click', () => render(i));
      dots.appendChild(dot);
    });

    function render(index) {
      current = (index + REGIONS.length) % REGIONS.length;
      const region = REGIONS[current];
      img.classList.remove('is-loaded');
      img.alt = `Ilustração da região ${region.name}`;
      img.src = region.image;
      if (img.complete) img.classList.add('is-loaded');
      title.textContent = region.name;
      desc.textContent = region.description;
      [...dots.children].forEach((dot, i) =>
        dot.setAttribute('aria-current', String(i === current)));
    }

    img.addEventListener('load', () => img.classList.add('is-loaded'));

    function open(index) {
      render(index);
      dialog.showModal(); // <dialog> nativo já prende o foco e devolve ao fechar
      $('#map-hint').classList.add('map__hint--gone');
      hideTooltip();
    }

    async function close() {
      dialog.classList.add('popup--closing');
      await wait(reducedMotion ? 0 : 250);
      dialog.classList.remove('popup--closing');
      dialog.close();
    }

    // Esc: animar em vez de fechar seco
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    // clique fora do cartão
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    $('#popup-close').addEventListener('click', close);
    $('#popup-prev').addEventListener('click', () => render(current - 1));
    $('#popup-next').addEventListener('click', () => render(current + 1));
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') render(current - 1);
      if (e.key === 'ArrowRight') render(current + 1);
    });

    // arrastar/deslizar entre regiões no celular
    let startX = null;
    dialog.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    dialog.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 60) render(current + (dx < 0 ? 1 : -1));
    });

    return { open, close, isOpen: () => dialog.open };
  })();

  /* ───────────────────────── HUD ───────────────────────── */
  const hud = $('#hud');
  const muteBtn = $('#mute-btn');
  const fsBtn = $('#fs-btn');

  function syncMuteBtn() {
    const muted = audio.isMuted();
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? 'Ativar som' : 'Silenciar som');
    muteBtn.title = muted ? 'Ativar som (M)' : 'Silenciar (M)';
  }
  muteBtn.addEventListener('click', () => { audio.toggleMute(); syncMuteBtn(); });
  fsBtn.addEventListener('click', toggleFullscreen);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const p = document.documentElement.requestFullscreen?.();
      if (p && p.catch) p.catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'm') { audio.toggleMute(); syncMuteBtn(); }
    if (key === 'f') toggleFullscreen();
    if (key === 'escape' && document.body.dataset.screen === 'credits') goToMap();
  });

  /* ───────────────────────── Fluxo ───────────────────────── */
  const progressBar = $('#progress-bar');
  const progressLabel = $('#progress-label');
  const enterBtn = $('#enter-btn');
  const skipBtn = $('#skip-btn');
  let creditsTimer = null;
  let mapReached = false;

  function setProgress(pct) {
    progressBar.style.width = `${pct}%`;
    progressLabel.textContent = `carregando… ${pct}%`;
    progressBar.parentElement.setAttribute('aria-valuenow', String(pct));
  }

  let isReady = false;
  function ready() {
    if (isReady) return;
    isReady = true;
    setProgress(100);
    progressLabel.textContent = 'pronto';
    screens.loader.classList.add('loader--ready');
    enterBtn.disabled = false;
    enterBtn.focus();
  }

  async function startExperience() {
    enterBtn.disabled = true;
    hud.hidden = false;
    syncMuteBtn();

    // o clique em "Entrar" é o gesto que libera o áudio no navegador
    audio.start('wind', VOLUME.wind);

    await showScreen('credits');
    screens.credits.classList.add('credits--rolling');
    creditsTimer = setTimeout(goToMap, reducedMotion ? 9000 : TIMING.creditsAuto);
  }

  async function goToMap() {
    if (mapReached) return;
    mapReached = true;
    clearTimeout(creditsTimer);

    audio.crossfade('wind', 'music', VOLUME.music);
    await showScreen('map');
    setTimeout(() => $('#map-hint').classList.add('map__hint--gone'), TIMING.hintFade);
  }

  enterBtn.addEventListener('click', startExperience);
  skipBtn.addEventListener('click', goToMap);

  /* Ajuda para a equipe: Shift+clique no mapa mostra as coordenadas do ponto */
  mapFrame.addEventListener('click', (e) => {
    if (!e.shiftKey) return;
    const r = mapFrame.getBoundingClientRect();
    const x = (((e.clientX - r.left) / r.width) * 100).toFixed(1);
    const y = (((e.clientY - r.top) / r.height) * 100).toFixed(1);
    console.log(`[Moonstone] ponto → x: ${x}, y: ${y}`);
  });

  /* ───────────────────────── Início ───────────────────────── */
  if (window.matchMedia('(hover: none)').matches) document.body.classList.add('is-touch');

  buildHotspots();

  // trava de segurança: se algum asset não responder, libera o botão mesmo assim
  const failsafe = setTimeout(ready, 20000);
  preload(setProgress).then(() => { clearTimeout(failsafe); ready(); });
})();
