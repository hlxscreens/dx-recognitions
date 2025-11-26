/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import FetchUtils from '@aem-screens/screens-offlineresources-generator/src/utils/fetchUtils.js';

// ========================================
// COMMON UTILITY FUNCTIONS
// ========================================

const getFranklinMarkup = async (host, path) => {
  const resp = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
  return resp.text();
};

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

const checkIfProfileImageExists = async (path) => {
  try {
    const resp = await FetchUtils.fetchDataWithMethod('https://s7d2.scene7.com', path, 'GET', { referer: 'https://inside.corp.adobe.com/' });
    return resp.status === 200;
  } catch (e) {
    return false;
  }
};

// ========================================
// DASHBOARD-SPECIFIC FUNCTIONS
// ========================================

const getVideoAssets = async ($) => {
  const videoAssetsSet = new Set();
  const carouselDivs = $('div.carousel.dashboards');

  if (carouselDivs && carouselDivs.length > 0) {
    carouselDivs.find('div:contains("Video:")').each((_, element) => {
      console.log('Found video element:', $(element).text());
      try {
        const urlRegex = /https?:\/\/[^\s'"]+/;
        const match = $(element).text().match(urlRegex);
        if (match) {
          let videoUrl = match[0];
          videoUrl = videoUrl.replace(/[.,;:]$/, '');
          const { pathname } = new URL(videoUrl);
          const lastSegment = pathname.substring(pathname.lastIndexOf('/'));
          videoAssetsSet.add(lastSegment);
          console.log('Extracted video URL:', videoUrl);
        }
      } catch (err) {
        console.warn('Error extracting video URL:', err);
      }
    });
  }

  return Array.from(videoAssetsSet);
};

const getImageAssets = async ($) => {
  const imageAssetsSet = new Set();
  const carouselDivs = $('div.carousel.dashboards');

  if (carouselDivs && carouselDivs.length > 0) {
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
  }

  return Array.from(imageAssetsSet);
};

// ========================================
// RECOGNITION-SPECIFIC FUNCTIONS
// ========================================

const extractSheetData = async (host, path) => {
  const franklinMarkup = await getFranklinMarkup(host, path);
  const $ = load(franklinMarkup);
  const sheetDetails = [];
  const columns = $('.recognitions > div');

  if (!columns.length) {
    console.warn('No recognition carousel data found while extracting sheet data.');
    return sheetDetails;
  }

  columns.each((i, column) => {
    try {
      const link = $(column).find('div > a').attr('href');
      sheetDetails.push({ link });
    } catch (err) {
      console.warn(`Exception while processing row ${i}`, err);
    }
  });

  return sheetDetails;
};

const processSheetDataResponse = (sheetDataResponse) => {
  if (sheetDataResponse[':type'] === 'sheet') {
    return sheetDataResponse.data;
  }
  throw new Error(`Invalid sheet type: ${sheetDataResponse[':type']}`);
};

const getRecognitionAssets = async (host, path) => {
  const sheetDetails = await extractSheetData(host, path) || [];
  if (sheetDetails.length === 0) {
    console.warn(`No recognition sheet data available for path: ${path}`);
    return [];
  }

  const assets = [];
  for (let sheetIndex = 0; sheetIndex < sheetDetails.length; sheetIndex += 1) {
    try {
      assets.push(sheetDetails[sheetIndex].link);
      const resp = await FetchUtils.fetchDataWithMethod(host, sheetDetails[sheetIndex].link, 'GET', { 'X-Client-Type': 'franklin' });
      const sheetDataResponse = await resp.json();

      if (!sheetDataResponse) {
        console.warn(`Invalid sheet Link ${JSON.stringify(sheetDetails[sheetIndex])}. Skipping processing this one.`);
      } else {
        const sheetData = processSheetDataResponse(sheetDataResponse);
        for (let row = 0; row < sheetData.length; row += 1) {
          try {
            const assetDetails = sheetData[row];
            const profileImages = assetDetails.LDAP ? assetDetails.LDAP.split(',').map((ldap) => `/is/image/IMGDIR/${ldap.toLowerCase().trim()}`) : [];

            if (assetDetails['Image URL']) {
              assets.push(extractMediaFromPath(assetDetails['Image URL']));
            }

            for (let i = 0; i < profileImages.length; i++) {
              const profileImageExists = await checkIfProfileImageExists(profileImages[i]);
              if (profileImageExists) {
                assets.push(profileImages[i]);
              }
            }
          } catch (err) {
            console.warn(`Error while processing asset ${JSON.stringify(sheetData[row])}`, err);
          }
        }
      }
    } catch (err) {
      console.warn(`Error while processing sheet ${JSON.stringify(sheetDetails[sheetIndex])}`, err);
    }
  }

  return assets;
};

// ========================================
// FRAGMENT-SPECIFIC FUNCTIONS
// ========================================

const getImageAssetsFromFragment = async (fragmentMarkup) => {
  const imageAssetsSet = new Set();

  fragmentMarkup('img').each((_, element) => {
    try {
      const imgSrc = fragmentMarkup(element).attr('src');
      if (imgSrc && imgSrc.includes('/media_')) {
        const mediaPath = extractMediaFromPath(imgSrc);
        imageAssetsSet.add(mediaPath);
        console.log('Extracted image URL from fragment:', mediaPath);
      }
    } catch (err) {
      console.warn('Error extracting image URL from fragment:', err);
    }
  });

  fragmentMarkup('source').each((_, element) => {
    try {
      const srcset = fragmentMarkup(element).attr('srcset');
      if (srcset && srcset.includes('/media_')) {
        const mediaPath = extractMediaFromPath(srcset);
        imageAssetsSet.add(mediaPath);
        console.log('Extracted image URL from fragment srcset:', mediaPath);
      }
    } catch (err) {
      console.warn('Error extracting srcset URL from fragment:', err);
    }
  });

  return Array.from(imageAssetsSet);
};

const getVideoAssetsFromFragment = async (fragmentMarkup) => {
  const videoAssetsSet = new Set();

  fragmentMarkup('div:contains("Video:")').each((_, element) => {
    try {
      const urlRegex = /https?:\/\/[^\s'"]+/;
      const match = fragmentMarkup(element).text().match(urlRegex);
      if (match) {
        let videoUrl = match[0];
        videoUrl = videoUrl.replace(/[.,;:]$/, '');
        const { pathname } = new URL(videoUrl);
        const lastSegment = pathname.substring(pathname.lastIndexOf('/'));
        videoAssetsSet.add(lastSegment);
        console.log('Extracted video URL from fragment:', videoUrl);
      }
    } catch (err) {
      console.warn('Error extracting video URL from fragment:', err);
    }
  });

  return Array.from(videoAssetsSet);
};

// ========================================
// SMART FRAGMENT PROCESSOR
// Handles both recognition and dashboard fragments
// ========================================

async function processFragments($, host) {
  const assets = [];

  const links = $('main .fragment a');
  if (links.length > 0) {
    const fragmentPaths = [];
    $(links).each((_i, link) => {
      fragmentPaths.push($(link).attr('href'));
    });

    for (let i = 0; i < fragmentPaths.length; i += 1) {
      const path = fragmentPaths[i];
      try {
        console.log(`Processing fragment: ${path}`);
        const fragmentResponse = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
        const fragmentMarkup = await fragmentResponse.text();
        const nestedMarkup = load(fragmentMarkup);

        // Check fragment's template to determine processing strategy
        const template = nestedMarkup('meta[name="template"]').attr('content');
        console.log(`Fragment ${path} has template: ${template}`);

        // Handle recognition fragments
        if (template === 'recognitions') {
          console.log(`Processing RECOGNITION fragment: ${path}`);

          // Extract recognitions.json paths from the recognitions carousel
          const recognitionsColumns = nestedMarkup('.recognitions > div');
          if (recognitionsColumns && recognitionsColumns.length > 0) {
            console.log(`Found ${recognitionsColumns.length} recognition links in fragment ${path}`);
            recognitionsColumns.each((_i, column) => {
              try {
                const link = nestedMarkup(column).find('div > a').attr('href');
                if (link) {
                  console.log(`  Adding recognitions.json: ${link}`);
                  assets.push(link);
                }
              } catch (err) {
                console.warn(`Error extracting recognition link from column ${_i}:`, err);
              }
            });

            // Fetch the actual recognition assets from sheets
            const recognitionAssets = await getRecognitionAssets(host, path);
            assets.push(...recognitionAssets);
            console.log(`Extracted ${recognitionAssets.length} recognition assets from ${path}`);
          }

          // Add fonts and icons needed for recognitions pages
          assets.push('/icons/not-found.png');
          assets.push('/fonts/AdobeClean/AdobeClean-Regular.otf');
          assets.push('/fonts/AdobeClean/AdobeClean-Bold.otf');
          assets.push('/fonts/AdobeClean/AdobeClean-ExtraBold.otf');
        }

        // Handle dashboard fragments or fragments with dashboard carousels
        if (template === 'dashboards') {
          console.log(`Processing DASHBOARD fragment: ${path}`);
          const fragmentImageAssets = await getImageAssets(nestedMarkup);
          const fragmentVideoAssets = await getVideoAssets(nestedMarkup);
          assets.push(...fragmentImageAssets);
          assets.push(...fragmentVideoAssets);
          console.log(`Extracted ${fragmentImageAssets.length} images and ${fragmentVideoAssets.length} videos from dashboard fragment: ${path}`);
        }

        // Handle accoladesandposters fragments (recursive)
        if (template === 'accoladesandposters') {
          console.log(`Processing ACCOLADESANDPOSTERS fragment (recursive): ${path}`);
          const nestedAssets = await processFragments(nestedMarkup, host);
          assets.push(...nestedAssets);
        }

        // Check for nested fragments
        const nestedLinks = nestedMarkup('main .fragment a');
        if (nestedLinks.length > 0) {
          console.log(`Fragment ${path} has ${nestedLinks.length} nested fragments, processing recursively...`);
          const nestedAssets = await processFragments(nestedMarkup, host);
          assets.push(...nestedAssets);
        } else if (!template || template === 'default') {
          // If no specific template, try to extract any images/videos present
          const fragmentImageAssets = await getImageAssetsFromFragment(nestedMarkup);
          const fragmentVideoAssets = await getVideoAssetsFromFragment(nestedMarkup);
          if (fragmentImageAssets.length > 0 || fragmentVideoAssets.length > 0) {
            assets.push(...fragmentImageAssets);
            assets.push(...fragmentVideoAssets);
            console.log(`Extracted ${fragmentImageAssets.length} images and ${fragmentVideoAssets.length} videos from generic fragment: ${path}`);
          }
        }

        // Add the HTML files for the fragment
        const fragmentPath = path.startsWith('/') ? path : `/${path}`;
        assets.push(`${fragmentPath}.html`);
        assets.push(`${fragmentPath}.plain.html`);

        // Fetch and save fragment .plain.html file
        try {
          const plainHtmlResponse = await FetchUtils.fetchDataWithMethod(host, `${path}.plain.html`, 'GET');
          const plainHtmlContent = await plainHtmlResponse.text();
          const fragmentFilePath = path.startsWith('/') ? path.substring(1) : path;
          await fs.ensureDir(p.dirname(fragmentFilePath));
          await fs.outputFile(`${fragmentFilePath}.plain.html`, plainHtmlContent);
          console.log(`Successfully saved fragment ${fragmentFilePath}.plain.html`);
        } catch (error) {
          console.error(`Error fetching .plain.html for fragment ${path}:`, error);
        }
      } catch (err) {
        console.warn(`Error processing fragment ${path}:`, err);
      }
    }
    // Add fragment block assets
    assets.push('/blocks/fragment/fragment.js');
    assets.push('/blocks/fragment/fragment.css');
  } else {
    console.log('No fragments found to process.');
  }

  return assets;
}

// ========================================
// MAIN GENERATOR
// ========================================

export default class HtmlGenerator {
  static generateHTML = async (host, path) => {
    console.log(`running accolades and posters generator for ${path}`);
    const additionalAssets = [];

    try {
      const franklinResponse = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
      const franklinMarkup = await franklinResponse.text();
      const $ = load(franklinMarkup);

      // Extract dashboard assets from main page (videos, images)
      const videoAssets = await getVideoAssets($);
      console.log(`Found ${videoAssets.length} video assets from main page`);
      additionalAssets.push(...videoAssets);

      const imageAssets = await getImageAssets($);
      console.log(`Found ${imageAssets.length} image assets from main page`);
      additionalAssets.push(...imageAssets);

      // Extract recognition assets from main page (recognitions.json, profile images)
      const recognitionAssets = await getRecognitionAssets(host, path);
      console.log(`Found ${recognitionAssets.length} recognition assets from main page`);
      additionalAssets.push(...recognitionAssets);

      // Add fonts and icons for recognitions (always include for mixed content)
      additionalAssets.push('/icons/not-found.png');
      additionalAssets.push('/fonts/AdobeClean/AdobeClean-Regular.otf');
      additionalAssets.push('/fonts/AdobeClean/AdobeClean-Bold.otf');
      additionalAssets.push('/fonts/AdobeClean/AdobeClean-ExtraBold.otf');

      // Process all fragments (handles both dashboard and recognition fragments intelligently)
      const fragmentAssets = await processFragments($, host);
      console.log(`Found ${fragmentAssets.length} fragment assets`);
      additionalAssets.push(...fragmentAssets);

      // Add carousel block assets (needed for both dashboards and recognitions)
      additionalAssets.push('/blocks/carousel/carousel.js');
      additionalAssets.push('/blocks/carousel/utils.js');
      additionalAssets.push('/blocks/carousel/carousel.css');

      // Add the main page's .plain.html file
      const mainPagePath = path.startsWith('/') ? path : `/${path}`;
      additionalAssets.push(`${mainPagePath}.plain.html`);

      // Save the HTML file
      await fs.ensureDir(p.dirname(path));
      await fs.outputFile(`${path}.html`, $.html());

      // Fetch and save the .plain.html file for offline use
      try {
        const plainHtmlResponse = await FetchUtils.fetchDataWithMethod(host, `${path}.plain.html`, 'GET');
        const plainHtmlContent = await plainHtmlResponse.text();
        await fs.outputFile(`${path}.plain.html`, plainHtmlContent);
        console.log(`Successfully saved ${path}.plain.html`);
      } catch (error) {
        console.error(`Error fetching .plain.html for ${path}:`, error);
      }
    } catch (error) {
      console.error(error);
    }

    return additionalAssets;
  };
}
