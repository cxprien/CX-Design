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
            if (!menuList) return; 
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
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => render(e.target.value));
        }

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

// 2. SET DATE IN BANNER
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