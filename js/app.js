/* ===== Smooth scroll (Lenis) ===== */
const lenis = new Lenis();
function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

/* ===== Progress bar helpers ===== */
const progressEl = document.getElementById('progress');
let progress = 0;
const setProgress = p => { if(progressEl){ progress = Math.max(progress, Math.min(p,1)); progressEl.style.setProperty('--progress', String(progress)); } };
const finishProgress = () => { if(!progressEl) return; setProgress(1); progressEl.classList.add('done'); setTimeout(()=>progressEl.remove(), 600); };

/* ===== Utils ===== */
const inViewport = (el, margin=0) => { const r = el.getBoundingClientRect(); return r.top < (innerHeight+margin) && r.bottom > (0 - margin) && r.left < (innerWidth+margin) && r.right > (0 - margin); };
const once = (el, type) => new Promise(res => el.addEventListener(type, res, { once:true }));

/* ===== Home videos (hero + tiles) ===== */
function initVideos(){
  const content   = document.querySelector('#content');                 // was .content
  const hero      = document.querySelector('.project.hero-tile video'); // was .project.hero video
  const tiles     = Array.from(document.querySelectorAll('.projects .grid .project video'));
  const allVideos = [...(hero ? [hero] : []), ...tiles];

  setProgress(0.15);

  // baseline video attributes
  allVideos.forEach(v=>{
	v.muted = true; v.loop = true; v.playsInline = true;
	v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
	v.setAttribute('crossorigin','anonymous');
  });
  if (hero){ hero.setAttribute('preload','auto'); hero.setAttribute('autoplay',''); }
  tiles.forEach(v=>{ v.setAttribute('preload','metadata'); v.removeAttribute('autoplay'); });

  // show page once hero/first tile is renderable
  const firstRenderable = hero || allVideos[0];
  if (firstRenderable){
	(firstRenderable.readyState >= 2) ? setProgress(0.55)
	  : firstRenderable.addEventListener('loadeddata', ()=>setProgress(0.55), { once:true });
  } else { setProgress(0.55); }

  // fade in content when above-the-fold tiles are ready (cap by time)
  const marginPx = 120;
  const projectsInView = Array.from(document.querySelectorAll('.project')).filter(p => inViewport(p, marginPx));
  const perProjectReady = projectsInView.map(p=>{
	const v = p.querySelector('video'); if(!v) return Promise.resolve();
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

  // Pause off-screen videos; play when visible
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

  // Page visibility: pause when hidden, resume visible in view
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
if ('requestIdleCallback' in window) { requestIdleCallback(() => loadVimeoAPI()); }
else { setTimeout(() => loadVimeoAPI(), 1500); }

let warmed = false;
const warmOnce = () => { if (!warmed) { warmed = true; loadVimeoAPI(); } };
document.addEventListener('pointerenter', (e) => { if (e.target.closest('a.project')) warmOnce(); }, { passive: true });
document.addEventListener('touchstart',  (e) => { if (e.target.closest('a.project')) warmOnce(); }, { passive: true, once: true });

/* ===== Player overlay (NO animations): instant open/close, unmuted-first, global API ===== */
(() => {
  const overlay  = document.getElementById('player');
  if (!overlay) return;

  const wrap     = overlay.querySelector('.player-wrap');
  const closeBtn = overlay.querySelector('.player-close');

  let openedFromURL = location.href;
  let savedScrollY = 0;
  let savedScrollRestoration = 'auto';

  function getScrollbarWidth(){ return window.innerWidth - document.documentElement.clientWidth; }

  function lockScroll(){
	savedScrollY = window.scrollY || 0;
	if (typeof lenis !== 'undefined' && lenis.stop) lenis.stop();

	savedScrollRestoration = history.scrollRestoration || 'auto';
	if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

	const sw = getScrollbarWidth();
	Object.assign(document.body.style, {
	  position:'fixed', top:`-${savedScrollY}px`, left:'0', right:'0', width:'100%',
	  paddingRight: sw>0 ? `${sw}px` : ''
	});

	document.documentElement.classList.add('modal-open');
	document.body.classList.add('modal-open');
  }

  function unlockScroll(){
	Object.assign(document.body.style, { position:'', top:'', left:'', right:'', width:'', paddingRight:'' });
	document.documentElement.classList.remove('modal-open');
	document.body.classList.remove('modal-open');

	window.scrollTo(0, savedScrollY);
	if (typeof lenis !== 'undefined' && lenis.start) {
	  requestAnimationFrame(()=>{ if (lenis.scrollTo) lenis.scrollTo(savedScrollY, { immediate:true }); lenis.start(); });
	}
	if ('scrollRestoration' in history) history.scrollRestoration = savedScrollRestoration;
  }

  function mountPlayer(vimeoId, title){
	const qs = new URLSearchParams({
	  autoplay:'1', muted:'0', playsinline:'1', dnt:'1',
	  byline:'0', title:'0', portrait:'0', pip:'1'
	}).toString();

	wrap.innerHTML = `
	  <iframe src="https://player.vimeo.com/video/${vimeoId}?${qs}"
			  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
			  allowfullscreen title="${title}" loading="eager"></iframe>`;
	const iframe = wrap.querySelector('iframe');

	loadVimeoAPI().then(()=>{
	  const player = new Vimeo.Player(iframe);
	  Promise.resolve()
		.then(()=>player.setVolume(1))
		.then(()=>player.play())
		.catch(()=>{
		  // rely on Vimeo’s own big Play UI if sound-autoplay is blocked
		});
	  wrap._player = player;
	});
  }

  function openOverlay(url, vimeoId, title){
	openedFromURL = location.href;
	history.pushState({ player:true }, '', url);

	lockScroll();
	overlay.hidden = false;          // pop on
	mountPlayer(vimeoId, title);
  }

  function closeOverlay({ viaHistory=false } = {}){
	if (wrap._player && wrap._player.unload) wrap._player.unload().catch(()=>{});
	wrap.innerHTML = '';
	overlay.hidden = true;           // pop off

	if (!viaHistory && history.state?.player) {
	  history.replaceState(null, '', openedFromURL);
	}

	unlockScroll();

	// nudge visible grid videos to repaint
	document.querySelectorAll('.projects .grid .project video').forEach(v=>{
	  const r = v.getBoundingClientRect();
	  if (r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0) {
		const p = v.play(); if (p && p.catch) p.catch(()=>{});
	  }
	});
  }

  // Tiles with data-vimeo → overlay
  document.addEventListener('click', (e)=>{
	const a = e.target.closest('a.project'); // markup: <a class="project tile" ...>
	if (!a) return;
	const id = a.dataset.vimeo;
	if (!id) return; // normal nav otherwise
	e.preventDefault();
	const href  = a.getAttribute('href');
	const title = a.querySelector('.title')?.textContent || 'Video';
	openOverlay(href, id, title);
  });

  // Close controls
  closeBtn.addEventListener('click', ()=> closeOverlay({ viaHistory:false }));
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) closeOverlay({ viaHistory:false }); });
  window.addEventListener('popstate', ()=>{ if (!overlay.hidden) closeOverlay({ viaHistory:true }); });

  // Global API for other code (e.g., header links)
  window.playerOverlay = {
	open: openOverlay,
	close: (opts) => closeOverlay(opts),
	isOpen: () => !overlay.hidden
  };

  // Header links: close overlay first, then navigate
  document.addEventListener('click', (e) => {
	const a = e.target.closest('.site-header a'); // was header a
	if (!a) return;
	if (window.playerOverlay.isOpen()) {
	  e.preventDefault();
	  window.playerOverlay.close({ viaHistory: false });
	  location.href = a.href;
	}
  });
})();