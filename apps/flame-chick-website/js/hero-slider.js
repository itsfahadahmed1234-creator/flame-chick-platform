/* Flame Chick Website — Menu Hero Promotional Slider.
   Replaces the static hero food image with an auto-advancing,
   manually navigable banner slider. Falls back to the current hero
   when no banners are configured. Only enabled slides from the
   admin-configured `settings.menu_hero_banners` are shown. */
(function (global) {
  'use strict';

  var sliderRoot = null;
  var track = null;
  var slides = [];
  var slideImgs = [];
  var fitObserver = null;
  var currentIndex = 0;
  var autoTimer = null;
  var isHovering = false;
  var animationId = null;
  var transitionEndHandler = null;
  var settings = {
    autoAdvanceMs: 5000,
    transitionMs: 500,
    pauseOnHover: true
  };
  // Direction the track was last positioned for, so a language switch can
  // re-apply the offset even when the banner list itself did not change.
  var lastRtl = null;
  // Infinite loop: we clone the first slide and append it to the end.
  // When transitioning to the clone, we snap back to index 0 without animation.
  var slideCount = 0;          // number of REAL slides (excludes clone)
  var isCloneSlide = false;    // true when currentIndex === slideCount (the clone)

  /* RTL matters here: with `dir=rtl` the flex track lays slides out
     right-to-left and the clipped window sits at the inline start (right
     edge), so advancing means moving the track RIGHT (+100% per slide)
     instead of left. Reading the computed direction of <html> keeps this
     correct even if the dir attribute is set on a wrapper instead. */
  function isRtl() {
    var doc = global.document;
    if (!doc || !doc.documentElement) return false;
    if (global.getComputedStyle) {
      return global.getComputedStyle(doc.documentElement).direction === 'rtl';
    }
    return doc.documentElement.getAttribute('dir') === 'rtl';
  }

  // +1 in RTL, -1 in LTR: the sign applied to the slide offset.
  function dirSign() { return isRtl() ? 1 : -1; }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildSlideElement(slide, idx) {
    var div = document.createElement('div');
    div.className = 'hero-slide';
    div.dataset.index = idx;
    div.setAttribute('role', 'group');
    div.setAttribute('aria-roledescription', 'slide');
    div.setAttribute('aria-label', 'Slide ' + (idx + 1) + ' of ' + slides.length);
    var alt = slide.alt || slide.altUr || 'Promotional banner';
    // First slide loads eagerly so the hero never paints empty; later slides
    // stay lazy so the page stays fast.
    var loading = idx <= 2 ? 'eager' : 'lazy';
    var priority = idx === 0 ? ' fetchpriority="high"' : '';
    div.innerHTML = '<img class="hero-slide__img" src="' + esc(slide.url) + '" alt="' + esc(alt) + '" loading="' + loading + '"' + priority + ' />';
    // Keep important text out of the crop: a banner whose aspect ratio differs
    // noticeably from the rendered frame is letterboxed (contain) instead of
    // cropped (cover). The frame itself never changes size, so no layout shift.
    var img = div.firstChild;
    img.addEventListener('load', function () { applyFit(img); });
    if (img.complete) applyFit(img);
    slideImgs.push(img);
    return div;
  }

  function applyFit(img) {
    if (!sliderRoot || !img || !img.naturalWidth || !img.naturalHeight) return;
    var frame = sliderRoot.clientWidth / sliderRoot.clientHeight;
    if (!frame) return; // hero not laid out yet; retried when it becomes visible
    var ar = img.naturalWidth / img.naturalHeight;
    img.classList.toggle('hero-slide__img--contain', Math.abs(ar - frame) / frame > 0.08);
  }

  function applyAllFits() {
    slideImgs.forEach(applyFit);
  }

  function buildIndicators() {
    var container = document.createElement('div');
    container.className = 'hero-slider__indicators';
    container.setAttribute('role', 'tablist');
    container.setAttribute('aria-label', 'Slide navigation');
    slides.forEach(function (_, idx) {
      var btn = document.createElement('button');
      btn.className = 'hero-slider__indicator' + (idx === 0 ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
      btn.setAttribute('aria-label', 'Go to slide ' + (idx + 1));
      btn.setAttribute('data-index', idx);
      btn.addEventListener('click', function () { goToSlide(idx); });
      container.appendChild(btn);
    });
    return container;
  }

  function buildControls() {
    var container = document.createElement('div');
    container.className = 'hero-slider__controls';
    var prev = document.createElement('button');
    prev.className = 'hero-slider__btn hero-slider__btn--prev';
    prev.setAttribute('aria-label', 'Previous slide');
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    prev.addEventListener('click', function () { prevSlide(); });
    var next = document.createElement('button');
    next.className = 'hero-slider__btn hero-slider__btn--next';
    next.setAttribute('aria-label', 'Next slide');
    next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    next.addEventListener('click', function () { nextSlide(); });
    container.appendChild(prev);
    container.appendChild(next);
    return container;
  }

  function updateTrackPosition(instant) {
    if (!track) return;
    var offset = dirSign() * currentIndex * 100;
    track.style.transition = instant ? 'none' : 'transform ' + settings.transitionMs + 'ms cubic-bezier(.25,.46,.45,.94)';
    track.style.transform = 'translateX(' + offset + '%)';
  }

  /* Called when the transition to the cloned slide finishes.
     We instantly (no transition) jump back to the real first slide. */
  function handleTransitionEnd() {
    if (!isCloneSlide) return;
    // We're on the clone (index === slideCount). Snap to real index 0.
    isCloneSlide = false;
    currentIndex = 0;
    updateTrackPosition(true); // instant, no animation
    updateIndicators();        // show first indicator as active
  }

  /* Re-position after the writing direction changes (EN <-> UR) without
     rebuilding the DOM, which init() skips when the banner list is unchanged. */
  function syncDirection() {
    var rtl = isRtl();
    if (rtl === lastRtl) return;
    lastRtl = rtl;
    updateTrackPosition(true);
  }

  function updateIndicators() {
    var indicators = sliderRoot.querySelectorAll('.hero-slider__indicator');
    // When on the clone slide, show the first indicator as active
    var displayIndex = isCloneSlide ? 0 : currentIndex;
    indicators.forEach(function (btn, idx) {
      btn.classList.toggle('is-active', idx === displayIndex);
      btn.setAttribute('aria-selected', idx === displayIndex ? 'true' : 'false');
    });
  }

  function goToSlide(index, instant) {
    if (!slides.length) return;
    // Clamp to real slides (0 to slideCount-1). The clone (slideCount) is only
    // targeted explicitly by nextSlide/prevSlide when advancing from the last slide.
    if (index < 0) index = 0;
    if (index > slideCount) index = slideCount; // allow clone only if explicitly requested
    
    // Detect if we're moving to the clone slide
    var wasClone = isCloneSlide;
    isCloneSlide = (index === slideCount);
    
    currentIndex = index;
    
    // Attach transitionend handler only when transitioning TO the clone
    if (!instant && isCloneSlide && !wasClone) {
      // Remove any existing handler first
      if (transitionEndHandler) {
        track.removeEventListener('transitionend', transitionEndHandler);
      }
      transitionEndHandler = function () {
        handleTransitionEnd();
        track.removeEventListener('transitionend', transitionEndHandler);
        transitionEndHandler = null;
      };
      track.addEventListener('transitionend', transitionEndHandler);
    } else if (wasClone && !isCloneSlide) {
      // We snapped back from clone to real slide 0, clean up
      if (transitionEndHandler) {
        track.removeEventListener('transitionend', transitionEndHandler);
        transitionEndHandler = null;
      }
    }
    
    updateTrackPosition(instant);
    updateIndicators();
    // Apply fit to the appropriate real slide image
    var fitIndex = isCloneSlide ? 0 : currentIndex;
    if (slideImgs[fitIndex]) applyFit(slideImgs[fitIndex]);
    resetAutoAdvance();
  }

  function nextSlide() {
    // Clone is only visited when advancing from the last real slide.
    if (isCloneSlide) {
      goToSlide(0); // clone -> real first
    } else if (currentIndex === slideCount - 1) {
      goToSlide(slideCount); // last real -> clone (triggers animated transition)
    } else {
      goToSlide(currentIndex + 1);
    }
  }
  function prevSlide() {
    // Going back from first real slide jumps to last real slide (not the clone).
    if (isCloneSlide) {
      goToSlide(slideCount - 1); // clone -> last real
    } else if (currentIndex === 0) {
      goToSlide(slideCount - 1); // first real -> last real
    } else {
      goToSlide(currentIndex - 1);
    }
  }

  function startAutoAdvance() {
    if (!settings.autoAdvanceMs || slides.length <= 1) return;
    stopAutoAdvance();
    autoTimer = setInterval(nextSlide, settings.autoAdvanceMs);
  }

  function stopAutoAdvance() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  function resetAutoAdvance() {
    if (settings.pauseOnHover && isHovering) return;
    startAutoAdvance();
  }

  function handleHoverEnter() {
    isHovering = true;
    stopAutoAdvance();
  }
  function handleHoverLeave() {
    isHovering = false;
    resetAutoAdvance();
  }

  function handleKeyDown(e) {
    // In RTL the next slide sits to the left, so the arrow keys swap roles.
    var rtl = isRtl();
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (rtl) nextSlide(); else prevSlide(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (rtl) prevSlide(); else nextSlide(); }
  }

  function handleTouchStart(e) {
    if (!slides.length) return;
    track.dataset.touchStartX = e.changedTouches[0].clientX;
    track.dataset.touchStartTime = Date.now();
    stopAutoAdvance();
  }
  function handleTouchMove(e) {
    if (!track.dataset.touchStartX) return;
    var dx = e.changedTouches[0].clientX - track.dataset.touchStartX;
    // Base offset follows the writing direction; the drag delta always follows
    // the finger, so the track stays under it in both directions.
    var offset = dirSign() * currentIndex * 100 + (dx / track.offsetWidth) * 100;
    track.style.transition = 'none';
    track.style.transform = 'translateX(' + offset + '%)';
  }
  function handleTouchEnd(e) {
    if (!track.dataset.touchStartX) return;
    var dx = e.changedTouches[0].clientX - track.dataset.touchStartX;
    var dt = Date.now() - track.dataset.touchStartTime;
    var threshold = track.offsetWidth * 0.15;
    delete track.dataset.touchStartX;
    delete track.dataset.touchStartTime;
    // RTL reverses the gesture: dragging right advances.
    var forward = isRtl() ? dx > 0 : dx < 0;
    if (Math.abs(dx) > threshold || (dt < 300 && Math.abs(dx) > 30)) {
      if (forward) nextSlide(); else prevSlide();
    } else {
      goToSlide(currentIndex, false);
    }
    resetAutoAdvance();
  }

  function init(bannerSlides) {
    var root = document.querySelector('.hero-slider');
    if (!root) return;
    var next = bannerSlides || [];

    // Idempotent: a catalog refresh that did not change the banner list must
    // not rebuild the DOM or jump the customer back to slide 1.
    var signature = JSON.stringify(next.map(function (s) {
      return [s && s.id, s && s.url, s && s.alt, s && s.altUr];
    }));
    if (root.getAttribute('data-signature') === signature) {
      // Same banners, but a language switch may have flipped the direction:
      // keep the current slide in view instead of leaving the track offset
      // in the old direction (which shows an empty frame in RTL).
      syncDirection();
      return;
    }

    // Tear down previous listeners before rebuilding (init can run again after
    // a published settings change). destroy() clears the module reference, so
    // restore it for the rebuild below.
    destroy();
    sliderRoot = root;

    // If no slides, keep the node (hidden) so a later catalog update can
    // re-initialise it, and restore the static fallback image.
    if (!next.length) {
      sliderRoot.hidden = true;
      sliderRoot.removeAttribute('data-signature');
      var fallback = document.querySelector('.hero-food.hero-bg');
      if (fallback) { fallback.hidden = false; fallback.classList.add('hero-stock'); }
      return;
    }

    slides = next;
    slideCount = slides.length;
    sliderRoot.setAttribute('data-signature', signature);
    sliderRoot.hidden = false;

    // Build slider DOM
    track = document.createElement('div');
    track.className = 'hero-slider__track';
    slideImgs = [];
    slides.forEach(function (slide, idx) {
      track.appendChild(buildSlideElement(slide, idx));
    });
    // Infinite loop: clone the first slide and append it to the end.
    // When we reach this clone, we'll instantly snap back to the real first slide.
    if (slideCount > 1) {
      var firstClone = buildSlideElement(slides[0], slideCount);
      firstClone.dataset.clone = 'true';
      track.appendChild(firstClone);
    }
    sliderRoot.innerHTML = '';
    sliderRoot.appendChild(track);
    sliderRoot.appendChild(buildIndicators());
    sliderRoot.appendChild(buildControls());

    // The menu hero can still be hidden behind the fulfillment gate when this
    // runs; re-check the fit once the slider actually becomes visible.
    if (global.IntersectionObserver) {
      if (fitObserver) fitObserver.disconnect();
      fitObserver = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { applyAllFits(); }
        });
      });
      fitObserver.observe(sliderRoot);
    }

    // Accessibility: keyboard navigation on the slider root
    sliderRoot.setAttribute('role', 'region');
    sliderRoot.setAttribute('aria-label', 'Promotional banner slider');
    sliderRoot.addEventListener('keydown', handleKeyDown);

    // Hover pause
    sliderRoot.addEventListener('mouseenter', handleHoverEnter);
    sliderRoot.addEventListener('mouseleave', handleHoverLeave);

    // Touch swipe
    sliderRoot.addEventListener('touchstart', handleTouchStart, { passive: true });
    sliderRoot.addEventListener('touchmove', handleTouchMove, { passive: true });
    sliderRoot.addEventListener('touchend', handleTouchEnd);

    // Start at first slide
    lastRtl = isRtl();
    goToSlide(0, true);
    startAutoAdvance();

    // Expose controls for debugging
    sliderRoot.__sliderApi = { goToSlide: goToSlide, next: nextSlide, prev: prevSlide, pause: stopAutoAdvance, resume: startAutoAdvance };
  }

  function destroy() {
    stopAutoAdvance();
    if (transitionEndHandler) {
      if (track) track.removeEventListener('transitionend', transitionEndHandler);
      transitionEndHandler = null;
    }
    if (fitObserver) { fitObserver.disconnect(); fitObserver = null; }
    slideImgs = [];
    isCloneSlide = false;
    if (sliderRoot) {
      sliderRoot.removeEventListener('keydown', handleKeyDown);
      sliderRoot.removeEventListener('mouseenter', handleHoverEnter);
      sliderRoot.removeEventListener('mouseleave', handleHoverLeave);
      sliderRoot.removeEventListener('touchstart', handleTouchStart);
      sliderRoot.removeEventListener('touchmove', handleTouchMove);
      sliderRoot.removeEventListener('touchend', handleTouchEnd);
      sliderRoot = null;
      track = null;
    }
  }

  global.FlameChickHeroSlider = { init: init, destroy: destroy };

  if (global.addEventListener) global.addEventListener('resize', applyAllFits);

  // Respect reduced-motion: keep manual navigation, stop auto-advancing.
  try {
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      settings.autoAdvanceMs = 0;
    }
  } catch (e) { /* matchMedia unavailable */ }

  // Never advance while the tab is in the background.
  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.hidden) stopAutoAdvance();
      else if (!isHovering) startAutoAdvance();
    });
  }
})(typeof window !== 'undefined' ? window : this);