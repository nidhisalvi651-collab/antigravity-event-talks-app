// App State
let allReleases = [];
let activeCategory = 'all';
let searchQuery = '';
let currentSelectedUpdate = null; // Holds the currently editing update for tweet composition

// DOM Elements
const btnRefresh = document.getElementById('btn-refresh');
const spinnerRefresh = document.getElementById('spinner-refresh');
const lastUpdatedText = document.getElementById('last-updated-text');
const searchInput = document.getElementById('search-input');
const filterPillsContainer = document.getElementById('filter-pills-container');
const feedContent = document.getElementById('feed-content');
const feedLoader = document.getElementById('feed-loader');
const emptyState = document.getElementById('empty-state');
const btnClearFilters = document.getElementById('btn-clear-filters');
const btnExportCsv = document.getElementById('btn-export-csv');
const themeToggle = document.getElementById('theme-toggle');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statFeatures = document.getElementById('stat-features');

// Modal Elements
const tweetModal = document.getElementById('tweet-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCounter = document.getElementById('char-counter');
const charProgressBar = document.getElementById('char-progress-bar');
const btnSimulateTweet = document.getElementById('btn-simulate-tweet');
const btnSubmitTweet = document.getElementById('btn-submit-tweet');
const spinnerSimulate = document.getElementById('spinner-simulate');
const hashtagPills = document.querySelectorAll('.hashtag-pill');

// Init application on load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchReleases();
    setupEventListeners();
});

// Setup Event Handlers
function setupEventListeners() {
    // Refresh action
    btnRefresh.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Search action
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderTimeline();
    });

    // Category filter action
    filterPillsContainer.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;

        // Update active class
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        activeCategory = pill.dataset.type;
        renderTimeline();
    });

    // Clear filters empty state
    btnClearFilters.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        document.getElementById('pill-all').classList.add('active');
        activeCategory = 'all';
        renderTimeline();
    });

    // Modal close handlers
    btnCloseModal.addEventListener('click', closeModal);
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) closeModal();
    });

    // Textarea input character count sync
    tweetTextarea.addEventListener('input', () => {
        updateCharCount();
    });

    // Hashtag toggles
    hashtagPills.forEach(pill => {
        pill.addEventListener('click', () => {
            pill.classList.toggle('active');
            recomposeTweetText();
        });
    });

    // Share buttons inside modal
    btnSubmitTweet.addEventListener('click', launchTwitterWebIntent);
    btnSimulateTweet.addEventListener('click', runSimulatedTweet);

    // Export CSV action
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', exportToCSV);
    }

    // Theme toggle action
    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.add('light-mode');
                localStorage.setItem('theme', 'light');
                showToast('Switched to Light Mode', 'success');
            } else {
                document.body.classList.remove('light-mode');
                localStorage.setItem('theme', 'dark');
                showToast('Switched to Dark Mode', 'success');
            }
        });
    }
}

// Fetch Release Notes from API
async function fetchReleases(forceRefresh = false) {
    showLoader();
    try {
        const url = forceRefresh ? '/api/releases?refresh=true' : '/api/releases';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Server returned code ${response.status}`);
        }
        const data = await response.json();
        
        allReleases = data.releases || [];
        
        // Update last updated info
        if (data.last_fetched) {
            const date = new Date(data.last_fetched * 1000);
            lastUpdatedText.textContent = `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${date.toLocaleDateString()})`;
        }
        
        if (forceRefresh) {
            showToast('Feed refreshed successfully!', 'success');
        }

        renderFilterPills();
        renderTimeline();
    } catch (err) {
        console.error('Error fetching release notes:', err);
        showToast(`Error: ${err.message}`, 'error');
        if (allReleases.length === 0) {
            feedContent.innerHTML = `<div class="empty-state-container"><h3>Failed to load</h3><p>${err.message}</p></div>`;
        }
    } finally {
        hideLoader();
    }
}

// Show/Hide main loaders
function showLoader() {
    feedLoader.classList.remove('hidden');
    spinnerRefresh.classList.remove('hidden');
    btnRefresh.disabled = true;
}

function hideLoader() {
    feedLoader.classList.add('hidden');
    spinnerRefresh.classList.add('hidden');
    btnRefresh.disabled = false;
}

// Render release entries chronologically
function renderTimeline() {
    // 1. Filter releases local to user selections
    let filteredCount = 0;
    let totalCount = 0;
    let featureCount = 0;

    const processedReleases = allReleases.map(entry => {
        const date = entry.date;
        const link = entry.link;
        const sections = entry.sections.filter(sec => {
            // Count total and features in active set
            totalCount++;
            if (sec.type.toLowerCase().includes('feature')) {
                featureCount++;
            }

            // Category Filter match
            const matchesCategory = (activeCategory === 'all' || sec.type.toLowerCase() === activeCategory.toLowerCase());
            
            // Search Query match
            const matchesSearch = !searchQuery || 
                sec.type.toLowerCase().includes(searchQuery) || 
                sec.text.toLowerCase().includes(searchQuery) ||
                date.toLowerCase().includes(searchQuery);

            return matchesCategory && matchesSearch;
        });

        filteredCount += sections.length;

        return {
            ...entry,
            sections
        };
    }).filter(entry => entry.sections.length > 0);

    // Update statistics badges
    statTotal.textContent = totalCount;
    statFeatures.textContent = featureCount;

    // Toggle Empty State
    if (processedReleases.length === 0) {
        feedContent.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    } else {
        feedContent.classList.remove('hidden');
        emptyState.classList.add('hidden');
    }

    // 2. Build DOM elements
    feedContent.innerHTML = '';
    
    processedReleases.forEach(entry => {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'timeline-date-group';

        // Header for the date
        const dateHeader = document.createElement('div');
        dateHeader.className = 'timeline-date-header';
        
        // Inline SVG Calendar Icon
        dateHeader.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-date-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span>${entry.date}</span>
            </div>
        `;
        dateGroup.appendChild(dateHeader);

        // Cards list
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'release-cards';

        entry.sections.forEach(sec => {
            const card = document.createElement('div');
            card.className = 'release-card';
            
            // Assign card CSS custom property for color styling
            const typeLower = sec.type.toLowerCase();
            let accentColor = 'var(--color-general)';
            if (typeLower.includes('feature')) accentColor = 'var(--color-feature)';
            else if (typeLower.includes('issue')) accentColor = 'var(--color-issue)';
            else if (typeLower.includes('announcement')) accentColor = 'var(--color-announcement)';
            else if (typeLower.includes('deprecation')) accentColor = 'var(--color-deprecation)';
            else if (typeLower.includes('change')) accentColor = 'var(--color-change)';
            else if (typeLower.includes('breaking')) accentColor = 'var(--color-breaking)';
            
            card.style.setProperty('--card-accent', accentColor);

            // Card Header
            const headerDiv = document.createElement('div');
            headerDiv.className = 'card-header';
            
            const badge = document.createElement('span');
            badge.className = `category-badge ${getBadgeClass(sec.type)}`;
            badge.textContent = sec.type;
            
            const cardActions = document.createElement('div');
            cardActions.className = 'card-actions';

            // Original Link Button
            const linkBtn = document.createElement('a');
            linkBtn.href = entry.link;
            linkBtn.target = '_blank';
            linkBtn.rel = 'noopener noreferrer';
            linkBtn.className = 'card-btn';
            linkBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                <span>Details</span>
            `;

            // Copy to Clipboard Button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'card-btn copy-btn-card';
            copyBtn.id = `btn-copy-${sec.id}`;
            copyBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy</span>
            `;
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(sec.text);
                    showToast('Copied to clipboard!', 'success');
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                    showToast('Failed to copy to clipboard', 'error');
                }
            });

            // Share on Twitter Button
            const shareBtn = document.createElement('button');
            shareBtn.className = 'card-btn tweet-btn-card';
            shareBtn.id = `btn-share-${sec.id}`;
            shareBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span>Tweet</span>
            `;
            shareBtn.addEventListener('click', () => {
                openTweetComposer(entry.date, sec.type, entry.link, sec.text);
            });

            cardActions.appendChild(linkBtn);
            cardActions.appendChild(copyBtn);
            cardActions.appendChild(shareBtn);
            
            headerDiv.appendChild(badge);
            headerDiv.appendChild(cardActions);
            card.appendChild(headerDiv);

            // Card Body (parsed HTML content)
            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'entry-content';
            bodyDiv.innerHTML = sec.html;
            card.appendChild(bodyDiv);

            cardsContainer.appendChild(card);
        });

        dateGroup.appendChild(cardsContainer);
        feedContent.appendChild(dateGroup);
    });
}

function getBadgeClass(type) {
    const t = type.toLowerCase();
    if (t.includes('feature')) return 'feature';
    if (t.includes('announcement')) return 'announcement';
    if (t.includes('issue')) return 'issue';
    if (t.includes('deprecation')) return 'deprecation';
    if (t.includes('change')) return 'change';
    if (t.includes('breaking')) return 'breaking';
    return 'general';
}

// Render dynamic filter pills based on categories in feed data
function renderFilterPills() {
    const counts = { all: 0 };
    
    allReleases.forEach(entry => {
        entry.sections.forEach(sec => {
            counts.all++;
            const cat = sec.type;
            counts[cat] = (counts[cat] || 0) + 1;
        });
    });
    
    filterPillsContainer.innerHTML = '';
    
    // All updates pill
    const allPill = document.createElement('button');
    allPill.id = 'pill-all';
    allPill.className = `filter-pill ${activeCategory === 'all' ? 'active' : ''}`;
    allPill.dataset.type = 'all';
    allPill.innerHTML = `
        <span>All Updates</span>
        <span class="pill-count">${counts.all}</span>
    `;
    filterPillsContainer.appendChild(allPill);
    
    // Sort categories alphabetically
    const sortedCats = Object.keys(counts).filter(k => k !== 'all').sort();
    
    sortedCats.forEach(cat => {
        const pill = document.createElement('button');
        pill.className = `filter-pill ${activeCategory.toLowerCase() === cat.toLowerCase() ? 'active' : ''}`;
        pill.dataset.type = cat;
        
        let displayName = cat;
        if (cat === 'Feature') displayName = 'Features';
        else if (cat === 'Issue') displayName = 'Issues';
        else if (cat === 'Announcement') displayName = 'Announcements';
        else if (cat === 'Deprecation') displayName = 'Deprecations';
        else if (cat === 'Change') displayName = 'Changes';
        else if (cat === 'Breaking') displayName = 'Breaking';
        else displayName = cat + 's';
        
        pill.innerHTML = `
            <span>${displayName}</span>
            <span class="pill-count">${counts[cat]}</span>
        `;
        filterPillsContainer.appendChild(pill);
    });
}

// Twitter Composer Business Logic
function openTweetComposer(date, category, link, text) {
    currentSelectedUpdate = { date, category, link, text };
    
    // Reset hashtags select
    hashtagPills.forEach(pill => {
        // Activate standard first two tags
        const tag = pill.dataset.tag;
        if (tag === '#BigQuery' || tag === '#GoogleCloud') {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });

    recomposeTweetText();
    tweetModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Lock background scroll
    tweetTextarea.focus();
}

function closeModal() {
    tweetModal.classList.add('hidden');
    document.body.style.overflow = '';
    currentSelectedUpdate = null;
}

// Compute maximum text length and build Tweet text structure safely within 280 chars
function recomposeTweetText() {
    if (!currentSelectedUpdate) return;
    
    const { date, category, link, text } = currentSelectedUpdate;
    
    // Collect active hashtags
    const activeTags = [];
    hashtagPills.forEach(pill => {
        if (pill.classList.contains('active')) {
            activeTags.push(pill.dataset.tag);
        }
    });

    // Construct constant structures
    const header = `Google Cloud BigQuery [${category}] - ${date}:\n\n`;
    const readMore = `\n\nRead more: ${link}`;
    const tagsString = activeTags.length > 0 ? `\n\n${activeTags.join(' ')}` : '';
    
    const fixedLength = header.length + readMore.length + tagsString.length;
    const maxTextBudget = 280 - fixedLength;
    
    // Normalize and collapse whitespaces and newlines in the body text for cleaner look
    let cleanedText = text
        .replace(/\s+/g, ' ')  // replace all consecutive whitespaces with a single space
        .replace(/^\s+|\s+$/g, '')
        .trim();
        
    let mainBody = cleanedText;
    if (mainBody.length > maxTextBudget) {
        mainBody = mainBody.substring(0, maxTextBudget - 3) + '...';
    }

    tweetTextarea.value = `${header}${mainBody}${readMore}${tagsString}`;
    updateCharCount();
}

function updateCharCount() {
    const text = tweetTextarea.value;
    const len = text.length;
    charCounter.textContent = `${len} / 280`;

    // Progress bar fill logic
    const percentage = Math.min((len / 280) * 100, 100);
    charProgressBar.style.width = `${percentage}%`;

    // Visual indicators for limits
    charProgressBar.classList.remove('warning', 'error');
    charCounter.classList.remove('char-danger');
    btnSubmitTweet.disabled = false;

    if (len > 280) {
        charProgressBar.classList.add('error');
        charCounter.classList.add('char-danger');
        btnSubmitTweet.disabled = true; // Block tweeting if over-limit manually edited
    } else if (len > 250) {
        charProgressBar.classList.add('warning');
    }
}

// Post via standard Twitter Web Intent
function launchTwitterWebIntent() {
    const text = tweetTextarea.value;
    if (text.length > 280) {
        showToast('Cannot tweet, message exceeds 280 character limit.', 'error');
        return;
    }
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
    
    showToast('Redirected to Twitter (X) to publish.', 'success');
    closeModal();
}

// Simulated Share Action
async function runSimulatedTweet() {
    const text = tweetTextarea.value;
    if (!text.trim()) return;

    btnSimulateTweet.disabled = true;
    spinnerSimulate.classList.remove('hidden');
    document.querySelector('.sim-btn-text').textContent = 'Posting...';

    try {
        const response = await fetch('/api/tweet/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        
        if (!response.ok) throw new Error('API simulation endpoint error');
        
        const data = await response.json();
        showToast(data.message || 'Tweet successfully simulated!', 'success');
        closeModal();
    } catch (err) {
        console.error(err);
        showToast('Failed simulated posting: ' + err.message, 'error');
    } finally {
        btnSimulateTweet.disabled = false;
        spinnerSimulate.classList.add('hidden');
        document.querySelector('.sim-btn-text').textContent = 'Simulate Post';
    }
}

// Toast Alert Helper
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Check type for icon
    const iconSvg = type === 'success' ? 
        `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-feature)" stroke-width="2" style="width:20px;height:20px;"><polyline points="20 6 9 17 4 12"></polyline></svg>` : 
        `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-deprecation)" stroke-width="2" style="width:20px;height:20px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `
        ${iconSvg}
        <div class="toast-message">${message}</div>
        <button class="toast-close">&times;</button>
    `;

    container.appendChild(toast);

    // Wire up close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });

    // Auto remove after 3.5s
    setTimeout(() => {
        toast.style.animation = 'fadeIn 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Initialize Theme based on localStorage
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeToggle = document.getElementById('theme-toggle');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.body.classList.remove('light-mode');
        if (themeToggle) themeToggle.checked = false;
    }
}

// Export current filtered releases to CSV format
function exportToCSV() {
    let filteredCount = 0;
    const csvRows = [
        ['Date', 'Category', 'Update Content', 'Link'] // CSV Headers
    ];

    allReleases.forEach(entry => {
        const date = entry.date;
        const link = entry.link;
        entry.sections.forEach(sec => {
            // Check if matches the active category filter
            const matchesCategory = (activeCategory === 'all' || sec.type.toLowerCase() === activeCategory.toLowerCase());
            
            // Check if matches the search filter
            const matchesSearch = !searchQuery || 
                sec.type.toLowerCase().includes(searchQuery) || 
                sec.text.toLowerCase().includes(searchQuery) ||
                date.toLowerCase().includes(searchQuery);

            if (matchesCategory && matchesSearch) {
                // Escape quotes and double quote encapsulate the content
                const cleanText = sec.text ? sec.text.replace(/"/g, '""').trim() : '';
                const cleanDate = date ? date.replace(/"/g, '""').trim() : '';
                const cleanType = sec.type ? sec.type.replace(/"/g, '""').trim() : '';
                const cleanLink = link ? link.replace(/"/g, '""').trim() : '';
                
                csvRows.push([cleanDate, cleanType, cleanText, cleanLink]);
                filteredCount++;
            }
        });
    });

    if (filteredCount === 0) {
        showToast('No release notes match the current filters to export.', 'error');
        return;
    }

    // Convert array to CSV format with RFC 4180 escaping
    const csvContent = csvRows.map(row => 
        row.map(val => `"${val}"`).join(',')
    ).join('\n');

    // Trigger File Download
    try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `bigquery_release_notes_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Exported ${filteredCount} release notes to CSV!`, 'success');
    } catch (err) {
        console.error('Failed to export CSV:', err);
        showToast('Failed to export CSV', 'error');
    }
}
