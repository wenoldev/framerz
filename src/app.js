import * as THREE from "three";
import { MindARThree } from "mindar-image-three";

// Get slug from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const slug = urlParams.get("f");
if (!slug || slug.length !== 6) {
  console.error("Invalid or missing slug in URL");
  alert("Please provide a valid 6-letter slug in the URL (?f=XXXXX)");
  throw new Error("Invalid slug");
}

// Detect iOS
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

// Fetch assets from API
const fetchAssets = async () => {
  try {
    const response = await fetch(
      `https://framerz-dashboard.vercel.app/api?slug=${slug}`
    );
    if (!response.ok) throw new Error("Failed to fetch assets");
    const data = await response.json();
    return {
      mindUrl: data.mind_file_url,
      videoUrl: data.video_url,
      thumbnailUrl: data.thumbnail_url || null,
      customerName: data.customer_name,
    };
  } catch (error) {
    console.error("Error fetching assets:", error);
    alert("Failed to load assets. Please try again.");
    throw error;
  }
};

// Build overlay (thumbnail + play button + label)
const makeOverlay = (geometry, anchor, renderer, camera, video, baseMaterial) => {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Glassy circle
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2 - 60, 120, 0, Math.PI * 2);
  ctx.fill();

  // Play triangle
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(size / 2 - 40, size / 2 - 120);
  ctx.lineTo(size / 2 - 40, size / 2);
  ctx.lineTo(size / 2 + 70, size / 2 - 60);
  ctx.closePath();
  ctx.fill();

  // Label
  ctx.font = "bold 50px Verdana";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText("TAP TO PLAY", size / 2, size - 80);

  const overlayTex = new THREE.CanvasTexture(canvas);
  const overlayMaterial = new THREE.MeshBasicMaterial({
    map: overlayTex,
    transparent: true,
  });

  const overlayPlane = new THREE.Mesh(geometry, overlayMaterial);
  const basePlane = new THREE.Mesh(geometry, baseMaterial);

  const overlayGroup = new THREE.Group();
  overlayGroup.add(basePlane);
  overlayGroup.add(overlayPlane);
  anchor.group.add(overlayGroup);

  // Raycaster for click (gesture unlock on iOS)
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  renderer.domElement.addEventListener("click", async (event) => {
    if (!overlayGroup.visible) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(overlayGroup.children);
    if (intersects.length > 0) {
      overlayGroup.visible = false;
      try {
        video.muted = false; // unmute after gesture
        await video.play();
      } catch (err) {
        console.warn("Play blocked on iOS:", err);
      }
    }
  });

  return overlayGroup;
};

// Init AR
const initAR = async () => {
  const { mindUrl, videoUrl, thumbnailUrl, customerName } = await fetchAssets();
  document.title = customerName || "AR Experience";

  const mindarThree = new MindARThree({
    container: document.querySelector("#container"),
    imageTargetSrc: mindUrl,
  });

  const { renderer, scene, camera } = mindarThree;
  const anchor = mindarThree.addAnchor(0);

  // Video setup
  const video = document.createElement("video");
  video.src = videoUrl;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.muted = true; // must start muted
  video.preload = "auto";

  const videoTexture = new THREE.VideoTexture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.generateMipmaps = false;

  video.addEventListener("loadedmetadata", () => {
    const aspect = video.videoHeight / video.videoWidth;
    const geometry = new THREE.PlaneGeometry(1, aspect);
    const material = new THREE.MeshBasicMaterial({ map: videoTexture });
    const plane = new THREE.Mesh(geometry, material);
    anchor.group.add(plane);

    // Only iOS → show overlay
    if (isIOS()) {
      if (thumbnailUrl) {
        new THREE.TextureLoader().load(
          thumbnailUrl,
          (thumbTex) => {
            const thumbMat = new THREE.MeshBasicMaterial({ map: thumbTex });
            makeOverlay(geometry, anchor, renderer, camera, video, thumbMat);
          },
          undefined,
          () => {
            const fallbackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            makeOverlay(geometry, anchor, renderer, camera, video, fallbackMat);
          }
        );
      } else {
        const fallbackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        makeOverlay(geometry, anchor, renderer, camera, video, fallbackMat);
      }
    }

    // Target events
    anchor.onTargetFound = () => {
      if (!isIOS()) {
        video.muted = false; // safe on desktop/Android
        video.play().catch((err) => console.log("Play blocked:", err));
      }
    };
    anchor.onTargetLost = () => video.pause();
  });

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

// Start
window.addEventListener("load", () => {
  initAR().catch((err) => {
    document.querySelector("#loader").innerText = "Initialization failed";
    console.error("Initialization failed:", err);
  });
});
