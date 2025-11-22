/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import FetchUtils from '@aem-screens/screens-offlineresources-generator/src/utils/fetchUtils.js';

const getFranklinMarkup = async (host, path) => {
  const resp = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
  return resp.text();
};

const checkIfProfileImageExists = async (path) => {
  try {
    const resp = await FetchUtils.fetchDataWithMethod('https://s7d2.scene7.com', path, 'GET', { referer: 'https://inside.corp.adobe.com/' });    
    return resp.status === 200;
  } catch (e) {
    return false;
  }
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

const extractSheetData = async (host, path) => {
  // Get default franklin markup for path
  const franklinMarkup = await getFranklinMarkup(host, path);
  const $ = load(franklinMarkup);
  const sheetDetails = [];
  const columns = $('.recognitions > div');
  if (!columns.length) {
    console.warn('No carousel data found while extracting sheet data.');
    return sheetDetails;
  }

  columns.each((i, column) => {
    try {
      const link = $(column).find('div > a').attr('href');
      sheetDetails.push({
        link,
      });
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

const getAssets = async (host, path) => {
  const sheetDetails = await extractSheetData(host, path) || [];
  if (sheetDetails.length === 0) {
    console.warn('No sheet data available during HTML generation');
  }
  const assets = [];
  for (let sheetIndex = 0; sheetIndex < sheetDetails.length; sheetIndex += 1) {
    try {
      assets.push(sheetDetails[sheetIndex].link);
      const resp = await FetchUtils.fetchDataWithMethod(host, sheetDetails[sheetIndex].link, 'GET', {'X-Client-Type': "franklin"});
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

const getImageAssetsFromFragment = async (fragmentMarkup) => {
  const imageAssetsSet = new Set();
  
  // Find all <img> tags
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

  // Also check for picture source tags
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
  
  // Find all video elements or Video: links
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
        const fragmentFranklinMarkup = await getFranklinMarkup(host, path);
        // console.log('loading fragmentFranklinMarkup=', fragmentFranklinMarkup);
        const nestedMarkup = load(fragmentFranklinMarkup);
        
        // Check if fragment has nested fragments
        const nestedLinks = nestedMarkup('main .fragment a');
        if (nestedLinks.length > 0) {
          const nestedAssets = await processFragments(nestedMarkup, host);
          assets.push(...nestedAssets);
        } else {
          // Check if this fragment has a recognitions carousel
          const hasRecognitionsCarousel = nestedMarkup('.carousel.recognitions').length > 0;
          const hasDashboardsCarousel = nestedMarkup('.carousel.dashboards').length > 0;
          
          if (hasRecognitionsCarousel) {
            // Extract assets from recognitions sheets
            const singleFragmentAssets = await getAssets(host, path);
            assets.push(...singleFragmentAssets);
          }
          
          if (hasDashboardsCarousel || nestedMarkup('picture').length > 0) {
            // Extract images and videos from dashboard/poster fragments
            const fragmentImageAssets = await getImageAssetsFromFragment(nestedMarkup);
            const fragmentVideoAssets = await getVideoAssetsFromFragment(nestedMarkup);
            assets.push(...fragmentImageAssets);
            assets.push(...fragmentVideoAssets);
            console.log(`Extracted ${fragmentImageAssets.length} images and ${fragmentVideoAssets.length} videos from fragment: ${path}`);
          }
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
    console.log(`running carousel from sheet generator for ${path}`);
    const additionalAssets = [];
    try {
      // Get assets from sheet
      const assets = await getAssets(host, path);
      additionalAssets.push(...assets);

      additionalAssets.push('/blocks/carousel/carousel.js');
      additionalAssets.push('/blocks/carousel/utils.js');
      additionalAssets.push('/blocks/carousel/carousel.css');

      additionalAssets.push('/icons/not-found.png');
      additionalAssets.push('/fonts/AdobeClean/AdobeClean-Regular.otf');
      additionalAssets.push('/fonts/AdobeClean/AdobeClean-Bold.otf');
      additionalAssets.push('/fonts/AdobeClean/AdobeClean-ExtraBold.otf');

      // Get default franklin markup for path
      const franklinMarkup = await getFranklinMarkup(host, path);
      const $ = load(franklinMarkup);

      // get assets from all fragments
      const fragmentAssets = await processFragments($, host);
      additionalAssets.push(...fragmentAssets);
      // Add the recognition page's own .plain.html file
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
