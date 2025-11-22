# Deployment Guide for DEXStudios Website

## GitHub Pages Deployment

### Prerequisites
- GitHub repository set up
- GitHub Actions enabled in repository settings

### Automatic Deployment

The site is configured to automatically deploy to GitHub Pages when you push to the `main` branch.

#### Steps:

1. **Enable GitHub Pages in Repository Settings**
   - Go to your repository on GitHub
   - Navigate to Settings → Pages
   - Under "Build and deployment", select:
     - Source: **GitHub Actions**

2. **Push Your Code**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

3. **Monitor Deployment**
   - Go to the "Actions" tab in your repository
   - Watch the deployment workflow run
   - Once complete, your site will be live at: `https://yourusername.github.io/dexstudios.net/`

### Custom Domain Setup

If you want to use a custom domain (e.g., dexstudios.net):

1. **Add CNAME file**
   Create a file named `CNAME` in the `public` folder with your domain:
   ```
   www.dexstudios.net
   ```

2. **Update vite.config.ts**
   Change the base path to `/`:
   ```typescript
   export default defineConfig({
     plugins: [react()],
     base: '/',
   })
   ```

3. **Configure DNS**
   Add these DNS records in your domain provider:
   - Type: `A`, Name: `@`, Value: `185.199.108.153`
   - Type: `A`, Name: `@`, Value: `185.199.109.153`
   - Type: `A`, Name: `@`, Value: `185.199.110.153`
   - Type: `A`, Name: `@`, Value: `185.199.111.153`
   - Type: `CNAME`, Name: `www`, Value: `yourusername.github.io`

4. **Enable Custom Domain in GitHub**
   - Go to Settings → Pages
   - Enter your custom domain
   - Enable "Enforce HTTPS"

### Manual Deployment

If you prefer to deploy manually using gh-pages:

```bash
# Build the project
npm run build

# Deploy to gh-pages branch
npm run deploy
```

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Troubleshooting

### Build Fails
- Check that all dependencies are installed: `npm install`
- Clear cache: `rm -rf node_modules dist && npm install`
- Check for TypeScript errors: `npm run build`

### Deployment Fails
- Ensure GitHub Actions has write permissions
- Check the Actions tab for error logs
- Verify the workflow file is in `.github/workflows/deploy.yml`

### Assets Not Loading
- Check the `base` path in `vite.config.ts`
- For custom domain, use `base: '/'`
- For GitHub Pages subdirectory, use `base: '/repository-name/'`

## Environment Variables

If you need environment variables:

1. Create `.env` file (add to `.gitignore`)
2. Add variables with `VITE_` prefix:
   ```
   VITE_API_URL=https://api.example.com
   ```
3. Access in code:
   ```typescript
   const apiUrl = import.meta.env.VITE_API_URL
   ```

## Performance Optimization

The site is already optimized with:
- ✅ Code splitting
- ✅ Minification
- ✅ CSS optimization
- ✅ Tree shaking
- ✅ Lazy loading

For further optimization:
- Optimize images (use WebP format)
- Enable CDN for assets
- Configure caching headers
- Use service workers for offline support

## Security

- ✅ HTTPS enforced on GitHub Pages
- ✅ No sensitive data in repository
- ✅ Dependencies regularly updated
- ✅ CSP headers (configure in hosting)

## Monitoring

After deployment, monitor:
- Google Analytics (add tracking code if needed)
- Google Search Console
- GitHub Pages analytics
- Uptime monitoring services

## Support

For issues or questions:
- Email: alex@dexstudios.net
- GitHub Issues: Create an issue in the repository
