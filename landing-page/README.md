# Reviewer 2 Landing Page

This directory contains the landing page for Reviewer 2, a professional PDF annotation application.

## Overview

The landing page is a single-page static website featuring:
- Hero section with OS detection and dynamic download links
- Features showcase
- Screenshots carousel
- Download section with installation instructions
- Dark mode by default with light mode support

## Files

- `index.html` - Main HTML structure
- `style.css` - Styling (dark mode, responsive design)
- `script.js` - OS detection, GitHub API integration, dynamic downloads
- `assets/` - Screenshots and images (placeholders included)

## Setup Instructions

### 1. Update Configuration

Before deploying, you **must** update the GitHub username in these files:

**In `index.html`:**
```html
<!-- Line 19, 24, 215, 216, 217, 218 -->
<a href="https://github.com/YOUR_USERNAME/reviewer" target="_blank">
```

**In `script.js`:**
```javascript
// Line 9
const GITHUB_OWNER = 'YOUR_GITHUB_USERNAME';
```

### 2. Add Screenshots

Replace the placeholder images in the `assets/` directory:

- `hero-screenshot.png` - Main app screenshot (1600x1000px recommended)
- `feature-1.png` - Annotation interface screenshot (1200x800px)
- `feature-2.png` - Category management screenshot (1200x800px)
- `feature-3.png` - Export features screenshot (1200x800px)

**Taking Screenshots:**
1. Launch Reviewer 2 app
2. Open a PDF with annotations
3. Use macOS: `Cmd+Shift+4` or Windows: `Win+Shift+S`
4. Capture the main window
5. Save to `landing-page/assets/`

## Deployment Options

### Option A: GitHub Pages (Separate Branch)

Deploy directly from this repository using GitHub Pages:

1. **Create gh-pages branch:**
   ```bash
   git checkout --orphan gh-pages
   git reset --hard
   cp -r landing-page/* .
   git add .
   git commit -m "Deploy landing page"
   git push origin gh-pages
   ```

2. **Enable GitHub Pages:**
   - Go to repository Settings → Pages
   - Source: Deploy from branch
   - Branch: `gh-pages` / root
   - Save

3. **Access URL:**
   - `https://YOUR_USERNAME.github.io/reviewer/`

### Option B: Add to Personal Website Repository

If you already have a personal GitHub Pages site (e.g., `YOUR_USERNAME.github.io`):

1. **Copy landing page to your site:**
   ```bash
   cd /path/to/YOUR_USERNAME.github.io
   mkdir reviewer
   cp -r /path/to/Reviewer/landing-page/* reviewer/
   git add reviewer/
   git commit -m "Add Reviewer 2 landing page"
   git push origin main
   ```

2. **Update homepage to link to it:**
   ```html
   <a href="/reviewer/">Reviewer 2 - PDF Annotation Tool</a>
   ```

3. **Access URL:**
   - `https://YOUR_USERNAME.github.io/reviewer/`

### Option C: Custom Domain

If you have a custom domain:

1. Follow Option A or B above
2. Add a `CNAME` file:
   ```bash
   echo "your-domain.com" > CNAME
   git add CNAME
   git commit -m "Add custom domain"
   git push
   ```

3. Configure DNS:
   - Add CNAME record pointing to `YOUR_USERNAME.github.io`
   - Wait for DNS propagation (5-30 minutes)

4. Enable HTTPS in GitHub Pages settings

## Testing Locally

Before deploying, test the landing page locally:

### Using Python (Built-in)
```bash
cd landing-page
python3 -m http.server 8000
# Open http://localhost:8000 in browser
```

### Using Node.js (http-server)
```bash
npm install -g http-server
cd landing-page
http-server -p 8000
# Open http://localhost:8000 in browser
```

### Using PHP (Built-in)
```bash
cd landing-page
php -S localhost:8000
# Open http://localhost:8000 in browser
```

## Dynamic Features

### OS Detection

The page automatically detects the visitor's operating system and:
- Updates the hero download button text ("Download for Windows/macOS/Linux")
- Highlights the appropriate download button in the download section
- Provides platform-specific installation instructions

### GitHub API Integration

The page fetches the latest release from GitHub API:
- Displays the latest version number
- Updates download links to point to the latest release assets
- Falls back to the releases page if API fails

**API Endpoint:**
```
https://api.github.com/repos/YOUR_USERNAME/reviewer/releases/latest
```

**No authentication required** for public repositories (60 requests/hour limit per IP).

## Customization

### Colors

Edit CSS variables in `style.css`:
```css
:root {
    --color-primary: #3b82f6;  /* Primary button color */
    --color-bg: #0f0f0f;       /* Background color */
    /* ... */
}
```

### Content

- **Hero text:** Edit `index.html` lines 29-37
- **Features:** Edit `index.html` lines 53-107
- **Installation notes:** Edit `index.html` lines 153-205

### Layout

- **Responsive breakpoints:** `style.css` lines 610-650
- **Grid columns:** Adjust `grid-template-columns` in `style.css`

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Lightweight: ~50KB total (HTML + CSS + JS)
- No external dependencies
- Lazy loading for images (browser native)
- Cached GitHub API responses

## SEO

The page includes:
- Semantic HTML5 elements
- Meta description and keywords
- Open Graph tags (add if needed)
- Structured data (can be added)

**To improve SEO, add to `<head>`:**
```html
<meta property="og:title" content="Reviewer 2 - Professional PDF Annotation Tool">
<meta property="og:description" content="Review documents efficiently with categorized comments">
<meta property="og:image" content="https://YOUR_USERNAME.github.io/reviewer/assets/hero-screenshot.png">
<meta property="og:url" content="https://YOUR_USERNAME.github.io/reviewer/">
<meta name="twitter:card" content="summary_large_image">
```

## Analytics (Optional)

To track page visits and downloads, add Google Analytics:

1. **Add to `<head>` in index.html:**
   ```html
   <!-- Google Analytics -->
   <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
   <script>
     window.dataLayer = window.dataLayer || [];
     function gtag(){dataLayer.push(arguments);}
     gtag('js', new Date());
     gtag('config', 'G-XXXXXXXXXX');
   </script>
   ```

2. **Update `script.js` line 170:**
   ```javascript
   function trackDownload(platform) {
       gtag('event', 'download', { platform: platform });
   }
   ```

## Maintenance

### Updating Content

1. Edit files locally
2. Commit changes
3. Push to gh-pages branch (or your deployment branch)
4. Changes appear automatically (may take 1-2 minutes)

### Adding New Features

1. Update `index.html` (add feature card)
2. Update screenshots in `assets/`
3. Test locally
4. Deploy

### Monitoring

- **GitHub Pages status:** Check repository Actions tab
- **Dead links:** Use [W3C Link Checker](https://validator.w3.org/checklink)
- **Performance:** Use [PageSpeed Insights](https://pagespeed.web.dev/)

## Troubleshooting

### Download Links Not Working

**Problem:** Buttons show "View Releases" instead of "Download .exe/.dmg"

**Solutions:**
1. Check that `GITHUB_OWNER` in `script.js` is correct
2. Verify repository is public
3. Check browser console for API errors
4. Ensure at least one release exists in GitHub

### Images Not Loading

**Problem:** Placeholder SVGs show instead of screenshots

**Solutions:**
1. Verify image files exist in `assets/` directory
2. Check file names match `index.html` src attributes
3. Ensure images are committed and pushed

### Styling Issues

**Problem:** Colors or layout broken

**Solutions:**
1. Clear browser cache (Cmd+Shift+R / Ctrl+Shift+R)
2. Check `style.css` is loaded (view source)
3. Test in incognito mode
4. Verify CSS file uploaded correctly

### GitHub API Rate Limit

**Problem:** "Unable to fetch latest version" error

**Solutions:**
- Wait 1 hour (rate limit resets)
- Add GitHub token for 5000 requests/hour (for authenticated users)
- Cache responses locally

## License

MIT License - Same as Reviewer 2 application

## Support

For issues with the landing page:
- Open issue: https://github.com/YOUR_USERNAME/reviewer/issues
- Check documentation: https://github.com/YOUR_USERNAME/reviewer#readme
