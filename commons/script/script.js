import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Fuse from 'fuse.js';

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

    // NEW: Detect first loop completion to reveal UI
    let hasLoopedOnce = false;
    mixer.addEventListener('loop', () => {
        if (!hasLoopedOnce) {
            hasLoopedOnce = true;
            const toggleContainer = document.getElementById('interactToggleContainer');
            if(toggleContainer) toggleContainer.classList.remove('hidden');
        }
    });

    handleResize(); 
});

const clock = new THREE.Clock();

// NEW: OrbitControls Initialization
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false; // Off by default
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false;

//Zoom buttons logic
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');

function smoothZoom(scale) {
    const distance = camera.position.distanceTo(controls.target);
    const newDistance = distance * scale;
    
    // Safety limits for zoom (adjust these values as needed)
    if (newDistance < 2 || newDistance > 20) return;

    const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(direction, newDistance);
    controls.update();
}

zoomInBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent clicks from triggering scene events
    smoothZoom(0.8); // Scale down distance by 20%
};

zoomOutBtn.onclick = (e) => {
    e.stopPropagation();
    smoothZoom(1.2); // Scale up distance by 20%
};


// NEW: Hide hand icon once user starts interacting
controls.addEventListener('start', () => {
    const handOverlay = document.getElementById('handOverlay');
    if (handOverlay && !handOverlay.classList.contains('hidden')) {
        handOverlay.classList.add('hidden');
    }
});

// NEW: UI Toggle Logic
const interactToggleCb = document.getElementById('interactToggleCb');
const handOverlay = document.getElementById('handOverlay');
const zoomControls = document.querySelector('.zoom-controls'); // Select the div containing zoom buttons to make them appear whne in interact mode

if (interactToggleCb) {
    interactToggleCb.addEventListener('change', (e) => {
        if (e.target.checked) {
            // Interact mode ON
            controls.enabled = true;
            container.style.pointerEvents = 'auto'; // allow mouse/touch events on canvas
            if (zoomControls) zoomControls.classList.remove('hidden');
            if (handOverlay) handOverlay.classList.remove('hidden');
            if (mixer) mixer.timeScale = 0; // pause animation
        } else {
            // Animation mode ON (Interact OFF)
            controls.enabled = false;
            container.style.pointerEvents = 'none'; // reset to allow page scrolling
            if (zoomControls) zoomControls.classList.add('hidden');
            if (handOverlay) handOverlay.classList.add('hidden');
            
            // Revert Camera to Default
            camera.position.set(8, -0.5, 0);
            controls.target.set(0, -0.5, 0); // Need to sync controls target
            
            if (mixer) mixer.timeScale = 1; // resume looping animation
        }
    });
}
const fpsthreshold = 50; // FPS threshold to trigger resolution drop
function animate() {
    requestAnimationFrame(animate);
    
    // DYNAMIC RESOLUTION LOGIC
    frames++;
    const time = performance.now();
    if (time >= lastTime + 1000) {
        const fps = (frames * 1000) / (time - lastTime);
        
        if (fps < fpsthreshold && currentPixelRatio > minPixelRatio) {
            // Drop resolution if below 30 FPS
            currentPixelRatio = Math.max(minPixelRatio, currentPixelRatio - 0.1);
            renderer.setPixelRatio(currentPixelRatio);
        } else if (fps >= fpsthreshold && currentPixelRatio < maxPixelRatio) {
            // Ramp up if above 35 FPS (buffer prevents jitter)
            currentPixelRatio = Math.min(maxPixelRatio, currentPixelRatio + 0.1);
            renderer.setPixelRatio(currentPixelRatio);
        }
        
        frames = 0;
        lastTime = time;
    }

    if (mixer) mixer.update(clock.getDelta());
    controls.update(); // NEW: Must update controls every frame for damping/resets
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

//banner's contact
const bannerContactBtn = document.getElementById('bannerContactBtn');
if (bannerContactBtn) {
    bannerContactBtn.onclick = () => {
        window.location.href = '../../pages/contact/';
    };
}
  
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

// 5. Build Search Menu
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
            const pagename = page.url.split('/').pop();
            const adjustedUrl = "../../" + page.url;
            
            const pageObj = { 
                title: page.title, 
                internalTitle: pagename,
                url: adjustedUrl, 
                pinned: false,
                contentData: null 
            };

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

        // Global fuse instance
        let fuse = null;

        // Initializes or updates the Fuse.js index
        function updateFuseIndex() {
            // Flatten the data so Fuse can easily read it without deep nesting checks
            const searchData = allPages.map(page => {
                const data = page.contentData;
                let bodyText = "";
                let altText = "";
                
                if (data && data.rows) {
                    bodyText = data.rows.map(r => r.text || "").join(" ");
                    altText = data.rows.map(r => r.mediaAlt || "").join(" ");
                }

                return {
                    originalPage: page, // Keep a reference to render the UI later
                    title: page.title,
                    internalTitle: page.internalTitle,
                    date: data ? data.date : "",
                    bodyText: bodyText,
                    altText: altText
                };
            });

            // Fuse Configuration
            const fuseOptions = {
                includeScore: true,
                threshold: 0.3, // 0.0 is exact match, 1.0 matches anything. 0.3 allows minor typos.
                ignoreLocation: true, // Finds the word no matter where it is in the text
                keys: [
                    { name: 'title', weight: 3.0 },
                    { name: 'internalTitle', weight: 2.0 },
                    { name: 'date', weight: 1.5 },
                    { name: 'altText', weight: 1.0 },
                    { name: 'bodyText', weight: 0.5 }
                ]
            };

            fuse = new Fuse(searchData, fuseOptions);
        }

        // Initialize empty index right away
        updateFuseIndex();

        function render(filterText = '') {
            menuList.innerHTML = '';
            const search = filterText.trim();
            
            let displayPages = [];

            if (search.length === 0) {
                // Empty search: show all pages in default order
                displayPages = allPages;
            } else {
                // Run Fuse.js search
                const results = fuse.search(search);
                // Extract the original page objects from the results
                displayPages = results.map(result => result.item.originalPage);
            }

            // Render DOM
            displayPages.forEach(page => {
                const a = document.createElement('a');
                a.className = 'menu-item';
                if(page.pinned) a.classList.add('menu-item-pinned');
                a.href = page.url;
                a.textContent = page.title;
                menuList.appendChild(a);
            });
        }

        render();
        searchInput.addEventListener('input', (e) => render(e.target.value));

        // Background fetch inner content
        Promise.all(allPages.map(async (page) => {
            try {
                if (page.internalTitle === 'home' || page.internalTitle === 'contact') return;
                
                const jsonPath = `${page.url}/text/${page.internalTitle}.json`;
                const res = await fetch(jsonPath);
                if (res.ok) {
                    page.contentData = await res.json();
                }
            } catch (e) {
                // Silently skip missing JSONs
            }
        })).then(() => {
            // Once all JSONs are loaded, rebuild the Fuse index to include body text
            updateFuseIndex();
            // Re-render if the user typed something while it was loading
            if (searchInput.value.trim() !== '') {
                render(searchInput.value);
            }
        });

    } catch (err) {
        console.error("Menu Error:", err);
        menuList.innerHTML = '<div style="color:#666; font-size:2vmin;">Error loading pages.</div>';
    }
}
buildMenu();