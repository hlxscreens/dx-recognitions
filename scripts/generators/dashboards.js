/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import FetchUtils from '@aem-screens/screens-offlineresources-generator/src/utils/fetchUtils.js';

const extractMediaFromPath = (path) => {
  const trimmedPath = path.trim();
  const mediaStart = trimmedPath.indexOf('/media_');
  
  if (mediaStart === -1) {
    return trimmedPath;
  }
  
  // Find the end position (either at #, ?, or end of string)
  let mediaEnd = trimmedPath.length;
  
  const hashIndex = trimmedPath.indexOf('#', mediaStart);
  const queryIndex = trimmedPath.indexOf('?', mediaStart);
  
  if (hashIndex !== -1 && hashIndex < mediaEnd) {
    mediaEnd = hashIndex;
  }
  if (queryIndex !== -1 && queryIndex < mediaEnd) {
    mediaEnd = queryIndex;
  }
  
  return trimmedPath.substring(mediaStart, mediaEnd);
};

const getVideoAssets = async ($) => {
  const videoAssetsSet = new Set();
  const carouselDivs = $('div.carousel.dashboards');

  if (carouselDivs && carouselDivs.length > 0) {
    // Find all <div> elements containing "Video:" that are descendants of the carousel dashboards
    carouselDivs.find('div:contains("Video:")').each((_, element) => {
      console.log('Found video element:', $(element).text());
      try {
        const urlRegex = /https?:\/\/[^\s'"]+/;
        const match = $(element).text().match(urlRegex);
        if (match) {
          let videoUrl = match[0];
          // remove trailing punctuation
          videoUrl = videoUrl.replace(/[.,;:]$/, '');
          const { pathname } = new URL(videoUrl);
          const lastSegment = pathname.substring(pathname.lastIndexOf('/'));
          videoAssetsSet.add(lastSegment);
          console.log('Extracted video URL:', videoUrl);
        } else {
          console.log('No video URL found.');
        }
      } catch (err) {
        console.warn('Error extracting video URL:', err);
      }
    });
  }
  else {
    console.warn('No carouselDivs');
  }

  const videoAssets = Array.from(videoAssetsSet);
  if (!videoAssets.length) {
    console.warn('No video data found while extracting video assets.');
    return videoAssets;
  }
  return videoAssets;
};

const getImageAssets = async ($) => {
  const imageAssetsSet = new Set();
  const carouselDivs = $('div.carousel.dashboards');

  if (carouselDivs && carouselDivs.length > 0) {
    // Find all <img> tags within the carousel dashboards
    carouselDivs.find('img').each((_, element) => {
      try {
        const imgSrc = $(element).attr('src');
        if (imgSrc && imgSrc.includes('/media_')) {
          const mediaPath = extractMediaFromPath(imgSrc);
          imageAssetsSet.add(mediaPath);
          console.log('Extracted image URL:', mediaPath);
        }
      } catch (err) {
        console.warn('Error extracting image URL:', err);
      }
    });

    // Also check for picture source tags
    carouselDivs.find('source').each((_, element) => {
      try {
        const srcset = $(element).attr('srcset');
        if (srcset && srcset.includes('/media_')) {
          const mediaPath = extractMediaFromPath(srcset);
          imageAssetsSet.add(mediaPath);
          console.log('Extracted image URL from srcset:', mediaPath);
        }
      } catch (err) {
        console.warn('Error extracting srcset URL:', err);
      }
    });
  } else {
    console.warn('No carouselDivs found for image extraction');
  }

  const imageAssets = Array.from(imageAssetsSet);
  console.log(`Found ${imageAssets.length} image assets`);
  return imageAssets;
};

async function processFragments($, host) {
  const assets = [];

  const links = $('main .fragment a');
  if (links.length > 0) {
    const fragmentPaths = [];
    $(links).each(async (_i, link) => {
      fragmentPaths.push($(link).attr('href'));
    });

    // eslint-disable-next-line no-restricted-syntax
    for (const path of fragmentPaths) {
      try {
        const fragmentResponse = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
        const fragmentMarkup = await fragmentResponse.text();
        // console.log('loading fragmentMarkup for path=', path);
        const nestedMarkup = load(fragmentMarkup);
        const nestedLinks = nestedMarkup('main .fragment a');
        if (nestedLinks.length > 0) {
          const nestedAssets = await processFragments(nestedMarkup, host);
          assets.push(...nestedAssets);
        } else {
          // Extract images and videos from the fragment
          const fragmentImageAssets = await getImageAssets(nestedMarkup);
          const fragmentVideoAssets = await getVideoAssets(nestedMarkup);
          assets.push(...fragmentImageAssets);
          assets.push(...fragmentVideoAssets);
        }
        // Add the HTML files for the fragment
        // Ensure path starts with /
        const fragmentPath = path.startsWith('/') ? path : `/${path}`;
        assets.push(`${fragmentPath}.html`);
        assets.push(`${fragmentPath}.plain.html`);
      } catch (err) {
        console.warn(`Error processing fragment ${path}:`, err);
      }
    }
  }

  assets.push('/blocks/fragment/fragment.js');
  assets.push('/blocks/fragment/fragment.css');
  return assets;
}

export default class HtmlGenerator {
  static generateHTML = async (host, path) => {
    console.log(`running dashboard generator for ${path}`);
    const additionalAssets = [];
    try {
      const franklinResponse = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
      const franklinMarkup = await franklinResponse.text();
      const $ = load(franklinMarkup);
      
      // Extract video and image assets from the main page
      const videoAssets = await getVideoAssets($);
      console.log(`Found ${videoAssets.length} video assets: ${videoAssets}`);
      additionalAssets.push(...videoAssets);
      
      const imageAssets = await getImageAssets($);
      console.log(`Found ${imageAssets.length} image assets: ${imageAssets}`);
      additionalAssets.push(...imageAssets);
      
      // Process fragments and get their assets
      const fragmentAssets = await processFragments($, host);
      console.log(`Found ${fragmentAssets.length} fragment assets`);
      additionalAssets.push(...fragmentAssets);
      
      additionalAssets.push('/blocks/carousel/carousel.js');
      additionalAssets.push('/blocks/carousel/utils.js');
      additionalAssets.push('/blocks/carousel/carousel.css');
      
      // Add the dashboard page's own .plain.html file
      const mainPagePath = path.startsWith('/') ? path : `/${path}`;
      additionalAssets.push(`${mainPagePath}.plain.html`);

      await fs.ensureDir(p.dirname(path));
      await fs.outputFile(`${path}.html`, $.html());
    } catch (error) {
      console.error(error);
    }
    return additionalAssets;
  };
}
