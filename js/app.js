/* global Lenis */
(() => {
  'use strict';

  /* =========================================================================
	 0) Boot: Lenis + shared RAF
	 ======================================================================== */
  const lenis = new Lenis();
  function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);

  /* =========================================================================
	 1) Tiny utils
	 ======================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const once = (el, type) => new Promise(res => el.addEventListener(type, res, { once: true }));
  const inViewport = (el, margin = 0) => {
	const r = el.getBoundingClientRect();
	return r.top < (innerHeight + margin) && r.bottom > (0 - margin) &&
		   r.left < (innerWidth + margin) && r.right > (0 - margin);
  };

  /* =========================================================================
	 2) Top progress bar (driven by videos + load)
	 ======================================================================== */
  const Progress = (() => {
	const el = $('#progress');
	let val = 0;
	const set = (p) => {
	  if (!el) return;
	  val = Math.max(val, Math.min(p, 1));
	  el.style.setProperty('--progress', String(val));
	};
	const done = () => {
	  if (!el) return;
	  set(1);
	  el.classList.add('done');
	  setTimeout(() => el.remove(), 600);
	};
	return { set, done, get value() { return val; } };
  })();

  /* =========================================================================
	 3) Home page videos (hero + tiles) and poster preloading
	 ======================================================================== */
  const HomeVideos = (() => {
	function initVideos() {
	  const content   = $('#content');
	  const heroVid   = $('.project.hero-tile video');
	  const tileVids  = $$('.projects .grid .project video');
	  const allVids   = [...(heroVid ? [heroVid] : []), ...tileVids];

	  // gentle progress head start
	  Progress.set(0.15);

	  // baseline video attributes
	  allVids.forEach(v => {
		v.muted = true; v.loop = true; v.playsInline = true;
		v.setAttribute('playsinline', '');
		v.setAttribute('webkit-playsinline', '');
		v.setAttribute('crossorigin', 'anonymous');
	  });
	  if (heroVid) { heroVid.setAttribute('preload', 'auto'); heroVid.setAttribute('autoplay', ''); }
	  tileVids.forEach(v => { v.setAttribute('preload', 'metadata'); v.removeAttribute('autoplay'); });

	  // advance progress when first renderable is ready
	  const firstRenderable = heroVid || allVids[0];
	  if (firstRenderable) {
		(firstRenderable.readyState >= 2)
		  ? Progress.set(0.55)
		  : firstRenderable.addEventListener('loadeddata', () => Progress.set(0.55), { once: true });
	  } else {
		Progress.set(0.55);
	  }

	  // lift opacity once viewport tiles are ready (or timeout cap)
	  const marginPx = 120;
	  const projectsInView = $$('.project').filter(p => inViewport(p, marginPx));
	  const perProjectReady = projectsInView.map(p => {
		const v = $('video', p);
		if (!v) return Promise.resolve();
		const loaded  = (v.readyState >= 2) ? Promise.resolve() : once(v, 'loadeddata');
		const playing = new Promise(res => v.addEventListener('playing', res, { once: true }));
		return Promise.race([loaded, playing]).then(() => {
		  const base = Math.max(Progress.value, 0.55);
		  const target = Math.min(0.9, base + 0.12);
		  Progress.set(target);
		});
	  });

	  const cap = new Promise(res => setTimeout(res, 1600));
	  Promise.race([Promise.all(perProjectReady), cap]).then(() => {
		content?.classList.remove('fade');
		window.addEventListener('load', Progress.done);
		setTimeout(() => { if (Progress.value < 0.9) Progress.set(0.9); }, 600);
		setTimeout(() => { if (Progress.value < 1) Progress.done(); }, 1800);
	  });

	  // autoplay/pause via IO
	  if ('IntersectionObserver' in window) {
		const io = new IntersectionObserver((entries) => {
		  entries.forEach(({ target: v, isIntersecting, intersectionRatio }) => {
			if (isIntersecting && intersectionRatio >= 0.25) {
			  const p = v.play(); if (p && p.catch) p.catch(() => {});
			} else {
			  try { v.pause(); } catch {}
			}
		  });
		}, { root: null, rootMargin: '200px 0px 300px 0px', threshold: [0, 0.25] });
		allVids.forEach(v => io.observe(v));
	  } else {
		(heroVid || allVids[0])?.play?.()?.catch?.(() => {});
	  }

	  // pause all when hidden; resume only visible ones when shown again
	  document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
		  allVids.forEach(v => v.pause());
		} else {
		  allVids.forEach(v => {
			const r = v.getBoundingClientRect();
			if (r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0) {
			  const p = v.play(); if (p && p.catch) p.catch(() => {});
			}
		  });
		}
	  });
	}

	function preloadPosters() {
	  if (!('IntersectionObserver' in window)) return;
	  const posterObserver = new IntersectionObserver((entries) => {
		entries.forEach(entry => {
		  if (!entry.isIntersecting) return;
		  const video = $('video', entry.target);
		  const poster = video?.getAttribute('poster');
		  if (poster) { const img = new Image(); img.src = poster; }
		  posterObserver.unobserve(entry.target);
		});
	  }, { rootMargin: '200px' });
	  $$('.projects .grid .project').forEach(tile => posterObserver.observe(tile));
	}

	const run = () => { initVideos(); preloadPosters(); };

	(document.readyState === 'loading')
	  ? document.addEventListener('DOMContentLoaded', run)
	  : run();

	return { run };
  })();

  /* =========================================================================
	 4) Plyr asset loader (local files) + warm-up
	 ======================================================================== */
  const PlyrAssets = (() => {
	let ready;
	function load() {
	  if (ready) return ready;
	  ready = new Promise((resolve, reject) => {
		const cssId = 'plyr-css';
		if (!document.getElementById(cssId)) {
		  const link = document.createElement('link');
		  link.id = cssId;
		  link.rel = 'stylesheet';
		  link.href = '/css/plyr.min.css'; // local
		  document.head.appendChild(link);
		}
		if (window.Plyr) { resolve(); return; }
		const script = document.createElement('script');
		script.id = 'plyr-js';
		script.src = '/js/plyr.min.js';     // local
		script.onload = () => resolve();
		script.onerror = reject;
		document.head.appendChild(script);
	  });
	  return ready;
	}

	// warm once when a tile approaches viewport
	if ('IntersectionObserver' in window) {
	  const warmObserver = new IntersectionObserver((entries) => {
		if (entries.some(e => e.isIntersecting)) {
		  load();
		  warmObserver.disconnect();
		}
	  }, { rootMargin: '100px' });
	  $$('.projects .grid .project').forEach(tile => warmObserver.observe(tile));
	}

	// fallback: warm on first pointerenter near a project link
	document.addEventListener('pointerenter', (e) => {
	  if (e.target.closest && e.target.closest('a.project')) load();
	}, { passive: true, once: true });

	return { load };
  })();

  /* =========================================================================
	 5) Overlay player (modal) — Vimeo via Plyr, scroll lock, history
	 ======================================================================== */
  const Overlay = (() => {
	const overlay  = $('#player');
	if (!overlay) return {};

	const wrap     = $('.player-wrap', overlay);
	const closeBtn = $('.player-close', overlay);

	// history + scroll state
	let openedFromURL = location.href;
	let savedScrollY = 0;
	let savedScrollRestoration = 'auto';

	// cached player/container for reuse
	let cachedPlayer = null;
	let cachedVimeoId = null;
	let cachedContainer = null;

	// poster veil timings (keep in sync with CSS)
	const POSTER_FADE_DURATION   = 1000;
	const POSTER_SAFETY_TIMEOUT  = 3500;

	const getScrollbarWidth = () => window.innerWidth - document.documentElement.clientWidth;

	function lockScroll() {
	  savedScrollY = window.scrollY || 0;
	  if (lenis?.stop) lenis.stop();
	  savedScrollRestoration = history.scrollRestoration || 'auto';
	  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

	  const sw = getScrollbarWidth();
	  Object.assign(document.body.style, {
		position: 'fixed', top: `-${savedScrollY}px`, left: '0', right: '0', width: '100%',
		paddingRight: sw > 0 ? `${sw}px` : ''
	  });

	  document.documentElement.classList.add('modal-open');
	  document.body.classList.add('modal-open');
	}

	function unlockScroll() {
	  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '', paddingRight: '' });
	  document.documentElement.classList.remove('modal-open');
	  document.body.classList.remove('modal-open');

	  window.scrollTo(0, savedScrollY);
	  if (lenis?.start) {
		requestAnimationFrame(() => { if (lenis.scrollTo) lenis.scrollTo(savedScrollY, { immediate: true }); lenis.start(); });
	  }
	  if ('scrollRestoration' in history) history.scrollRestoration = savedScrollRestoration;
	}

	function mountPlayer(vimeoId, title, posterUrl) {
	  // reuse same video if possible
	  if (cachedVimeoId === vimeoId && cachedPlayer && cachedContainer) {
		if (!cachedContainer.isConnected) wrap.appendChild(cachedContainer);
		cachedPlayer.restart?.();
		cachedPlayer.play?.()?.catch?.(() => {});
		try { cachedPlayer.muted = false; } catch {}
		try { cachedPlayer.volume = 1; } catch {}
		try { cachedPlayer.embed?.setVolume?.(1); } catch {}
		return;
	  }

	  // teardown previous
	  if (cachedPlayer) {
		try { cachedPlayer.muted = true; } catch {}
		try { cachedPlayer.pause(); } catch {}
		try { cachedPlayer.embed?.setVolume?.(0); } catch {}
		try { cachedPlayer.destroy(); } catch {}
	  }
	  if (cachedContainer?.isConnected) cachedContainer.remove();
	  cachedPlayer = null; cachedVimeoId = null; cachedContainer = null;

	  PlyrAssets.load().then(() => {
		wrap.innerHTML = `
		  <div class="plyr plyr--overlay">
			<div class="plyr__video-embed"
				 data-plyr-provider="vimeo"
				 data-plyr-embed-id="${vimeoId}"
				 title="${title || 'Video'}"></div>
		  </div>
		`;

		const container = $('.plyr', wrap);
		const el        = $('.plyr__video-embed', container);

		const player = new Plyr(el, {
		  controls: ['progress','current-time','duration','mute','fullscreen'],
		  autoplay: true,
		  muted:   false,
		  clickToPlay: true,
		  hideControls: false,
		  tooltips: { controls: false, seek: false },
		  ratio: null,
		  storage: { enabled: false },
		  loop: { active: true },
		  vimeo: { dnt: true, playsinline: true, byline: false, portrait: false, title: false }
		});

		// cache immediately
		cachedPlayer = player;
		cachedVimeoId = vimeoId;
		cachedContainer = container;

		player.on('ready', () => {
		  // defer by two frames so Plyr lays out
		  requestAnimationFrame(() => {
			requestAnimationFrame(() => {
			  if (posterUrl) {
				const videoEmbed = $('.plyr__video-embed', container);
				const veil = document.createElement('div');
				veil.className = 'poster-veil';
				veil.style.backgroundImage = `url("${posterUrl}")`;
				(videoEmbed || container).appendChild(veil);

				const fade = () => {
				  veil.style.opacity = '0';
				  setTimeout(() => veil.remove(), POSTER_FADE_DURATION + 50);
				};
				player.on('playing', fade);
				setTimeout(() => { if (veil.isConnected) fade(); }, POSTER_SAFETY_TIMEOUT);
			  }

			  try { player.muted = false; } catch {}
			  try { player.volume = 1; } catch {}
			  try { player.embed?.setVolume?.(1); } catch {}
			});
		  });
		});

		player.on('play', () => {
		  try { player.muted = false; } catch {}
		  try { player.volume = 1; } catch {}
		  try { player.embed?.setVolume?.(1); } catch {}
		});

		player.play?.()?.catch?.(() => {});
	  });
	}

	function open(url, vimeoId, title, poster) {
	  openedFromURL = location.href;
	  history.pushState({ player: true }, '', url);
	  lockScroll();
	  overlay.hidden = false;
	  mountPlayer(vimeoId, title, poster);
	}

	function close({ viaHistory = false } = {}) {
	  // pause if present
	  if (cachedPlayer) { try { cachedPlayer.pause(); } catch {} }

	  overlay.hidden = true;

	  if (!viaHistory && history.state?.player) {
		history.replaceState(null, '', openedFromURL);
	  }

	  unlockScroll();

	  // resume visible grid videos
	  $$('.projects .grid .project video').forEach(v => {
		const r = v.getBoundingClientRect();
		if (r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0) {
		  const p = v.play(); if (p && p.catch) p.catch(() => {});
		}
	  });
	}

	// open from grid tiles
	document.addEventListener('click', (e) => {
	  const a = e.target.closest('a.project');
	  if (!a) return;

	  const id = a.dataset.vimeo;
	  if (!id) return;

	  e.preventDefault();

	  const href  = a.getAttribute('href') || location.href;
	  const title = $('.title', a)?.textContent || 'Video';

	  const v = $('video', a);
	  let poster = v?.getAttribute('poster') || v?.poster || '';
	  if (!poster) poster = a.getAttribute('data-poster') || '/img/hero-fallback.jpg';

	  open(href, id, title, poster);
	});

	// close interactions
	closeBtn?.addEventListener('click', () => close({ viaHistory: false }));
	overlay.addEventListener('click', (e) => { if (e.target === overlay) close({ viaHistory: false }); });
	window.addEventListener('popstate', () => { if (!overlay.hidden) close({ viaHistory: true }); });
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close({ viaHistory: false }); });

	// header links: close overlay first, then navigate
	document.addEventListener('click', (e) => {
	  const a = e.target.closest('.site-header a');
	  if (!a) return;
	  if (!overlay.hidden) {
		e.preventDefault();
		close({ viaHistory: false });
		location.href = a.href;
	  }
	});

	// cleanup on navigation away
	window.addEventListener('beforeunload', () => {
	  if (cachedPlayer?.destroy) { try { cachedPlayer.destroy(); } catch {} }
	});

	// expose minimal API (used by header handler)
	window.playerOverlay = {
	  open,
	  close: (opts) => close(opts),
	  isOpen: () => !overlay.hidden
	};

	return { open, close, isOpen: () => !overlay.hidden };
  })();

  /* =========================================================================
	 6) Project page: single video enhance with Plyr (loop + poster veil)
	 ======================================================================== */
  (function ProjectPagePlyr() {
	const holder = $('.project-page .video-embed');
	if (!holder) return;

	let vimeoId = holder.getAttribute('data-vimeo');
	if (!vimeoId) {
	  const existing = $('iframe[src*="player.vimeo.com"]', holder);
	  const m = existing?.src.match(/video\/(\d+)/);
	  if (m) vimeoId = m[1];
	}
	if (!vimeoId) return;

	const posterUrl = holder.getAttribute('data-poster') || '';

	PlyrAssets.load().then(() => {
	  holder.innerHTML = `
		<div class="plyr">
		  <div class="plyr__video-embed"
			   data-plyr-provider="vimeo"
			   data-plyr-embed-id="${vimeoId}"></div>
		</div>
	  `;

	  const container = $('.plyr', holder);
	  if (posterUrl) {
		container.style.setProperty('--poster', `url("${posterUrl}")`);
		const veil = document.createElement('div');
		veil.className = 'poster-veil';
		container.appendChild(veil);
	  }

	  const el = $('.plyr__video-embed', holder);
	  const player = new Plyr(el, {
		controls: ['progress','current-time','duration','fullscreen'],
		autoplay: true,
		muted: false,
		clickToPlay: true,
		hideControls: false,
		tooltips: { controls: false, seek: false },
		ratio: null,
		storage: { enabled: false },
		loop: { active: true },
		vimeo: { dnt: true, playsinline: true, byline: false, portrait: false, title: false }
	  });

	  const POSTER_FADE_DURATION = 1000;
	  player.on('playing', () => {
		const veil = $('.poster-veil', container);
		if (veil) {
		  veil.style.opacity = '0';
		  setTimeout(() => veil.remove(), POSTER_FADE_DURATION + 50);
		}
	  });

	  const forceFullVolume = () => {
		try { player.muted = false; } catch {}
		try { player.volume = 1; } catch {}
		try { player.embed?.setVolume?.(1); } catch {}
	  };
	  player.on('ready', forceFullVolume);
	  player.on('play',  forceFullVolume);

	  player.play()?.catch?.(() => {});
	});
  })();

  /* =========================================================================
	 7) Header: single-menu toggle (desktop + mobile), scrimless outside close
	 ======================================================================== */
  (function HeaderNav() {
	const btn    = $('[data-nav-toggle]');
	const links  = $('[data-links]');
	const closer = $('[data-nav-close]');
	if (!btn || !links) return;

	const open   = () => document.documentElement.classList.add('nav-open');
	const close  = () => document.documentElement.classList.remove('nav-open');
	const toggle = () => document.documentElement.classList.toggle('nav-open');

	btn.addEventListener('click', toggle);
	closer?.addEventListener('click', close);

	// close after tapping any link (mobile only)
	links.addEventListener('click', (e) => {
	  if (window.matchMedia('(max-width: 800px)').matches && e.target.closest('a')) close();
	});

	// scrimless: click/tap outside closes panel
	document.addEventListener('pointerdown', (e) => {
	  if (!document.documentElement.classList.contains('nav-open')) return;
	  if (!links.contains(e.target) && !btn.contains(e.target)) close();
	}, { passive: true });

	// prevent “slip” when switching to desktop
	const mql = window.matchMedia('(max-width: 800px)');
	mql.addEventListener('change', (ev) => { if (!ev.matches) close(); });
  })();

})();