/* global Lenis */

// ---- Lenis (smooth scroll) ----
const lenis = new Lenis();
function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

// ---- Progress bar helpers (optional) ----
const progressEl = document.getElementById('progress');
let progress = 0;
const setProgress = p => {
  if (!progressEl) return;
  progress = Math.max(progress, Math.min(p, 1));
  progressEl.style.setProperty('--progress', String(progress));
};
const finishProgress = () => {
  if (!progressEl) return;
  setProgress(1);
  progressEl.classList.add('done');
  setTimeout(() => progressEl.remove(), 600);
};

// ---- Utils ----
const inViewport = (el, margin = 0) => {
  const r = el.getBoundingClientRect();
  return r.top < (innerHeight + margin) && r.bottom > (0 - margin) &&
		 r.left < (innerWidth + margin) && r.right > (0 - margin);
};
const once = (el, type) => new Promise(res => el.addEventListener(type, res, { once: true }));

// ---- Main ----
function initVideos() {
  const content   = document.querySelector('.content');
  const hero      = document.querySelector('.project.hero video');
  const tiles     = Array.from(document.querySelectorAll('.grid .project video'));
  const allVideos = [...(hero ? [hero] : []), ...tiles];

  // Milestone: DOM parsed
  setProgress(0.15);

  // Mobile autoplay requirements
  allVideos.forEach(v => {
	v.muted = true; v.loop = true; v.playsInline = true;
	v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
	v.setAttribute('crossorigin','anonymous');
  });
  if (hero) { hero.setAttribute('preload','auto'); hero.setAttribute('autoplay',''); }
  tiles.forEach(v => { v.setAttribute('preload','metadata'); v.removeAttribute('autoplay'); });

  // First-paint milestone: when hero (or first video) has first frame data
  const firstRenderable = hero || allVideos[0];
  if (firstRenderable) {
	(firstRenderable.readyState >= 2)
	  ? setProgress(0.55)
	  : firstRenderable.addEventListener('loadeddata', () => setProgress(0.55), { once: true });
  } else {
	setProgress(0.55);
  }

  // GLOBAL reveal gate: wait for tiles near/in viewport to be “ready”
  const marginPx = 120;
  const projectsInView = Array.from(document.querySelectorAll('.project'))
	.filter(p => inViewport(p, marginPx));

  const perProjectReady = projectsInView.map(p => {
	const v = p.querySelector('video');
	if (!v) return Promise.resolve();

	const loaded  = (v.readyState >= 2) ? Promise.resolve() : once(v, 'loadeddata');
	const playing = new Promise(res => v.addEventListener('playing', res, { once: true }));

	return Promise.race([loaded, playing]).then(() => {
	  const base = Math.max(progress, 0.55);
	  const target = Math.min(0.9, base + 0.12);
	  setProgress(target);
	});
  });

  const cap = new Promise(res => setTimeout(res, 1600)); // safety cap
  Promise.race([ Promise.all(perProjectReady), cap ]).then(() => {
	content && content.classList.remove('fade');
	window.addEventListener('load', finishProgress);
	setTimeout(() => { if (progress < 0.9) setProgress(0.9); }, 600);
	setTimeout(() => { if (progress < 1) finishProgress(); }, 1800);
  });

  // Play/pause based on viewport (battery/perf)
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

	allVideos.forEach(v => io.observe(v));
  } else {
	(hero || allVideos[0])?.play()?.catch(()=>{});
  }

  // Pause all when tab hidden; resume visible on show
  document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
	  allVideos.forEach(v => v.pause());
	} else {
	  allVideos.forEach(v => {
		const r = v.getBoundingClientRect();
		if (r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0) {
		  const p = v.play(); if (p && p.catch) p.catch(()=>{});
		}
	  });
	}
  });
}

(document.readyState === 'loading')
  ? document.addEventListener('DOMContentLoaded', initVideos)
  : initVideos();