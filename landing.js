(function () {
  var defaults = {
    heroTitle: 'ADA',
    heroSubtitle: 'نصمم تجارب رقمية استثنائية',
    heroDescription: 'من الواجهة الأولى حتى لوحة التحكم ونظام نقطة البيع، نبني تجارب رقمية أنيقة وسريعة ومقنعة بصرياً لتجعل علامتك تبدو أكبر، أذكى، وأكثر جاهزية للبيع.',
    ceoName: 'Ahmad Dawabsheh',
    ceoMessage: 'نؤمن أن التصميم الجيد لا يكتفي بأن يبدو جميلاً؛ بل يجعل الفكرة أوضح، والقرار أسرع، وتجربة العميل أكثر ثقة.',
    salesIdea: 'نبني مساراً واضحاً من أول انطباع حتى الطلب أو الشراء، مع محتوى يجيب قبل أن يسأل العميل.',
    feedbacks: []
  };

  function text(id, value) {
    var node = document.getElementById(id);
    if (node && value) node.textContent = value;
  }

  function applySettings(settings) {
    var data = Object.assign({}, defaults, settings || {});
    text('ceoName', data.ceoName);
    text('ceoText', data.ceoMessage);
    text('salesIdea', data.salesIdea);
    var heroSubtitle = document.querySelector('.hero-subtitle');
    var heroDescription = document.querySelector('.hero-description');
    if (heroSubtitle) heroSubtitle.textContent = data.heroSubtitle;
    if (heroDescription) heroDescription.textContent = data.heroDescription;
    var title = document.querySelector('.hero-title .gradient');
    if (title) title.textContent = data.heroTitle;
    var media = Array.isArray(data.heroMedia) ? data.heroMedia.filter(function (item) { return item && item.url; }) : [];
    var visual = document.querySelector('.hero-visual');
    if (visual && media.length) {
      var item = media[0];
      var safeUrl = escapeHtml(item.url);
      var safeAlt = escapeHtml(item.alt || 'واجهة رقمية من ADA');
      visual.innerHTML = item.type === 'video'
        ? '<div class="hero-media-frame"><video src="' + safeUrl + '" autoplay muted loop playsinline aria-label="' + safeAlt + '"></video></div>'
        : '<div class="hero-media-frame"><img src="' + safeUrl + '" alt="' + safeAlt + '"></div>';
    }

    var track = document.getElementById('feedbackTrack');
    if (track && Array.isArray(data.feedbacks) && data.feedbacks.length) {
      track.innerHTML = data.feedbacks.map(function (item) {
        return '<article class="feedback-card"><strong>' + escapeHtml(item.name || 'عميل ADA') + '</strong><p>' + escapeHtml(item.text || '') + '</p></article>';
      }).join('');
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function setupTheme() {
    var key = 'ada-theme';
    var stored = localStorage.getItem(key);
    var theme = stored === 'dark' ? 'dark' : 'light';
    var button = document.getElementById('themeToggle');
    document.body.dataset.theme = theme;
    if (!button) return;
    button.textContent = theme === 'dark' ? '☀' : '☾';
    button.addEventListener('click', function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      document.body.dataset.theme = theme;
      localStorage.setItem(key, theme);
      button.textContent = theme === 'dark' ? '☀' : '☾';
    });
  }

  function setupReveals() {
    var nodes = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(function (node) { node.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });
    nodes.forEach(function (node) { observer.observe(node); });
  }

  function loadSettings() {
    if (!window.firebase || !firebase.apps || !firebase.apps.length) {
      applySettings(defaults);
      return;
    }
    firebase.firestore().collection('projects').doc('_global').collection('settings').doc('site_config').get()
      .then(function (snapshot) { applySettings(snapshot.exists ? snapshot.data() : defaults); })
      .catch(function () { applySettings(defaults); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupTheme();
    setupReveals();
    loadSettings();
  });
}());
