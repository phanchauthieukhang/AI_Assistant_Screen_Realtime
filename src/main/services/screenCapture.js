const { desktopCapturer, screen } = require('electron');

class ScreenCapture {
  constructor() {
    this.lastImage = null;
    this.changeThreshold = 0.05; // 5% pixels change triggers updates
  }

  async capture(region = null) {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.size;
      const scaleFactor = primaryDisplay.scaleFactor || 1;

      // Request screen sources with full screen resolution
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(width * scaleFactor),
          height: Math.round(height * scaleFactor)
        }
      });

      if (sources.length === 0) {
        throw new Error('Không có nguồn màn hình nào khả dụng.');
      }

      let img = sources[0].thumbnail;

      if (region) {
        // Handle high DPI scaling for crop rectangle
        const cropRect = {
          x: Math.round(region.x * scaleFactor),
          y: Math.round(region.y * scaleFactor),
          width: Math.round(region.width * scaleFactor),
          height: Math.round(region.height * scaleFactor)
        };

        const imgSize = img.getSize();
        
        // Boundaries safety check
        cropRect.x = Math.max(0, Math.min(cropRect.x, imgSize.width - 1));
        cropRect.y = Math.max(0, Math.min(cropRect.y, imgSize.height - 1));
        cropRect.width = Math.max(10, Math.min(cropRect.width, imgSize.width - cropRect.x));
        cropRect.height = Math.max(10, Math.min(cropRect.height, imgSize.height - cropRect.y));

        img = img.crop(cropRect);
      }

      return img;
    } catch (error) {
      console.error('Error during capture:', error);
      throw error;
    }
  }

  detectChange(newImg) {
    if (!this.lastImage) {
      this.lastImage = newImg;
      return true;
    }

    try {
      // Downscale images to 16x16 to compare structure quickly
      const img1 = newImg.resize({ width: 16, height: 16, quality: 'good' });
      const img2 = this.lastImage.resize({ width: 16, height: 16, quality: 'good' });

      const buf1 = img1.getBitmap();
      const buf2 = img2.getBitmap();

      if (buf1.length !== buf2.length) {
        this.lastImage = newImg;
        return true;
      }

      let diff = 0;
      for (let i = 0; i < buf1.length; i++) {
        // Compare color channel values (RGBA)
        if (Math.abs(buf1[i] - buf2[i]) > 20) { // Channel diff threshold
          diff++;
        }
      }

      // Check the ratio of different pixels
      const diffRatio = diff / buf1.length;
      
      this.lastImage = newImg; // Update cache
      
      return diffRatio > this.changeThreshold;
    } catch (error) {
      console.error('Error comparing screen hashes:', error);
      this.lastImage = newImg;
      return true;
    }
  }

  resetCache() {
    this.lastImage = null;
  }
}

module.exports = new ScreenCapture();
