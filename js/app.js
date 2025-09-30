/* global Lenis */

/* ===== Smooth scroll (Lenis) ===== */
const lenis = new Lenis();
function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

/* ===== Progress bar helpers (if #progress exists) ===== */
const progressEl = document.getElementById('progress');
let progress = 0;
const setProgress = p => { if(progressEl){ progress = Math.max(progress, Math.min(p,1)); progressEl.style.setProperty('--progress', String(progress)); } };
const finishProgress = () => {
  if(!progressEl) return;
  setProgress(1);
  progressEl.classList.add('done');
  setTimeout(()=>progressEl.remove(), 600);
};

/* ===== Utils ===== */
const inViewport = (el, margin=0) => { const r = el.getBoundingClientRect(); return r.top < (innerHeight+margin) && r.bottom > (0 - margin) && r.left < (innerWidth+margin) && r.right > (0 - margin); };
const once = (el, type) => new Promise(res => el.addEventListener(type, res, { once:true }));

/* ===== Home videos: poster-only, global fade once viewport tiles are ready ===== */
function initVideos(){
  const content   = document.querySelector('.content');
  const hero      = document.querySelector('.project.hero video');
  const tiles     = Array.from(document.querySelectorAll('.grid .project video'));
  const allVideos = [...(hero ? [hero] : []), ...tiles];

  setProgress(0.15); // DOM parsed

  // Mobile autoplay requirements (tiles themselves stay muted loops on home)
  allVideos.forEach(v=>{
	v.muted = true; v.loop = true; v.playsInline = true;
	v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
	v.setAttribute('crossorigin','anonymous');
  });
  if (hero){ hero.setAttribute('preload','auto'); hero.setAttribute('autoplay',''); }
  tiles.forEach(v=>{ v.setAttribute('preload','metadata'); v.removeAttribute('autoplay'); });

  // First-paint milestone: hero (or first video) has a frame
  const firstRenderable = hero || allVideos[0];
  if (firstRenderable){
	(firstRenderable.readyState >= 2) ? setProgress(0.55)
	  : firstRenderable.addEventListener('loadeddata', ()=>setProgress(0.55), { once:true });
  } else { setProgress(0.55); }

  // Gate global reveal on tiles near viewport being ready (loadeddata OR playing)
  const marginPx = 120;
  const projectsInView = Array.from(document.querySelectorAll('.project'))
	.filter(p => inViewport(p, marginPx));

  const perProjectReady = projectsInView.map(p=>{
	const v = p.querySelector('video');
	if(!v) return Promise.resolve();
	const loaded  = (v.readyState >= 2) ? Promise.resolve() : once(v, 'loadeddata');
	const playing = new Promise(res => v.addEventListener('playing', res, { once:true }));
	return Promise.race([loaded, playing]).then(()=>{
	  const base = Math.max(progress, 0.55);
	  const target = Math.min(0.9, base + 0.12);
	  setProgress(target);
	});
  });

  const cap = new Promise(res=>setTimeout(res, 1600));
  Promise.race([Promise.all(perProjectReady), cap]).then(()=>{
	if(content) content.classList.remove('fade');
	window.addEventListener('load', finishProgress);
	setTimeout(()=>{ if(progress < 0.9) setProgress(0.9); }, 600);
	setTimeout(()=>{ if(progress < 1) finishProgress(); }, 1800);
  });

  // Play/pause based on viewport (battery/perf)
  if ('IntersectionObserver' in window){
	const io = new IntersectionObserver((entries)=>{
	  entries.forEach(({target:v,isIntersecting,intersectionRatio})=>{
		if(isIntersecting && intersectionRatio >= 0.25){
		  const p = v.play(); if(p && p.catch) p.catch(()=>{});
		}else{
		  try{ v.pause(); }catch{}
		}
	  });
	}, { root:null, rootMargin:'200px 0px 300px 0px', threshold:[0,0.25] });
	allVideos.forEach(v=>io.observe(v));
  }else{
	(hero || allVideos[0])?.play()?.catch(()=>{});
  }

  // Pause all when tab hidden; resume visible on show
  document.addEventListener('visibilitychange', ()=>{
	if(document.hidden){ allVideos.forEach(v=>v.pause()); }
	else{
	  allVideos.forEach(v=>{
		const r = v.getBoundingClientRect();
		if(r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0){
		  const p = v.play(); if(p && p.catch) p.catch(()=>{});
		}
	  });
	}
  });
}

(document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', initVideos) : initVideos();

/* ===== Vimeo API loader (lazy) ===== */
function loadVimeoAPI(){
  if (window.Vimeo && window.Vimeo.Player) return Promise.resolve();
  return new Promise((res, rej)=>{
	const s = document.createElement('script');
	s.src = 'https://player.vimeo.com/api/player.js';
	s.onload = ()=>res();
	s.onerror = rej;
	document.head.appendChild(s);
  });
}

// Warm the Vimeo API in the background
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => loadVimeoAPI());
} else {
  setTimeout(() => loadVimeoAPI(), 1500);
}

// Also warm on first hover/touch of any project (helps on fast clickers)
let warmed = false;
const warmOnce = () => { if (!warmed) { warmed = true; loadVimeoAPI(); } };
document.addEventListener('pointerenter', (e) => {
  if (e.target.closest('a.project')) warmOnce();
}, { passive: true });
document.addEventListener('touchstart', (e) => {
  if (e.target.closest('a.project')) warmOnce();
}, { passive: true, once: true });

/* ===== Route-aware modal with unmuted-first autoplay + bulletproof scroll restore ===== */
(() => {
  const modal = document.getElementById('player-modal');
  if (!modal) return;

  const wrap     = modal.querySelector('.player-wrap');
  const closeBtn = modal.querySelector('.modal-close');

  let lastFocus = null;
  let openedFromURL = location.href;
  let savedScrollY = 0;
  let savedScrollRestoration = 'auto';

  function getScrollbarWidth() {
	return window.innerWidth - document.documentElement.clientWidth;
  }

  function iframeShell(title){
	return `<div class="vimeo-holder" aria-label="${title}"></div>
			<button class="tap-to-play" hidden><span>▶︎&nbsp; Play with sound</span></button>`;
  }

  function lockScroll() {
	// snapshot scroll
	savedScrollY = window.scrollY || window.pageYOffset || 0;

	// stop Lenis (no virtual momentum during modal)
	if (typeof lenis !== 'undefined' && lenis.stop) lenis.stop();

	// avoid browser “helpful” scroll restoration while modal is active
	savedScrollRestoration = history.scrollRestoration || 'auto';
	if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

	// fixed-body lock (prevents any underlying movement)
	const sw = getScrollbarWidth();
	document.body.style.position = 'fixed';
	document.body.style.top = `-${savedScrollY}px`;
	document.body.style.left = '0';
	document.body.style.right = '0';
	document.body.style.width = '100%';
	if (sw > 0) document.body.style.paddingRight = `${sw}px`; // prevent layout shift

	document.documentElement.classList.add('modal-open');
	document.body.classList.add('modal-open');
  }

  function unlockScroll() {
	// release fixed-body lock
	document.body.style.position = '';
	document.body.style.top = '';
	document.body.style.left = '';
	document.body.style.right = '';
	document.body.style.width = '';
	document.body.style.paddingRight = '';

	document.documentElement.classList.remove('modal-open');
	document.body.classList.remove('modal-open');

	// restore scroll position first…
	window.scrollTo(0, savedScrollY);

	// …then resume Lenis so it syncs with the current position
	if (typeof lenis !== 'undefined' && lenis.start) {
	  // ensure sync on the next frame
	  requestAnimationFrame(() => {
		if (lenis.scrollTo) {
		  lenis.scrollTo(savedScrollY, { immediate: true });
		}
		lenis.start();
	  });
	}

	// give control back to browser for normal nav afterwards
	if ('scrollRestoration' in history) history.scrollRestoration = savedScrollRestoration;
  }

function openModal(url, vimeoId, title, invoker){
	lastFocus = invoker || document.activeElement;
	openedFromURL = location.href;
	history.pushState({ modal:true }, '', url);
  
	// 1) Inject the iframe immediately so the network starts NOW
	const params = new URLSearchParams({
	  autoplay: '1',        // try to start immediately
	  muted: '0',           // your requirement: not muted
	  playsinline: '1',
	  dnt: '1',
	  byline: '0', title: '0', portrait: '0',
	  pip: '1'
	}).toString();
  
	wrap.innerHTML = `
	  <iframe
		src="https://player.vimeo.com/video/${vimeoId}?${params}"
		allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
		allowfullscreen
		title="${title}"
		loading="eager"
		referrerpolicy="no-referrer-when-downgrade"></iframe>
	  <button class="tap-to-play" hidden><span>▶︎&nbsp; Play with sound</span></button>
	`;
  
	const iframe = wrap.querySelector('iframe');
	const tap    = wrap.querySelector('.tap-to-play');
  
	// 2) Open modal & lock scroll
	lockScroll();
	modal.showModal();
	closeBtn.focus({ preventScroll:true });
  
	// 3) Attach Vimeo Player to the already-loading iframe
	loadVimeoAPI().then(()=>{
	  const player = new Vimeo.Player(iframe);
  
	  // Try to ensure sound; if blocked, show the CTA
	  Promise.resolve()
		.then(()=>player.setVolume(1))
		.then(()=>player.play())
		.catch(()=>{
		  tap.hidden = false;
		  tap.addEventListener('click', ()=>{
			tap.hidden = true;
			player.play(); // one user gesture → allowed with audio
		  }, { once:true });
		});
  
	  wrap._player = player;
	});
  }

  function closeModal({ viaHistory = false } = {}) {
	// stop player and free resources
	if (wrap._player && wrap._player.unload) {
	  wrap._player.unload().catch(()=>{});
	}
	wrap.innerHTML = '';

	if (modal.open) modal.close();

	// If user clicked close/ESC: revert URL without navigating (no browser scroll restore)
	if (!viaHistory && history.state?.modal) {
	  history.replaceState(null, '', openedFromURL);
	}

	// unlock & restore scroll (order matters)
	unlockScroll();

	// restore focus (without scrolling)
	if (lastFocus && lastFocus.focus) {
	  try { lastFocus.focus({ preventScroll: true }); } catch {}
	}
  }

  // Enhance tile clicks (only with data-vimeo)
  document.addEventListener('click', (e)=>{
	const a = e.target.closest('a.project');
	if (!a) return;
	const id = a.dataset.vimeo;
	if (!id) return; // no enhancement → normal nav
	e.preventDefault();
	const href  = a.getAttribute('href');
	const title = a.getAttribute('aria-label') || a.querySelector('.title')?.textContent || 'Video';
	openModal(href, id, title, a);
  });

  // Button / ESC close → manual (no navigation; we restore URL ourselves)
  closeBtn.addEventListener('click', ()=> closeModal({ viaHistory:false }));
  modal.addEventListener('cancel', (e)=>{ e.preventDefault(); closeModal({ viaHistory:false }); });

  // Back button: close modal because user navigated history; do NOT alter history again
  window.addEventListener('popstate', ()=>{
	if (modal.open) closeModal({ viaHistory:true });
  });
})();