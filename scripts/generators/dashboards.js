/* eslint-disable no-await-in-loop */
import fs from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import FetchUtils from '@aem-screens/screens-offlineresources-generator/src/utils/fetchUtils.js';

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

  const videoAssets = Array.from(videoAssetsSet);
  if (!videoAssets.length) {
    console.warn('No video data found while extracting video assets.');
    return videoAssets;
  }
  return videoAssets;
};

export default class HtmlGenerator {
  static generateHTML = async (host, path) => {
    console.log(`running dashboard generator for ${path}`);
    const additionalAssets = [];
    try {
      const franklinResponse = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
      const franklinMarkup = await franklinResponse.text();
      const $ = load(franklinMarkup);
      const videoAssets = await getVideoAssets($);
      console.log(`Found ${videoAssets.length} video assets: ${videoAssets}`);
      additionalAssets.push(...videoAssets);
      additionalAssets.push('/blocks/carousel/carousel.js');
      additionalAssets.push('/blocks/carousel/utils.js');
      additionalAssets.push('/blocks/carousel/carousel.css');

      await fs.ensureDir(p.dirname(path));
      await fs.outputFile(`${path}.html`, $.html());
    } catch (error) {
      console.error(error);
    }
    return additionalAssets;
  };
}
