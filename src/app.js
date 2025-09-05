import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

// Get slug from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const slug = urlParams.get('f');
if (!slug || slug.length !== 6) {
  console.error('Invalid or missing slug in URL');
  alert('Please provide a valid 6-letter slug in the URL (?f=XXXXX)');
  throw new Error('Invalid slug');
}

// Fetch assets
const fetchAssets = async () => {
  try {
    const response = await fetch(`https://framerz-dashboard.vercel.app/api?slug=${slug}`);
    if (!response.ok) throw new Error('Failed to fetch assets');
    const data = await response.json();
    return {
      mindUrl: data.mind_file_url,
      videoUrl: data.video_url,
      customerName: data.customer_name
    };
  } catch (error) {
    console.error('Error fetching assets:', error);
    alert('Failed to load assets. Please try again.');
    throw error;
  }
};

// Initialize AR
const initAR = async () => {
  const { mindUrl, videoUrl, customerName } = await fetchAssets();
  document.title = customerName || 'AR Experience';

  const mindarThree = new MindARThree({
    container: document.querySelector("#container"),
    imageTargetSrc: mindUrl
  });

  const { renderer, scene, camera } = mindarThree;
  const anchor = mindarThree.addAnchor(0);

  // VIDEO setup
  const video = document.createElement("video");
  video.src = videoUrl;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.muted = true;

  const videoTexture = new THREE.VideoTexture(video);

  // Wait for video metadata (get natural aspect ratio)
  video.addEventListener("loadedmetadata", () => {
    const aspect = video.videoWidth / video.videoHeight;
    const height = 1; // base height, tweak scale here
    const width = height * aspect;

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ map: videoTexture });
    const plane = new THREE.Mesh(geometry, material);
    anchor.group.add(plane);

    // Click → toggle play/pause
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    renderer.domElement.addEventListener("click", (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(plane);
      if (intersects.length > 0) {
        if (video.paused) {
          video.muted = false;
          video.play();
        } else {
          video.pause();
        }
      }
    });
  });

  // Play video ONLY when AR target detected
  anchor.onTargetFound = () => {
    video.muted = false; // set true if you want silent start
    video.play().catch(err => console.log("Play blocked:", err));
  };
  anchor.onTargetLost = () => video.pause();

  // Start AR
  try {
    await mindarThree.start();
    document.querySelector("#loader").style.display = "none";
    renderer.setAnimationLoop(() => {
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        videoTexture.needsUpdate = true;
      }
      renderer.render(scene, camera);
    });
  } catch (e) {
    console.error("Permission denied or error:", e);
    document.querySelector("#loader").innerText = "Camera access denied";
  }
};

// Initialize
window.addEventListener("load", () => {
  initAR().catch(err => {
    document.querySelector("#loader").innerText = "Initialization failed";
    console.error('Initialization failed:', err);
  });
});
