/* global Lenis */
/* =========================
   Smooth scroll (Lenis)
   ========================= */
const lenis = new Lenis();
function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

/* =========================
   Progress bar helpers
   ========================= */
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

/* =========================
   Utils
   ========================= */
const inViewport = (el, margin=0) => {
  const r = el.getBoundingClientRect();
  return r.top < (innerHeight+margin) && r.bottom > (0-margin) &&
		 r.left < (innerWidth+margin) && r.right > (0-margin);
};
const once = (el, type) => new Promise(res => el.addEventListener(type, res, { once:true }));

/* =========================
   Home videos (hero + tiles)
   ========================= */
function initVideos(){
  const content   = document.querySelector('#content');
  const hero      = document.querySelector('.project.hero-tile video');
  const tiles     = Array.from(document.querySelectorAll('.projects .grid .project video'));
  const allVideos = [...(hero ? [hero] : []), ...tiles];

  setProgress(0.15);

  // Baseline attributes for mobile autoplay (home uses muted loops)
  allVideos.forEach(v=>{
	v.muted = true; v.loop = true; v.playsInline = true;
	v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
	v.setAttribute('crossorigin','anonymous');
  });
  if (hero){ hero.setAttribute('preload','auto'); hero.setAttribute('autoplay',''); }
  tiles.forEach(v=>{ v.setAttribute('preload','metadata'); v.removeAttribute('autoplay'); });

  // First render milestone (hero or first)
  const firstRenderable = hero || allVideos[0];
  if (firstRenderable){
	(firstRenderable.readyState >= 2) ? setProgress(0.55)
	  : firstRenderable.addEventListener('loadeddata', ()=>setProgress(0.55), { once:true });
  } else { setProgress(0.55); }

  // Reveal page when above-the-fold tiles are ready (or cap by time)
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

  // Pause off-screen; play when visible
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

  // Pause all when hidden; resume visible when shown again
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

/* =========================
   Plyr assets loader (lazy)
   ========================= */
let plyrReady;
function loadPlyrAssets() {
  if (plyrReady) return plyrReady;
  plyrReady = new Promise((resolve, reject) => {
	// CSS
	const cssId = 'plyr-css';
	if (!document.getElementById(cssId)) {
	  const link = document.createElement('link');
	  link.id = cssId;
	  link.rel = 'stylesheet';
	  link.href = 'https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.css';
	  document.head.appendChild(link);
	}
	// JS
	if (window.Plyr) { resolve(); return; }
	const script = document.createElement('script');
	script.id = 'plyr-js';
	script.src = 'https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.min.js';
	script.onload = () => resolve();
	script.onerror = reject;
	document.head.appendChild(script);
  });
  return plyrReady;
}

// Warm on intent (hover/touch over tiles)
document.addEventListener('pointerenter', (e) => {
  if (e.target.closest('a.project')) loadPlyrAssets();
}, { passive: true });
document.addEventListener('touchstart',  (e) => {
  if (e.target.closest('a.project')) loadPlyrAssets();
}, { passive: true, once: true });

/* ============================================================
   Player overlay (instant open/close, unmuted-first, global API)
   Uses Plyr so controls stay inside the viewport even if video crops
   ============================================================ */
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

  // Minimal, custom control set (tweak here)
  const PLYR_CONTROLS = [
	'progress', 'current-time', 'duration',
	'mute', 'fullscreen'
  ];

function mountPlayer(vimeoId, title, posterUrl){
	// Debug: verify we have a poster
	console.log('[mountPlayer] posterUrl:', posterUrl);
	
	loadPlyrAssets().then(() => {
	  // Build the Plyr container
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
  
	  // Wait for Plyr to fully build its DOM
	  player.on('ready', () => {
		console.log('[Plyr] ready event fired');
		
		// Use RAF to ensure DOM is fully painted
		requestAnimationFrame(() => {
		  requestAnimationFrame(() => {
			if (posterUrl) {
			  console.log('[Veil] Creating with poster:', posterUrl);
			  
			  const veil = document.createElement('div');
			  veil.className = 'poster-veil';
			  veil.style.backgroundImage = `url("${posterUrl}")`;
			  
			  // Append to container
			  container.appendChild(veil);
			  
			  // Debug: verify it was appended
			  console.log('[Veil] Appended to DOM:', veil.isConnected);
			  console.log('[Veil] Computed opacity:', window.getComputedStyle(veil).opacity);
			  console.log('[Veil] Computed z-index:', window.getComputedStyle(veil).zIndex);
  
			  // Fade out on playing
			  const fade = () => {
				console.log('[Veil] Fading out');
				veil.style.opacity = '0';
				setTimeout(() => {
				  if (veil.isConnected) {
					console.log('[Veil] Removing');
					veil.remove();
				  }
				}, 550);
			  };
  
			  player.on('playing', fade);
			  
			  // Safety timeout
			  setTimeout(() => { 
				if (veil.isConnected && window.getComputedStyle(veil).opacity !== '0') {
				  console.log('[Veil] Safety timeout - fading');
				  fade();
				}
			  }, 2000);
			} else {
			  console.warn('[Veil] No posterUrl provided');
			}
  
			// Force full volume
			try { player.muted = false; } catch {}
			try { player.volume = 1; } catch {}
			try { player.embed?.setVolume?.(1); } catch {}
		  });
		});
	  });
  
	  // Additional volume enforcement
	  player.on('play', () => {
		try { player.muted = false; } catch {}
		try { player.volume = 1; } catch {}
		try { player.embed?.setVolume?.(1); } catch {}
	  });
  
	  player.play().catch(()=>{ /* user interaction may be needed */ });
  
	  wrap._plyr = player;
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
	if (wrap._plyr && wrap._plyr.destroy) { try { wrap._plyr.destroy(); } catch {} }
	wrap._plyr = null;
	wrap.innerHTML = '';
	overlay.hidden = true;   // pop off

	if (!viaHistory && history.state?.player) {
	  history.replaceState(null, '', openedFromURL);
	}

	unlockScroll();

	// Nudge visible grid videos to repaint/play
	document.querySelectorAll('.projects .grid .project video').forEach(v=>{
	  const r = v.getBoundingClientRect();
	  if (r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0) {
		const p = v.play(); if (p && p.catch) p.catch(()=>{});
	  }
	});
  }

  // Tiles with data-vimeo → overlay
  document.addEventListener('click', (e)=>{
	const a = e.target.closest('a.project');
	if (!a) return;
  
	const id = a.dataset.vimeo;
	if (!id) return; // let normal nav happen
  
	e.preventDefault();
  
	const href  = a.getAttribute('href') || location.href;
	const title = a.querySelector('.title')?.textContent || 'Video';
  
	// Robust poster pickup with a safe fallback
	const v = a.querySelector('video');
	let poster = '';
	if (v) poster = v.getAttribute('poster') || v.poster || '';
	if (!poster) poster = a.getAttribute('data-poster') || 'img/hero-fallback.jpg';
  
	// (Optional tiny debug while you test)
	// console.debug('[overlay] poster:', poster);
  
	openOverlay(href, id, title, poster);
  });

  // Close controls
  closeBtn?.addEventListener('click', ()=> closeOverlay({ viaHistory:false }));
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) closeOverlay({ viaHistory:false }); });
  window.addEventListener('popstate', ()=>{ if (!overlay.hidden) closeOverlay({ viaHistory:true }); });
  
  // Allow closing overlay with Escape key
  document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && !overlay.hidden) {
	  closeOverlay({ viaHistory: false });
	}
  });
  
  // Global API
  window.playerOverlay = {
	open: openOverlay,
	close: (opts) => closeOverlay(opts),
	isOpen: () => !overlay.hidden
  };

  // Header links: close overlay first, then navigate
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

/* ===================================================
   Project pages: auto-enhance a single video with Plyr
   Markup: <div class="project-page"><div class="video-embed" data-vimeo="123456789"></div></div>
   =================================================== */
function initProjectPagePlyr(){
	 const holder = document.querySelector('.project-page .video-embed');
	 if (!holder) return;
   
	 // Resolve Vimeo ID
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
	 
	   // DOM-based poster veil
	   if (posterUrl) {
		 container.style.setProperty('--poster', `url("${posterUrl}")`);
		 const veil = document.createElement('div');
		 veil.className = 'poster-veil';
		 container.appendChild(veil);
	   }
	 
	   const el     = holder.querySelector('.plyr__video-embed');
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
		 const veil = container.querySelector('.plyr-poster-veil');
		 if (veil){ veil.style.opacity = '0'; setTimeout(() => veil.remove(), 550); }
	   });
	 
	   const forceFullVolume = () => {
		 try { player.muted = false; } catch {}
		 try { player.volume = 1; } catch {}
		 try { player.embed && player.embed.setVolume && player.embed.setVolume(1); } catch {}
	   };
	   player.on('ready', forceFullVolume);
	   player.on('play',  forceFullVolume);
	 
	   player.play().catch(()=>{});
	 });
   }

(document.readyState === 'loading')
  ? document.addEventListener('DOMContentLoaded', initProjectPagePlyr)
  : initProjectPagePlyr();