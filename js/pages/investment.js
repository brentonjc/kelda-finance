// Investment Property (Beta)
// Embeds the standalone single-file module `kelda-investment-property.html` in an
// isolated iframe. The module is a self-contained app with its own internal router
// and globals (go/render/K/load/save/fmt/safeChart) plus its own localStorage prefix
// (kf_ip_). Running it in an iframe keeps those from colliding with the main Kelda app
// while still presenting it as a native page under Beta Features.
//
// Entry point — called by the router in app.js on go('investment').

function renderInvestment(){
  var host = document.getElementById('page-investment');
  if(!host) return;
  if(!host.dataset.mounted){
    host.innerHTML =
      '<iframe id="ip-frame" title="Investment Property" src="kelda-investment-property.html" '+
      'style="display:block;width:100%;border:0;background:var(--n950,#080C18)" '+
      'referrerpolicy="no-referrer"></iframe>';
    host.dataset.mounted = '1';
    // Re-size to fill the viewport when the window changes.
    if(!window._ipResizeBound){ window.addEventListener('resize', ipSizeFrame); window._ipResizeBound = true; }
  }
  ipSizeFrame();
  // Re-measure once layout has settled (first paint can report 0 height).
  if(window.requestAnimationFrame) requestAnimationFrame(ipSizeFrame);
  setTimeout(ipSizeFrame, 120);
}

// Size the embedded frame to fill the space between its top and the bottom of the
// viewport, accounting for the mobile tab bar when it is visible.
function ipSizeFrame(){
  var f = document.getElementById('ip-frame');
  if(!f) return;
  var vh = window.innerHeight || document.documentElement.clientHeight || 800;
  var top = f.getBoundingClientRect().top;
  var bar = document.getElementById('bottom-tab-bar');
  var barH = (bar && getComputedStyle(bar).display !== 'none') ? bar.getBoundingClientRect().height : 0;
  var h = vh - top - barH - 8;
  if(h < 600) h = 600;
  f.style.height = h + 'px';
}
