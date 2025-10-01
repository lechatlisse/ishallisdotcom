/* global Lenis */

/* Smooth scroll */
const lenis = new Lenis();
function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

/* Progress bar */
const progressEl = document.getElementById('progress');
let progress = 0;
const setProgress = p => {
  if(!progressEl) return;
  progress = Math.max(progress, Math.min(p,1));
  progressEl.style.setProperty('--progress', String(progress));
};
const finishProgress = () => {
  if(!progressEl) return;
  setProgress(1);
  progressEl.classList.add('done');
  setTimeout(()=>progressEl.remove(), 600);
};

/* Utils */
const inViewport = (el, margin=0) => {
  const r = el.getBoundingClientRect();
  return r.top < (innerHeight+margin) && r.bottom > (0-margin) &&
		 r.left < (innerWidth+margin) && r.right > (0-margin);
};
const once = (el, type) => new Promise(res => el.addEventListener(type, res, { once:true }));

/* Home videos (hero + tiles) */
function initVideos(){
  const content   = document.querySelector('#content');
  const hero      = document.querySelector('.project.hero-tile video');
  const tiles     = Array.from(document.querySelectorAll('.projects .grid .project video'));
  const allVideos = [...(hero ? [hero] : []), ...tiles];

  setProgress(0.15);

  allVideos.forEach(v=>{
	v.muted = true; v.loop = true; v.playsInline = true;
	v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
	v.setAttribute('crossorigin','anonymous');
  });
  if (hero){ hero.setAttribute('preload','auto'); hero.setAttribute('autoplay',''); }
  tiles.forEach(v=>{ v.setAttribute('preload','metadata'); v.removeAttribute('autoplay'); });

  const firstRenderable = hero || allVideos[0];
  if (firstRenderable){
	(firstRenderable.readyState >= 2) ? setProgress(0.55)
	  : firstRenderable.addEventListener('loadeddata', ()=>setProgress(0.55), { once:true });
  } else { setProgress(0.55); }

  const marginPx = 120;
  const projectsInView = Array.from(document.querySelectorAll('.project'))
	.filter(p => inViewport(p, marginPx));

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

/* Plyr loader */
let plyrReady;
function loadPlyrAssets() {
  if (plyrReady) return plyrReady;
  plyrReady = new Promise((resolve, reject) => {
	const cssId = 'plyr-css';
	if (!document.getElementById(cssId)) {
	  const link = document.createElement('link');
	  link.id = cssId;
	  link.rel = 'stylesheet';
	  link.href = '/css/plyr.min.css';  // Changed from CDN to local
	  document.head.appendChild(link);
	}
	if (window.Plyr) { resolve(); return; }
	const script = document.createElement('script');
	script.id = 'plyr-js';
	script.src = '/js/plyr.min.js';  // Changed from CDN to local
	script.onload = () => resolve();
	script.onerror = reject;
	document.head.appendChild(script);
  });
  return plyrReady;
}

document.addEventListener('pointerenter', (e) => {
  if (e.target.closest('a.project')) loadPlyrAssets();
}, { passive: true });
document.addEventListener('touchstart',  (e) => {
  if (e.target.closest('a.project')) loadPlyrAssets();
}, { passive: true, once: true });

/* Player overlay */
(() => {
  const overlay  = document.getElementById('player');
  if (!overlay) return;

  const wrap     = overlay.querySelector('.player-wrap');
  const closeBtn = overlay.querySelector('.player-close');

  let openedFromURL = location.href;
  let savedScrollY = 0;
  let savedScrollRestoration = 'auto';
  
  // Cache for reusing player
  let cachedPlayer = null;
  let cachedVimeoId = null;
  let cachedContainer = null;

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

  function mountPlayer(vimeoId, title, posterUrl){
	// If reopening same video, just replay it
	if (cachedVimeoId === vimeoId && cachedPlayer && cachedContainer) {
	  if (!cachedContainer.isConnected) {
		wrap.appendChild(cachedContainer);
	  }
	  
	  cachedPlayer.restart();
	  cachedPlayer.play().catch(()=>{});
	  
	  try { cachedPlayer.muted = false; } catch {}
	  try { cachedPlayer.volume = 1; } catch {}
	  try { cachedPlayer.embed?.setVolume?.(1); } catch {}
	  
	  return;
	}
  
	// Different video - destroy old player
	if (cachedPlayer && cachedPlayer.destroy) {
	  try { cachedPlayer.destroy(); } catch {}
	}
  
	loadPlyrAssets().then(() => {
	  wrap.innerHTML = `
		<div class="plyr plyr--overlay">
		  <div class="plyr__video-embed"
			   data-plyr-provider="vimeo"
			   data-plyr-embed-id="${vimeoId}"
			   title="${title || 'Video'}"></div>
		</div>
	  `;
  
	  const container = wrap.querySelector('.plyr');
	  const el = container.querySelector('.plyr__video-embed');
  
	  const player = new Plyr(el, {
		controls: ['progress','current-time','duration','mute','fullscreen'],
		autoplay: true,
		muted: false,
		clickToPlay: true,
		hideControls: false,
		tooltips: { controls: false, seek: false },
		ratio: '16:9',
		storage: { enabled: false },
		loop: { active: true },
		vimeo: { dnt:true, playsinline:true, byline:false, portrait:false, title:false }
	  });
  
	  // CRITICAL: Cache immediately after creation, before any async events
	  cachedPlayer = player;
	  cachedVimeoId = vimeoId;
	  cachedContainer = container;
	  wrap._plyr = player;
  
	  player.on('ready', () => {
		requestAnimationFrame(() => {
		  requestAnimationFrame(() => {
			if (posterUrl) {
			  const videoEmbed = container.querySelector('.plyr__video-embed');
			  
			  const veil = document.createElement('div');
			  veil.className = 'poster-veil';
			  veil.style.backgroundImage = `url("${posterUrl}")`;
			  
			  if (videoEmbed) {
				videoEmbed.appendChild(veil);
			  } else {
				container.prepend(veil);
			  }
  
			  const fade = () => {
				veil.style.opacity = '0';
				setTimeout(() => veil.remove(), 1050);
			  };
  
			  player.on('playing', fade);
			  setTimeout(() => { if (veil.isConnected) fade(); }, 3500);
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
  
	  player.play().catch(()=>{});
	});
  }

  function openOverlay(url, vimeoId, title, poster){
	openedFromURL = location.href;
	history.pushState({ player:true }, '', url);
	lockScroll();
	overlay.hidden = false;
	mountPlayer(vimeoId, title, poster);
  }

  function closeOverlay({ viaHistory=false } = {}){
	// Pause both cached player AND any player in wrap
	if (cachedPlayer) {
	  try { cachedPlayer.pause(); } catch {}
	}
	
	// Fallback: also check wrap._plyr in case caching hasn't completed
	if (wrap._plyr) {
	  try { wrap._plyr.pause(); } catch {}
	}
	
	overlay.hidden = true;
  
	if (!viaHistory && history.state?.player) {
	  history.replaceState(null, '', openedFromURL);
	}
  
	unlockScroll();
  
	document.querySelectorAll('.projects .grid .project video').forEach(v=>{
	  const r = v.getBoundingClientRect();
	  if (r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0) {
		const p = v.play(); if (p && p.catch) p.catch(()=>{});
	  }
	});
  }

  document.addEventListener('click', (e)=>{
	const a = e.target.closest('a.project');
	if (!a) return;

	const id = a.dataset.vimeo;
	if (!id) return;

	e.preventDefault();

	const href  = a.getAttribute('href') || location.href;
	const title = a.querySelector('.title')?.textContent || 'Video';

	const v = a.querySelector('video');
	let poster = '';
	if (v) poster = v.getAttribute('poster') || v.poster || '';
	if (!poster) poster = a.getAttribute('data-poster') || '/img/hero-fallback.jpg';

	openOverlay(href, id, title, poster);
  });

  closeBtn?.addEventListener('click', ()=> closeOverlay({ viaHistory:false }));
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) closeOverlay({ viaHistory:false }); });
  window.addEventListener('popstate', ()=>{ if (!overlay.hidden) closeOverlay({ viaHistory:true }); });

  document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && !overlay.hidden) {
	  closeOverlay({ viaHistory: false });
	}
  });

  window.playerOverlay = {
	open: openOverlay,
	close: (opts) => closeOverlay(opts),
	isOpen: () => !overlay.hidden
  };

  document.addEventListener('click', (e) => {
	const a = e.target.closest('.site-header a');
	if (!a) return;
	if (window.playerOverlay.isOpen()) {
	  e.preventDefault();
	  window.playerOverlay.close({ viaHistory: false });
	  location.href = a.href;
	}
  });
})();

/* Project pages: auto-enhance single video with Plyr */
function initProjectPagePlyr(){
  const holder = document.querySelector('.project-page .video-embed');
  if (!holder) return;

  let vimeoId = holder.getAttribute('data-vimeo');
  if (!vimeoId) {
	const existing = holder.querySelector('iframe[src*="player.vimeo.com"]');
	const m = existing && existing.src.match(/video\/(\d+)/);
	if (m) vimeoId = m[1];
  }
  if (!vimeoId) return;

  const posterUrl = holder.getAttribute('data-poster') || '';

  loadPlyrAssets().then(() => {
	holder.innerHTML = `
	  <div class="plyr">
		<div class="plyr__video-embed"
			 data-plyr-provider="vimeo"
			 data-plyr-embed-id="${vimeoId}"></div>
	  </div>
	`;

	const container = holder.querySelector('.plyr');

	if (posterUrl) {
	  container.style.setProperty('--poster', `url("${posterUrl}")`);
	  const veil = document.createElement('div');
	  veil.className = 'poster-veil';
	  container.appendChild(veil);
	}

	const el = holder.querySelector('.plyr__video-embed');
	const player = new Plyr(el, {
	  controls: ['progress','current-time','duration','fullscreen'],
	  autoplay: true,
	  muted: false,
	  clickToPlay: true,
	  hideControls: false,
	  tooltips: { controls: false, seek: false },
	  ratio: '16:9',
	  storage: { enabled: false },
	  loop: { active: true },
	  vimeo: { dnt:true, playsinline:true, byline:false, portrait:false, title:false }
	});

	player.on('playing', () => {
	  const veil = container.querySelector('.poster-veil');
	  if (veil){ veil.style.opacity = '0'; setTimeout(() => veil.remove(), 1050); }
	});

	const forceFullVolume = () => {
	  try { player.muted = false; } catch {}
	  try { player.volume = 1; } catch {}
	  try { player.embed?.setVolume?.(1); } catch {}
	};
	player.on('ready', forceFullVolume);
	player.on('play',  forceFullVolume);

	player.play().catch(()=>{});
  });
}

(document.readyState === 'loading')
  ? document.addEventListener('DOMContentLoaded', initProjectPagePlyr)
  : initProjectPagePlyr();