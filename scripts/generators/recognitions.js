/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import fetch from 'node-fetch-cache';
import FetchUtils from '@aem-screens/screens-offlineresources-generator/src/utils/fetchUtils.js';

const getFranklinMarkup = async (host, path) => {
  try {
    // Check if the path is already a full URL or just a path
    let url = path;
    if (!path.startsWith('http')) {
      // If it's just a path, use FetchUtils to construct the full URL
      url = FetchUtils.createUrlFromHostAndPath(host, path);
    } else {
      // If it's already a full URL, use it directly
      url = path;
    }
    
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'x-franklin-allowlist-key': process.env.franklinAllowlistKey
      }
    });
    
    if (!resp.ok) {
      throw new Error(`Request to fetch ${url} failed with status code ${resp.status}`);
    }
    
    return resp.text();
  } catch (error) {
    console.error(`Error fetching Franklin markup for ${path}:`, error);
    throw error;
  }
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
  if (path.indexOf('#') >= 0) {
    return `${path.trim().substring(path.indexOf('/media_'), path.indexOf('#'))}`;
  }
  return `${path.trim().substring(path.indexOf('/media_'))}`;
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
      
      // Check if the link is already a full URL or just a path
      let sheetUrl = sheetDetails[sheetIndex].link;
      if (!sheetUrl.startsWith('http')) {
        // If it's just a path, use FetchUtils to construct the full URL
        sheetUrl = FetchUtils.createUrlFromHostAndPath(host, sheetUrl);
      }
      
      const resp = await fetch(sheetUrl, {
        method: 'GET',
        headers: {
          'X-Client-Type': 'franklin',
          'x-franklin-allowlist-key': process.env.franklinAllowlistKey
        }
      });
      
      if (!resp.ok) {
        throw new Error(`Request to fetch ${sheetUrl} failed with status code ${resp.status}`);
      }
      
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
      const fragmentFranklinMarkup = await getFranklinMarkup(host, path);
      // console.log('loading fragmentFranklinMarkup=', fragmentFranklinMarkup);
      const nestedMarkup = load(fragmentFranklinMarkup);
      const nestedLinks = nestedMarkup('main .fragment a');
      if (nestedLinks.length > 0) {
        const nestedAssets = await processFragments(nestedMarkup, host);
        assets.push(...nestedAssets);
      } else {
        const singleFragmentAssets = await getAssets(host, path);
        assets.push(...singleFragmentAssets);
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

      await fs.ensureDir(p.dirname(path));
      await fs.outputFile(`${path}.html`, $.html());
    } catch (error) {
      console.error(error);
    }
    return additionalAssets;
  };
}
