/* global Lenis */

// -------- Smooth scroll (Lenis) --------
const lenis = new Lenis();
function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
requestAnimationFrame(raf);

// -------- Video init + performance --------
function initVideos() {
  const content   = document.querySelector('.content');
  const hero      = document.querySelector('.project.hero video');
  const tileNodes = document.querySelectorAll('.grid .project video');
  const tiles     = Array.from(tileNodes);
  const allVideos = [...(hero ? [hero] : []), ...tiles];

  // Configure attributes (lightweight for tiles; eager for hero)
  allVideos.forEach(v => {
	v.muted = true;
	v.loop = true;
	v.playsInline = true;
	v.setAttribute('playsinline','');
	v.setAttribute('webkit-playsinline','');
	v.setAttribute('crossorigin','anonymous');
  });
  if (hero) {
	hero.setAttribute('preload','auto');
	hero.setAttribute('autoplay','');
  }
  tiles.forEach(v => {
	// keep tiles light until they’re in view
	v.setAttribute('preload','metadata');
	v.removeAttribute('autoplay');
  });

  // Reveal content when the first primary video is ready (hero preferred)
  let revealed = false;
  const reveal = () => {
	if (!revealed && content) {
	  content.classList.remove('fade');
	  revealed = true;
	}
  };
  const first = hero || allVideos[0];
  if (first) {
	(first.readyState >= 2) ? reveal()
	  : first.addEventListener('loadeddata', reveal, { once: true });
  } else {
	reveal();
  }
  // Safety reveal in case of slow networks
  setTimeout(reveal, 1500);

  // Respect user preference: Reduce Motion = no autoplay
  const prefersReduce = window.matchMedia &&
						window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduce) {
	allVideos.forEach(v => { v.pause(); v.removeAttribute('autoplay'); });
	return; // bail out of autoplay/observer entirely
  }

  // IntersectionObserver: play when ~25% visible, pause otherwise
  const canIO = 'IntersectionObserver' in window;
  if (canIO) {
	const io = new IntersectionObserver((entries) => {
	  entries.forEach((entry) => {
		const v = entry.target;
		if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
		  const p = v.play();
		  if (p && p.catch) p.catch(() => {});
		} else {
		  v.pause();
		}
	  });
	}, {
	  root: null,
	  rootMargin: '200px 0px 300px 0px', // pre-warm before/after viewport
	  threshold: [0, 0.25, 0.5, 1]
	});

	allVideos.forEach(v => io.observe(v));
  } else {
	// Fallback: play hero (if present), pause others
	if (hero) {
	  hero.play().catch(() => {});
	  tiles.forEach(v => v.pause());
	} else if (allVideos[0]) {
	  allVideos[0].play().catch(() => {});
	  allVideos.slice(1).forEach(v => v.pause());
	}
  }

  // Page Visibility: pause all when tab hidden; resume visible ones on show
  document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
	  allVideos.forEach(v => v.pause());
	} else {
	  allVideos.forEach(v => {
		const r = v.getBoundingClientRect();
		const visible = r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0;
		if (visible) {
		  const p = v.play();
		  if (p && p.catch) p.catch(() => {});
		}
	  });
	}
  });
}

(document.readyState === 'loading')
  ? document.addEventListener('DOMContentLoaded', initVideos)
  : initVideos();