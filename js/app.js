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

/* ===== Route-aware modal with UNMUTED-first autoplay + one-tap fallback ===== */
(()=>{
  const modal = document.getElementById('player-modal');
  if(!modal) return;
  const wrap  = modal.querySelector('.player-wrap');
  const closeBtn = modal.querySelector('.modal-close');
  let lastFocus = null;

  function iframeHTML(vimeoId, title){
	// we’ll build via Vimeo.Player, not a raw iframe src
	return `<div class="vimeo-holder" aria-label="${title}"></div>
			<button class="tap-to-play" hidden><span>▶︎&nbsp; Play with sound</span></button>`;
  }

  function openModal(url, vimeoId, title, invoker){
	lastFocus = invoker || document.activeElement;
	history.pushState({ modal:true }, '', url);

	wrap.innerHTML = iframeHTML(vimeoId, title);
	const holder = wrap.querySelector('.vimeo-holder');
	const tap    = wrap.querySelector('.tap-to-play');

	document.documentElement.classList.add('modal-open');
	document.body.classList.add('modal-open');
	modal.showModal();
	closeBtn.focus();

	loadVimeoAPI().then(()=>{
	  const player = new Vimeo.Player(holder, {
		id: vimeoId,
		autoplay: true,        // try autoplay…
		muted: false,          // …with sound (your requirement)
		playsinline: true,
		dnt: true,
		byline: false, title: false, portrait: false
	  });

	  // Try unmuted; if blocked, show CTA button
	  Promise.resolve()
		.then(()=>player.setVolume(1))
		.then(()=>player.play())
		.catch(()=>{
		  tap.hidden = false;
		  tap.addEventListener('click', ()=>{
			tap.hidden = true;
			player.play(); // user gesture → allowed with sound
		  }, { once:true });
		});

	  wrap._player = player;
	});
  }

  function closeModal(popHistory=true){
	if (wrap._player && wrap._player.unload){
	  wrap._player.unload().catch(()=>{});
	}
	wrap.innerHTML = '';
	document.documentElement.classList.remove('modal-open');
	document.body.classList.remove('modal-open');
	if (modal.open) modal.close();
	if (popHistory && history.state?.modal) history.back();
	if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // Enhance tile clicks (keep normal nav if no data-vimeo)
  document.addEventListener('click', (e)=>{
	const a = e.target.closest('a.project');
	if(!a) return;
	const id = a.dataset.vimeo;
	if(!id) return; // no enhancement → normal navigation to /work/slug/
	e.preventDefault();
	const href  = a.getAttribute('href');
	const title = a.getAttribute('aria-label') || a.querySelector('.title')?.textContent || 'Video';
	openModal(href, id, title, a);
  });

  // Close / ESC
  closeBtn.addEventListener('click', ()=>closeModal(true));
  modal.addEventListener('cancel', (e)=>{ e.preventDefault(); closeModal(true); });

  // Back button closes modal instead of full nav
  window.addEventListener('popstate', ()=>{
	if(modal.open) closeModal(false);
  });
})();