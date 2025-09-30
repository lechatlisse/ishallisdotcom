/* global Lenis */

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

/* ===== Home videos ===== */
function initVideos(){
  const content   = document.querySelector('.content');
  const hero      = document.querySelector('.project.hero video');
  const tiles     = Array.from(document.querySelectorAll('.grid .project video'));
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
  const projectsInView = Array.from(document.querySelectorAll('.project')).filter(p => inViewport(p, marginPx));

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

/* ===== Route-aware modal (no animations; a11y-specific focus mgmt removed) ===== */
(() => {
  const modal = document.getElementById('player-modal');
  if (!modal) return;

  const wrap = modal.querySelector('.player-wrap');
  const closeBtn = modal.querySelector('.modal-close');

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

  function openModal(url, vimeoId, title){
	openedFromURL = location.href;
	history.pushState({ modal:true }, '', url);

	const qs = new URLSearchParams({
	  autoplay:'1', muted:'0', playsinline:'1', dnt:'1',
	  byline:'0', title:'0', portrait:'0', pip:'1'
	}).toString();

	wrap.innerHTML = `
	  <iframe src="https://player.vimeo.com/video/${vimeoId}?${qs}"
			  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
			  allowfullscreen title="${title}" loading="eager"></iframe>
	  <button class="tap-to-play" hidden><span>▶️ Play with sound</span></button>`;

	const iframe = wrap.querySelector('iframe');
	const tap    = wrap.querySelector('.tap-to-play');

	lockScroll();
	modal.showModal();

	loadVimeoAPI().then(()=>{
	  const player = new Vimeo.Player(iframe);
	  Promise.resolve()
		.then(()=>player.setVolume(1))
		.then(()=>player.play())
		.catch(()=>{
		  tap.hidden = false;
		  tap.addEventListener('click', ()=>{ tap.hidden = true; player.play(); }, { once:true });
		});
	  wrap._player = player;
	});
  }

  function closeModal({ viaHistory=false } = {}){
	if (!modal.open) return;

	if (wrap._player && wrap._player.unload) wrap._player.unload().catch(()=>{});
	wrap.innerHTML = '';
	modal.close();

	if (!viaHistory && history.state?.modal) {
	  history.replaceState(null, '', openedFromURL);
	}

	unlockScroll();
  }

  document.addEventListener('click', (e)=>{
	const a = e.target.closest('a.project');
	if(!a) return;
	const id = a.dataset.vimeo;
	if(!id) return;
	e.preventDefault();
	const href  = a.getAttribute('href');
	const title = a.querySelector('.title')?.textContent || 'Video';
	openModal(href, id, title);
  });

  closeBtn.addEventListener('click', ()=> closeModal({ viaHistory:false }));
  modal.addEventListener('cancel', (e)=>{ e.preventDefault(); closeModal({ viaHistory:false }); });
  window.addEventListener('popstate', ()=>{ if (modal.open) closeModal({ viaHistory:true }); });
})();