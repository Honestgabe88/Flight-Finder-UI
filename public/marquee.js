// Builds the trilingual scrolling marquee used on landing + loading.
// The three phrases all mean the same thing; they scroll by one after another.
window.buildMarquee = function buildMarquee(mountSelector) {
  const phrases = [
    { text: '今度は今度、今は今', cjk: true },
    { text: 'Kondo wa kondo, ima wa ima', cjk: false },
    { text: 'Next time is Next time, Now is Now', cjk: false },
  ];
  const mount = document.querySelector(mountSelector);
  if (!mount) return;
  const wrap = document.createElement('div');
  wrap.className = 'marquee';
  const track = document.createElement('div');
  track.className = 'marquee__track';
  // Duplicate the sequence so the loop reads continuously.
  for (let i = 0; i < 2; i++) {
    for (const p of phrases) {
      const span = document.createElement('span');
      span.className = 'marquee__phrase' + (p.cjk ? ' marquee__phrase--cjk' : '');
      span.textContent = p.text;
      track.appendChild(span);
    }
  }
  wrap.appendChild(track);
  mount.appendChild(wrap);
};
