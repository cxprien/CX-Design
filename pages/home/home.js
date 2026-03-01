import Fuse from 'fuse.js';
// 1. MENU LOGIC 
const menuBtn = document.getElementById('menuBtn');
const closeBtn = document.getElementById('closeBtn');
const bd = document.getElementById('menuBackdrop');
const body = document.body;

function toggleMenu(show) {
    if(show) body.classList.add('menu-active');
    else body.classList.remove('menu-active');
}
if (menuBtn) menuBtn.onclick = () => toggleMenu(true);
if (closeBtn) closeBtn.onclick = () => toggleMenu(false);
if (bd) bd.onclick = () => toggleMenu(false);

async function buildMenu() {
    const menuList = document.getElementById('menuList');
    const searchInput = document.getElementById('menuSearch');
    
    // SAFETY CHECK: If there is no menu list on this page, stop running.
    if (!menuList) return; 
    
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

        function updateFuseIndex() {
            const searchData = allPages.map(page => {
                const data = page.contentData;
                let bodyText = "";
                let altText = "";
                
                if (data && data.rows) {
                    bodyText = data.rows.map(r => r.text || "").join(" ");
                    altText = data.rows.map(r => r.mediaAlt || "").join(" ");
                }

                return {
                    originalPage: page,
                    title: page.title,
                    internalTitle: page.internalTitle,
                    date: data ? data.date : "",
                    bodyText: bodyText,
                    altText: altText
                };
            });

            const fuseOptions = {
                includeScore: true,
                threshold: 0.3, 
                ignoreLocation: true, 
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

        updateFuseIndex();

        function render(filterText = '') {
            if (!menuList) return; // Extra safety check restored
            menuList.innerHTML = '';
            const search = filterText.trim();
            
            let displayPages = [];

            if (search.length === 0) {
                displayPages = allPages;
            } else {
                const results = fuse.search(search);
                displayPages = results.map(result => result.item.originalPage);
            }

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
        
        // SAFETY CHECK RESTORED: Only add event listener if search box exists
        if (searchInput) {
            searchInput.addEventListener('input', (e) => render(e.target.value));
        }

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
            updateFuseIndex();
            // SAFETY CHECK RESTORED
            if (searchInput && searchInput.value.trim() !== '') {
                render(searchInput.value);
            }
        });

    } catch (err) {
        console.error("Menu Error:", err);
        if (menuList) {
            menuList.innerHTML = '<div style="color:#666; font-size:2vmin;">Error loading pages.</div>';
        }
    }
}
buildMenu();

// 2. SLIDESHOW LOGIC
const slideTrack = document.getElementById('slide-track');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
let slidesData = [];
let currentSlideIndex = 0;
let domPanels = [];
let fallbackAutoAdvanceTimer = null;

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function initSlideshow() {
    try {
        const response = await fetch('../../commons/pagelist.json');
        const rawData = await response.json();
        
        slidesData = rawData.filter(page => {
            const t = page.title.toLowerCase();
            return t !== 'home' && t !== 'contact';
        });

        slidesData = shuffleArray(slidesData);

        if (slidesData.length === 0 || !slideTrack) return;

        slidesData.forEach((page) => {
            // Use segments to find the folder name
            const pathSegments = page.url.split('/')
            const targetFolder = pathSegments[pathSegments.length - 1];
            const videoSrc = `videos/${targetFolder}.webm`;

            const pageLink = `../../${page.url}`;

            const panel = document.createElement('div');
            panel.className = 'glass-panel';
            
            // REDIRECT LOGIC: Only trigger if the panel is currently active
            panel.onclick = (e) => {
                if (panel.classList.contains('active')) {
                    window.location.href = pageLink;
                }
            };

            const video = document.createElement('video');
            video.className = 'slide-video';
            video.src = videoSrc;
            video.muted = true;
            video.playsInline = true;
            
            const mediaObj = { panel, media: video, isVideo: true };
            
            video.onerror = () => {
                const fallbackBox = document.createElement('div');
                fallbackBox.className = 'slide-video fallback-image';
                fallbackBox.innerHTML = 'PREVIEW<br>UNAVAILABLE';
                panel.replaceChild(fallbackBox, video);
                mediaObj.media = fallbackBox;
                mediaObj.isVideo = false;
                if (currentSlideIndex === domPanels.indexOf(mediaObj)) startFallbackTimer();
            };

            video.addEventListener('ended', () => goToSlide(currentSlideIndex + 1));

            const title = document.createElement('div');
            title.className = 'slide-title';
            title.textContent = page.title;

            panel.appendChild(video);
            panel.appendChild(title);
            slideTrack.appendChild(panel);
            domPanels.push(mediaObj);
        });

        updateSlides(0);
        setupTouch();

    } catch (err) {
        console.error("Failed to load slideshow data:", err);
    }
}

function startFallbackTimer() {
    clearTimeout(fallbackAutoAdvanceTimer);
    fallbackAutoAdvanceTimer = setTimeout(() => goToSlide(currentSlideIndex + 1), 4000);
}

function updateSlides(newIndex) {
    if (domPanels.length === 0) return;
    const total = domPanels.length;

    if (newIndex < 0) newIndex = total - 1;
    if (newIndex >= total) newIndex = 0;

    currentSlideIndex = newIndex;
    clearTimeout(fallbackAutoAdvanceTimer); 

    domPanels.forEach((obj, idx) => {
        obj.panel.className = 'glass-panel';
        obj.panel.style.cursor = 'default';
        
        if (idx !== currentSlideIndex && obj.isVideo) {
            obj.media.pause();
            obj.media.currentTime = 0; 
        }

        let offset = idx - currentSlideIndex;
        if (offset < -Math.floor(total / 2)) offset += total;
        if (offset > Math.floor(total / 2)) offset -= total;

        if (offset === 0) {
            obj.panel.classList.add('active');
            obj.panel.style.cursor = 'pointer';
            if (obj.isVideo) {
                obj.media.play().catch(e => console.log("Blocked", e));
            } else {
                startFallbackTimer();
            }
        } else if (offset >= -3 && offset <= -1) {
            obj.panel.classList.add(`prev-${Math.abs(offset)}`);
        } else if (offset >= 1 && offset <= 3) {
            obj.panel.classList.add(`next-${offset}`);
        } else {
            obj.panel.style.display = 'none'; 
        }

        if (offset >= -3 && offset <= 3) obj.panel.style.display = 'flex';
    });
}

function goToSlide(index) {
    updateSlides(index);
}

if(prevBtn) prevBtn.onclick = () => goToSlide(currentSlideIndex - 1);
if(nextBtn) nextBtn.onclick = () => goToSlide(currentSlideIndex + 1);

// SCOPED TOUCH LOGIC: Only listens to the slide track to avoid breaking the menu
function setupTouch() {
    let touchStartX = 0;
    let touchEndX = 0;

    slideTrack.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, {passive: true});

    slideTrack.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        const threshold = 50; 
        if (touchEndX < touchStartX - threshold) goToSlide(currentSlideIndex + 1);
        if (touchEndX > touchStartX + threshold) goToSlide(currentSlideIndex - 1);
    }, {passive: true});
}

initSlideshow();

// 3. SET DATE IN BANNER
const dateDisplay = document.getElementById('dateDisplay');
if (dateDisplay) {
    const d = new Date();
    dateDisplay.textContent = d.toLocaleDateString();
}

//banner's contact
const bannerContactBtn = document.getElementById('bannerContactBtn');
if (bannerContactBtn) {
    bannerContactBtn.onclick = () => {
        window.location.href = '../../pages/contact/';
    };
}