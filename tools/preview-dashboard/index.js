const TARGET_WIDTH = 1920; // Target resolution width
const TARGET_HEIGHT = 1080; // Target resolution height

function adjustScale() {
  const windowWidth = window.innerWidth; // Current window width
  const windowHeight = window.innerHeight; // Current window height

  // Calculate scaling factors
  const scaleX = windowWidth / TARGET_WIDTH;
  const scaleY = windowHeight / TARGET_HEIGHT;
  const scale = Math.min(scaleX, scaleY); // Choose the smaller scale to fit
  console.info('scale: ', scale, '; scaleX: ', scaleX, '; scaleY', scaleY, '; windowWidth', windowWidth, '; windowHeight', windowHeight);

  // Apply the scaling
  const viewport = document.getElementById('signage-viewport');
  viewport.style.transform = `scale(${scale})`;
}

// Adjust scale on load and when the window is resized
window.addEventListener('load', adjustScale);
window.addEventListener('load', () => {
  // load the dashboard
  const url = new URL(window.location.href).searchParams.get('url');
  document.querySelector('#viewport iframe').src = url;
});
window.addEventListener('resize', adjustScale);
