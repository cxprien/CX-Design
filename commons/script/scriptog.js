import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// 1. SETUP
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(8, -0.5, 0);
camera.lookAt(0, -0.5, 0);

// PERFORMANCE SCALING VARIABLES
let lastTime = performance.now();
let frames = 0;
const minPixelRatio = 0.5; // Lower bound for low-tier hardware
const maxPixelRatio = window.devicePixelRatio; 
let currentPixelRatio = maxPixelRatio;

const renderer = new THREE.WebGLRenderer({ 
    alpha: true, 
    antialias: true,
    powerPreference: "high-performance" // Optimizes for dedicated GPU if available
});
renderer.setPixelRatio(currentPixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

new RGBELoader()
.setPath('../../commons/textures/')
.load('monochrome_studio_02_1k.hdr', function (hdrTexture) {
    const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
    scene.environment = envMap;
    hdrTexture.dispose();
    pmremGenerator.dispose();
});

scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const sun = new THREE.DirectionalLight(0xffffee, 5);
sun.position.set(5, 10, 7);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.bias = -0.0001;
sun.shadow.normalBias = 0.02;
scene.add(sun);

let mixer;

const modelPath = container.dataset.model;//loads the filepath from index.html
const loader = new GLTFLoader();
loader.load(modelPath, (gltf) => {
    const model = gltf.scene;
    model.traverse(n => { if(n.isMesh) { n.castShadow = true; n.receiveShadow = true; }});
    scene.add(model);
    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach(c => mixer.clipAction(c).play());
    handleResize(); 
});

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    // DYNAMIC RESOLUTION LOGIC
    frames++;
    const time = performance.now();
    if (time >= lastTime + 1000) {
        const fps = (frames * 1000) / (time - lastTime);
        
        if (fps < 30 && currentPixelRatio > minPixelRatio) {
            // Drop resolution if below 30 FPS
            currentPixelRatio = Math.max(minPixelRatio, currentPixelRatio - 0.1);
            renderer.setPixelRatio(currentPixelRatio);
        } else if (fps > 35 && currentPixelRatio < maxPixelRatio) {
            // Ramp up if above 35 FPS (buffer prevents jitter)
            currentPixelRatio = Math.min(maxPixelRatio, currentPixelRatio + 0.1);
            renderer.setPixelRatio(currentPixelRatio);
        }
        
        frames = 0;
        lastTime = time;
    }

    if (mixer) mixer.update(clock.getDelta());
    renderer.render(scene, camera);
}
animate();

// 2. RESIZE
function handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;

    renderer.setSize(w, h);
    camera.aspect = aspect;

    if (aspect < 1) {
        camera.zoom = aspect; 
    } else {
        camera.zoom = 1;
    }
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', handleResize);
handleResize();

// 3. SCROLL / BANNER LOGIC
const banner = document.getElementById('bottomBanner');

function checkScroll() {
    const scrollY = window.scrollY;
    const winHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;

    const isTop = scrollY === 0;
    const isBottom = (scrollY + winHeight) >= docHeight;

    if (isTop || isBottom) {
        banner.classList.remove('banner-hidden');
    } else {
        banner.classList.add('banner-hidden');
    }
}

window.addEventListener('scroll', checkScroll);

// 4. UI
const menuBtn = document.getElementById('menuBtn');
const closeBtn = document.getElementById('closeBtn');
const bd = document.getElementById('menuBackdrop');
const body = document.body;

function toggleMenu(show) {
    if(show) body.classList.add('menu-active');
    else body.classList.remove('menu-active');
}
menuBtn.onclick = () => toggleMenu(true);
closeBtn.onclick = () => toggleMenu(false);
bd.onclick = () => toggleMenu(false);
  
async function loadContentRows() {
    const scrollArea = document.querySelector('.content-scroll-area');
    const pageTitle = document.querySelector('.page-title');
    const dateDisplay = document.getElementById('dateDisplay');
    const jsonPath = scrollArea.dataset.json;
    scrollArea.innerHTML = ''; 

    try {
        const response = await fetch(jsonPath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.pageTitle) {
            document.title = data.pageTitle;
            pageTitle.textContent = data.pageTitle;
        }

        if (data.date) {
            dateDisplay.textContent = data.date;
        }

        data.rows.forEach(item => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'content-row';

            const mediaDiv = document.createElement('div');
            mediaDiv.className = 'content-media'; 
            
            const src = item.mediaSrc;
            const isVideo = src.match(/\.(mp4|webm|ogg|mov)$/i);
            let mediaElement;

            if (isVideo) {
                mediaElement = document.createElement('video');
                mediaElement.src = src;
                mediaElement.autoplay = true;
                mediaElement.loop = true;
                mediaElement.muted = true;
                mediaElement.playsInline = true;
            } else {
                mediaElement = document.createElement('img');
                mediaElement.src = src;
                mediaElement.alt = item.mediaAlt || "";
            }
            
            mediaDiv.appendChild(mediaElement);

            const textDiv = document.createElement('div');
            textDiv.className = 'content-text';
            textDiv.textContent = item.text;

            rowDiv.appendChild(mediaDiv);
            rowDiv.appendChild(textDiv);

            scrollArea.appendChild(rowDiv);
        });
    } catch (error) {
        console.error('Could not load content:', error);
    }
}
loadContentRows();

// 5. Build Menu
async function buildMenu() {
    const menuList = document.getElementById('menuList');
    const searchInput = document.getElementById('menuSearch');
    
    try {
        const response = await fetch('../../commons/pagelist.json');
        if(!response.ok) throw new Error("Could not find pagelist.json");
        
        const rawData = await response.json();
        let homePage = null;
        let contactPage = null;
        let otherPages = [];

        rawData.forEach(page => {
            const t = page.title.toLowerCase();
            const adjustedUrl = "../../" + page.url;
            const pageObj = { title: page.title, url: adjustedUrl, pinned: false };

            if (t === 'home') {
                pageObj.pinned = true;
                homePage = pageObj;
            } else if (t === 'contact') {
                pageObj.pinned = true;
                contactPage = pageObj;
            } else {
                otherPages.push(pageObj);
            }
        });

        otherPages.sort((a, b) => a.title.localeCompare(b.title));
        const allPages = [];
        if (homePage) allPages.push(homePage);
        if (contactPage) allPages.push(contactPage);
        allPages.push(...otherPages);

        function render(filterText = '') {
            menuList.innerHTML = '';
            const search = filterText.toLowerCase();
            allPages.forEach(page => {
                if (page.title.toLowerCase().includes(search)) {
                    const a = document.createElement('a');
                    a.className = 'menu-item';
                    if(page.pinned) a.classList.add('menu-item-pinned');
                    a.href = page.url;
                    a.textContent = page.title;
                    menuList.appendChild(a);
                }
            });
        }

        render();
        searchInput.addEventListener('input', (e) => render(e.target.value));
    } catch (err) {
        console.error("Menu Error:", err);
        menuList.innerHTML = '<div style="color:#666; font-size:2vmin;">Error loading pages.</div>';
    }
}
buildMenu();