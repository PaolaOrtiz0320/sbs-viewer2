import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { VRButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/VRButton.js';

/* ---------- DOM ---------- */
const canvas   = document.getElementById('app');
const swapBtn  = document.getElementById('swapBtn');
const centerBtn= document.getElementById('centerBtn');

const fileL = document.getElementById('fileL');
const fileR = document.getElementById('fileR');
const btnL  = document.getElementById('btnL');
const btnR  = document.getElementById('btnR');
const dropL = document.getElementById('dropL');
const dropR = document.getElementById('dropR');
const thumbL= document.getElementById('thumbL');
const thumbR= document.getElementById('thumbR');

const size = document.getElementById('size');
const dist = document.getElementById('dist');
const lx = document.getElementById('lx');
const ly = document.getElementById('ly');
const lr = document.getElementById('lr');
const rx = document.getElementById('rx');
const ry = document.getElementById('ry');
const rr = document.getElementById('rr');

/* ---------- Three / WebXR ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e24);
scene.add(new THREE.AmbientLight(0xffffff, 0.85));

const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
scene.add(camera);

const group = new THREE.Group();
scene.add(group);

const LAYER_LEFT  = 1;
const LAYER_RIGHT = 2;
camera.layers.enable(LAYER_LEFT);
camera.layers.enable(LAYER_RIGHT);

let meshL, meshR, texL, texR;
const loader = new THREE.TextureLoader();

let state = {
  width: parseFloat(size.value),
  distance: parseFloat(dist.value),
  L: { x:0, y:0, r:0 },
  R: { x:0, y:0, r:0 },
  swapped:false
};

// Posicionamiento
let lockToHead = false;     // false = anclado al mundo
const globalYOffset  = 0.12;
const globalTiltXdeg = 0.0;
let globalXOffset    = 0.00; // mueve panel izq/der si te queda cargado a un lado
let placedOnce = false;

/* ---------- Crear paneles ---------- */
function createPlanes() {
  const w = state.width, h = w * 0.75;
  const geo = new THREE.PlaneGeometry(w, h);

  meshL = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texL, toneMapped:false, side:THREE.DoubleSide }));
  meshL.layers.set(LAYER_LEFT);
  group.add(meshL);

  meshR = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texR, toneMapped:false, side:THREE.DoubleSide }));
  meshR.layers.set(LAYER_RIGHT);
  group.add(meshR);

  updateAspectFromTextures();
}

function updateAspectFromTextures() {
  if (!meshL || !texL?.image) return;
  const imgW = texL.image.naturalWidth  || texL.image.width  || 1920;
  const imgH = texL.image.naturalHeight || texL.image.height || 1080;
  const targetW = state.width;
  const targetH = targetW * (imgH / imgW);
  const newGeo = new THREE.PlaneGeometry(targetW, targetH);
  meshL.geometry.dispose(); meshR.geometry.dispose();
  meshL.geometry = newGeo.clone(); meshR.geometry = newGeo.clone();
}

function applyPerEyeTransforms() {
  const r = Math.PI/180;
  if (meshL) { meshL.position.set(state.L.x, state.L.y, meshL.position.z); meshL.rotation.set(0,0,state.L.r*r); }
  if (meshR) { meshR.position.set(state.R.x, state.R.y, meshR.position.z); meshR.rotation.set(0,0,state.R.r*r); }
}

// Vista 2D fuera de VR
function applyPreviewSBS2D() {
  const dx = state.width * 0.55;
  if (meshL) meshL.position.set(-dx + state.L.x, 0 + state.L.y, -state.distance);
  if (meshR) meshR.position.set( dx + state.R.x, 0 + state.R.y, -state.distance);
}

const fwd   = new THREE.Vector3();
const right = new THREE.Vector3();

function placePanelInFront(xrCam) {
  fwd.set(0,0,-1).applyQuaternion(xrCam.quaternion).normalize();
  group.position.copy(xrCam.position).addScaledVector(fwd, state.distance);

  right.set(1,0,0).applyQuaternion(xrCam.quaternion).normalize();
  group.position.addScaledVector(right, globalXOffset);

  group.lookAt(xrCam.position);
  group.position.y += globalYOffset;
  group.rotateX(THREE.MathUtils.degToRad(globalTiltXdeg));
  if (meshL) meshL.position.z = 0;
  if (meshR) meshR.position.z = 0;
  placedOnce = true;
}

/* ---------- WebXR por ojo ---------- */
renderer.xr.addEventListener('sessionstart', () => {
  const xrCam = renderer.xr.getCamera();
  const L = xrCam.cameras?.[0], R = xrCam.cameras?.[1];
  if (L && R) {
    L.layers.enable(LAYER_LEFT);  L.layers.disable(LAYER_RIGHT);
    R.layers.enable(LAYER_RIGHT); R.layers.disable(LAYER_LEFT);
  }
  placedOnce = false;

  const session = renderer.xr.getSession?.();
  if (session) session.addEventListener('select', () => placePanelInFront(renderer.xr.getCamera()));
});

/* ---------- Carga desde archivos locales ---------- */
function fileToObjectURL(file) {
  return URL.createObjectURL(file); // Recuerda revocarlo luego
}

async function setTexturesFromFiles(fileLeft, fileRight) {
  const urlL = fileToObjectURL(fileLeft);
  const urlR = fileToObjectURL(fileRight);
  try {
    const [tL, tR] = await Promise.all([
      new Promise((res, rej)=> loader.load(urlL, res, undefined, rej)),
      new Promise((res, rej)=> loader.load(urlR, res, undefined, rej)),
    ]);
    [tL, tR].forEach(t=>{ t.colorSpace=THREE.SRGBColorSpace; t.minFilter=THREE.LinearFilter; t.generateMipmaps=false; });
    texL = tL; texR = tR;

    if (!meshL || !meshR) createPlanes();
    meshL.material.map = texL; meshR.material.map = texR;
    meshL.material.needsUpdate = meshR.material.needsUpdate = true;
    updateAspectFromTextures();
    applyPerEyeTransforms();
  } finally {
    URL.revokeObjectURL(urlL);
    URL.revokeObjectURL(urlR);
  }
}

/* ---------- Uploader UX ---------- */
function setupDropZone(dropEl, inputEl, onFile) {
  inputEl.addEventListener('change', (e)=>{
    if (e.target.files?.[0]) onFile(e.target.files[0]);
  });
  dropEl.addEventListener('dragover', (e)=>{ e.preventDefault(); dropEl.classList.add('drag'); });
  dropEl.addEventListener('dragleave', ()=> dropEl.classList.remove('drag'));
  dropEl.addEventListener('drop', (e)=>{
    e.preventDefault(); dropEl.classList.remove('drag');
    const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
  });
}

let tempLeftFile = null;
let tempRightFile = null;

setupDropZone(dropL, fileL, (f)=>{
  tempLeftFile = f;
  const url = URL.createObjectURL(f);
  thumbL.src = url; thumbL.style.display='block';
});
setupDropZone(dropR, fileR, (f)=>{
  tempRightFile = f;
  const url = URL.createObjectURL(f);
  thumbR.src = url; thumbR.style.display='block';
});
btnL.addEventListener('click', ()=> fileL.click());
btnR.addEventListener('click', ()=> fileR.click());

// Cuando ya tengas ambos, crea las texturas
function tryLoadBoth() {
  if (tempLeftFile && tempRightFile) {
    setTexturesFromFiles(tempLeftFile, tempRightFile);
  }
}
fileL.addEventListener('change', tryLoadBoth);
fileR.addEventListener('change', tryLoadBoth);
dropL.addEventListener('drop', tryLoadBoth);
dropR.addEventListener('drop', tryLoadBoth);

/* ---------- UI controles ---------- */
swapBtn.addEventListener('click', ()=>{
  state.swapped = !state.swapped;
  if (!meshL || !meshR) return;
  meshL.layers.set(state.swapped ? LAYER_RIGHT : LAYER_LEFT);
  meshR.layers.set(state.swapped ? LAYER_LEFT  : LAYER_RIGHT);
});
centerBtn.addEventListener('click', ()=> { placedOnce = false; });

size.addEventListener('input', e=>{ state.width = +e.target.value; updateAspectFromTextures(); placedOnce=false; });
dist.addEventListener('input', e=>{ state.distance = +e.target.value; placedOnce=false; });

[lx,ly,lr,rx,ry,rr].forEach(el => el.addEventListener('input', applyPerEyeTransforms));

window.addEventListener('keydown', (e)=>{
  const k = e.key.toLowerCase();
  if (k === 'r') { placedOnce = false; } // recentrar
  if (k === ',') { globalXOffset -= 0.02; placedOnce=false; }
  if (k === '.') { globalXOffset += 0.02; placedOnce=false; }
});

window.addEventListener('resize', ()=>{
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});

/* ---------- Render loop ---------- */
function resizeRendererToDisplaySize() {
  const w = canvas.clientWidth | 0, h = canvas.clientHeight | 0;
  if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
  camera.aspect = (w && h) ? (w/h) : 1; camera.updateProjectionMatrix();
}

renderer.setAnimationLoop(()=>{
  resizeRendererToDisplaySize();

  if (meshL && meshR) {
    if (renderer.xr.isPresenting) {
      const xrCam = renderer.xr.getCamera();
      if (lockToHead) {
        // Seguir cabeza
        const v = new THREE.Vector3(0,0,-1).applyQuaternion(xrCam.quaternion).normalize();
        const r = new THREE.Vector3(1,0,0).applyQuaternion(xrCam.quaternion).normalize();
        group.position.copy(xrCam.position).addScaledVector(v, state.distance);
        group.position.addScaledVector(r, globalXOffset);
        group.quaternion.copy(xrCam.quaternion);
        group.position.y += globalYOffset;
        group.rotateX(THREE.MathUtils.degToRad(globalTiltXdeg));
        meshL.position.z = 0; meshR.position.z = 0;
      } else {
        // Anclado al mundo (coloca una sola vez)
        if (!placedOnce) placePanelInFront(xrCam);
      }
    } else {
      // Vista SBS 2D
      applyPreviewSBS2D();
      group.position.set(0,0,0);
      group.rotation.set(0,0,0);
      placedOnce = false;
    }
    applyPerEyeTransforms();
  }

  renderer.render(scene, camera);
});
