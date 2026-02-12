/**
 * Reviewer 2 Landing Page JavaScript
 * - OS Detection
 * - Dynamic download links from GitHub API
 * - Version fetching
 */

// GitHub repository configuration
const GITHUB_OWNER = 'YOUR_GITHUB_USERNAME'; // REPLACE with your GitHub username
const GITHUB_REPO = 'reviewer';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// OS Detection
function detectOS() {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const platform = window.navigator.platform.toLowerCase();

    if (platform.includes('win') || userAgent.includes('win')) {
        return 'windows';
    } else if (platform.includes('mac') || userAgent.includes('mac')) {
        return 'macos';
    } else if (platform.includes('linux') || userAgent.includes('linux') || userAgent.includes('x11')) {
        return 'linux';
    }

    return 'unknown';
}

// Get download URL for specific platform from release assets
function getDownloadURL(assets, platform) {
    if (!assets || assets.length === 0) {
        return null;
    }

    let filter;
    switch (platform) {
        case 'windows':
            filter = asset => asset.name.endsWith('.exe');
            break;
        case 'macos':
            filter = asset => asset.name.endsWith('.dmg');
            break;
        case 'linux':
            filter = asset => asset.name.endsWith('.AppImage');
            break;
        default:
            return null;
    }

    const asset = assets.find(filter);
    return asset ? asset.browser_download_url : null;
}

// Get all download URLs
function getAllDownloadURLs(assets) {
    return {
        windows: getDownloadURL(assets, 'windows'),
        macos: getDownloadURL(assets, 'macos'),
        linux: getDownloadURL(assets, 'linux')
    };
}

// Fetch latest release from GitHub
async function fetchLatestRelease() {
    try {
        const response = await fetch(GITHUB_API_URL);

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const release = await response.json();
        return {
            version: release.tag_name,
            assets: release.assets,
            publishedAt: new Date(release.published_at)
        };
    } catch (error) {
        console.error('Error fetching release:', error);
        return null;
    }
}

// Update version display
function updateVersionDisplay(version) {
    const versionElement = document.getElementById('latest-version');
    if (versionElement) {
        versionElement.textContent = `Latest version: ${version}`;
    }
}

// Update download buttons
function updateDownloadButtons(downloadURLs, detectedOS) {
    // Update platform-specific download buttons
    const platforms = ['windows', 'macos', 'linux'];

    platforms.forEach(platform => {
        const button = document.getElementById(`download-${platform}`);
        if (button && downloadURLs[platform]) {
            button.href = downloadURLs[platform];

            // Remove disabled state if it was set
            button.classList.remove('btn-disabled');
            button.style.pointerEvents = 'auto';
            button.style.opacity = '1';
        } else if (button) {
            // If no download URL, disable button
            button.classList.add('btn-disabled');
            button.style.pointerEvents = 'none';
            button.style.opacity = '0.5';
            button.title = 'No release available for this platform';
        }
    });

    // Update hero download button
    const heroButton = document.getElementById('primary-download-btn');
    const osDisplay = document.getElementById('detected-os');

    if (heroButton && osDisplay) {
        const osNames = {
            'windows': 'Windows',
            'macos': 'macOS',
            'linux': 'Linux',
            'unknown': 'Your OS'
        };

        osDisplay.textContent = osNames[detectedOS] || 'Your OS';

        if (downloadURLs[detectedOS]) {
            heroButton.href = downloadURLs[detectedOS];
        } else {
            // Fallback to downloads section
            heroButton.href = '#download';
        }
    }
}

// Initialize smooth scrolling for anchor links
function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');

            // Skip if href is just '#'
            if (href === '#') {
                e.preventDefault();
                return;
            }

            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Add download tracking (optional analytics)
function trackDownload(platform) {
    console.log(`Download started for platform: ${platform}`);

    // If you want to add analytics (e.g., Google Analytics), add it here:
    // gtag('event', 'download', { platform: platform });
}

// Add event listeners to download buttons for tracking
function initDownloadTracking() {
    document.querySelectorAll('[data-platform]').forEach(button => {
        button.addEventListener('click', function() {
            const platform = this.getAttribute('data-platform');
            trackDownload(platform);
        });
    });
}

// Handle loading state
function showLoadingState() {
    const versionElement = document.getElementById('latest-version');
    if (versionElement) {
        versionElement.textContent = 'Loading version...';
    }
}

// Handle error state
function showErrorState() {
    const versionElement = document.getElementById('latest-version');
    if (versionElement) {
        versionElement.textContent = 'Unable to fetch latest version';
        versionElement.style.color = '#ef4444';
    }

    // Set fallback GitHub releases page links
    const fallbackURL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

    ['windows', 'macos', 'linux'].forEach(platform => {
        const button = document.getElementById(`download-${platform}`);
        if (button) {
            button.href = fallbackURL;
            button.textContent = 'View Releases';
        }
    });

    const heroButton = document.getElementById('primary-download-btn');
    if (heroButton) {
        heroButton.href = fallbackURL;
    }
}

// Main initialization
async function init() {
    // Detect OS
    const detectedOS = detectOS();
    console.log('Detected OS:', detectedOS);

    // Initialize smooth scrolling
    initSmoothScrolling();

    // Initialize download tracking
    initDownloadTracking();

    // Show loading state
    showLoadingState();

    // Fetch latest release
    const release = await fetchLatestRelease();

    if (release) {
        // Update version display
        updateVersionDisplay(release.version);

        // Get download URLs
        const downloadURLs = getAllDownloadURLs(release.assets);
        console.log('Download URLs:', downloadURLs);

        // Update download buttons
        updateDownloadButtons(downloadURLs, detectedOS);
    } else {
        // Show error state
        showErrorState();
    }
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Handle external navigation warnings (optional)
window.addEventListener('beforeunload', function(e) {
    const downloadInProgress = sessionStorage.getItem('downloadInProgress');

    if (downloadInProgress === 'true') {
        // Clear the flag
        sessionStorage.removeItem('downloadInProgress');
    }
});

// Export for potential use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        detectOS,
        fetchLatestRelease,
        getDownloadURL
    };
}
