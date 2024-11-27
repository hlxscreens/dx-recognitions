function adjustScale() {
  const targetWidth = 1920; // Target resolution width
  const targetHeight = 1080; // Target resolution height
  const windowWidth = window.innerWidth; // Current window width
  const windowHeight = window.innerHeight; // Current window height

  // Calculate scaling factors
  const scaleX = windowWidth / targetWidth;
  const scaleY = windowHeight / targetHeight;
  const scale = Math.min(scaleX, scaleY); // Choose the smaller scale to fit

  // Apply the scaling
  const viewport = document.getElementById("viewport");
  viewport.style.transform = `scale(${scale})`;
}

// Adjust scale on load and when the window is resized
window.addEventListener("load", adjustScale);
window.addEventListener("resize", adjustScale);

// load the dashboard
const dashboardURL = new URL(window.location.href).searchParams.get('dashboardURL');
document.querySelector('#viewport iframe').src = dashboardURL;
