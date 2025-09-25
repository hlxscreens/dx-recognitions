import {
  parseStartDateString,
  parseEndDateString,
  validateDateFormat,
  createDivWithClass,
} from './utils.js';

import { createOptimizedPicture } from '../../scripts/lib-franklin.js';

const DEFAULT_HEADING = 'DX India Recognitions';
const NO_HEADING = 'No Heading';
// 1 image - 400x400, 2 images - 330x330, 3 images - 273x273, 4 images - 256x256, 5 images - 227x227
const IMAGE_SIZES = ['20.6vw', '16.9vw', '14vw', '13.2vw', '11.8vw'];

const RECOGNITIONS_MAIN_URL = 'https://dx-recognitions.aem-screens.net/content/screens/org-amitabh/main.html';

const DEFAULT_ITEM_DURATION = 10 * 1000; // 10 seconds
const DEFAULT_DASHBOARD_ITEM_DURATION =30000; // 30 seconds
const UNIFIED_ITEM_DURATION = 30000; // 30 seconds for unified carousel
let itemDuration = DEFAULT_ITEM_DURATION;

const DASHBOARDS_BLOCK_NAME = 'dashboards';
const CAROUSEL_ITEM_DASHBOARDS_CLASS = `carousel-item-${DASHBOARDS_BLOCK_NAME}`;

const MEDIA_PREFIX = '/media_';

const TIMEOUTS = {
  timeouts: [],
  setTimeout(fn, delay) {
    const id = setTimeout(fn, delay);
    this.timeouts.push(id);
  },
  clearAllTimeouts() {
    while (this.timeouts.length) {
      clearTimeout(this.timeouts.pop());
    }
  },
};

let skipIframeReload = false;

// franklin bot gives url like - https://main--dx-recognitions--hlxscreens.hlx.page/media_1d5c646537bebc6e8f9f3ab728b28aeb997e63db8.jpeg#width=586&height=421
// extract the media path from it
const extractMediaFromPath = (path) => {
  if (path.indexOf('#') >= 0) {
    return `.${path.trim().substring(path.indexOf('/media_'), path.indexOf('#'))}`;
  }
  return `.${path.trim().substring(path.indexOf('/media_'))}`;
};

async function buildCarouselFromSheet(block) {
  const fetchData = async (url, method = 'GET', additionalHeaders = {}) => {
    let result = '';
    try {
      result = fetch(url, {
        method,
        headers: {
          ...additionalHeaders,
        },
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`request to fetch ${url} failed with status code ${response.status}`);
        }
        return response.text();
      });
      return Promise.resolve(result);
    } catch (e) {
      throw new Error(`request to fetch ${url} failed with status code with error ${e}`);
    }
  };

  const extractSheetData = () => {
    const sheetDetails = [];
    const columns = block.querySelectorAll('.recognitions > div');
    if (!columns) {
      console.warn('No carousel data found while extracting sheet data.');
      return sheetDetails;
    }
    for (let i = 0; i < columns.length; i += 1) {
      try {
        const divs = columns[i].getElementsByTagName('div');
        const link = divs[1].getElementsByTagName('a')[0].href;
        const linkUrl = new URL(link);
        const background = divs[0].querySelector('picture');
        const teamName = divs[2]?.innerText;
        sheetDetails.push({
          link: linkUrl,
          background,
          teamName,
        });
      } catch (err) {
        console.warn(`Exception while processing row ${i}`, err);
      }
    }
    console.log('sheetDetails', JSON.stringify(sheetDetails));
    return sheetDetails;
  };

  const processSheetDataResponse = (sheetDataResponse) => {
    if (sheetDataResponse[':type'] === 'sheet') {
      return sheetDataResponse.data;
    }
    throw new Error(`Invalid sheet type: ${sheetDataResponse[':type']}`);
  };

  const getCarouselItems = async () => {
    const sheetDetails = extractSheetData() || [];
    console.log(JSON.stringify(sheetDetails));
    if (sheetDetails.length === 0) {
      console.warn('No sheet data available during HTML generation');
    }
    const carouselItems = [];
    let errorFlag = false;
    for (let sheetIndex = 0; sheetIndex < sheetDetails.length; sheetIndex += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const sheetDataResponse = JSON.parse(await fetchData(sheetDetails[sheetIndex].link, 'GET', { 'X-Client-Type': 'franklin' }));
        if (!sheetDataResponse) {
          console.warn(`Invalid sheet Link ${JSON.stringify(sheetDetails[sheetIndex])}.Skipping processing this one.`);
        } else {
          const sheetData = processSheetDataResponse(sheetDataResponse);
          const { background, teamName } = sheetDetails[sheetIndex];
          for (let row = 0; row < sheetData.length; row += 1) {
            try {
              const assetDetails = sheetData[row];
              validateDateFormat(assetDetails['Start Date']);
              validateDateFormat(assetDetails['End Date']);
              const profileImages = assetDetails.LDAP ? assetDetails.LDAP.split(',').map((ldap) => `/is/image/IMGDIR/${ldap.toLowerCase().trim()}`) : [];
              carouselItems.push({
                images: assetDetails['Image URL'] ? [extractMediaFromPath(assetDetails['Image URL'])] : profileImages,
                startDate: assetDetails['Start Date'],
                endDate: assetDetails['End Date'],
                description: assetDetails.Description,
                names: assetDetails.Name.split(',').map((name) => name.trim()),
                heading: assetDetails.Heading,
                title: assetDetails.Title,
                background,
                teamName,
              });
            } catch (err) {
              console.warn(`Error while processing asset ${JSON.stringify(sheetData[row])}`, err);
            }
          }
        }
      } catch (err) {
        errorFlag = true;
        console.warn(`Error while processing sheet ${JSON.stringify(sheetDetails[sheetIndex])}`, err);
      }
    }
    if (carouselItems.length === 0 && errorFlag) {
      // Don't create HTML with no assets when there was an error
      console.log('Skipping HTML generation due to assets length zero along with error occurrence');
      return carouselItems;
    }
    return carouselItems;
  };

  const createContainerFromData = (assets) => {
    const carouselItems = [];
    assets.forEach((asset) => {
      const carouselItem = createDivWithClass('carousel-item');
      carouselItem.setAttribute('start-date', asset.startDate);
      carouselItem.setAttribute('end-date', asset.endDate);

      const heading = createDivWithClass('carousel-item-heading');
      if (asset.heading) {
        if (asset.heading.toLowerCase() !== NO_HEADING.toLowerCase()) {
          heading.innerText = asset.heading;
        }
      } else {
        heading.innerText = DEFAULT_HEADING;
      }

      const innerContainer = createDivWithClass('carousel-item-inner-container');
      const imgContainer = createDivWithClass('carousel-item-images');

      // Create the image(s)
      asset.images.forEach((image, index) => {
        const figure = createDivWithClass('carousel-item-figure');
        const img = createOptimizedPicture(image);

        img.querySelector('img').onerror = (event) => {
          event.target.onerror = null;
          const notFoundImg = createOptimizedPicture('/icons/not-found.png');
          notFoundImg.querySelector('img').style.width = IMAGE_SIZES[asset.images.length - 1];
          notFoundImg.querySelector('img').style.height = IMAGE_SIZES[asset.images.length - 1];

          img.replaceWith(notFoundImg);
        };

        figure.appendChild(img);

        img.querySelector('img').style.width = IMAGE_SIZES[asset.images.length - 1];
        img.querySelector('img').style.height = IMAGE_SIZES[asset.images.length - 1];

        const figureCaption = createDivWithClass('carousel-item-figure-caption');
        figureCaption.innerText = asset.names[index];
        figure.appendChild(figureCaption);

        imgContainer.appendChild(figure);
      });

      if (asset.images.length > 3) {
        innerContainer.classList.add('more-than-three-images');
      }
      innerContainer.appendChild(imgContainer);

      // Create the description
      const descriptionContainer = createDivWithClass('carousel-item-description');
      // title if present
      if (asset.title || asset.teamName) {
        const name = createDivWithClass('title');
        name.innerText = asset.title || asset.teamName;
        descriptionContainer.appendChild(name);
      }
      const descriptionText = createDivWithClass('description-text');
      descriptionText.innerText = asset.description;
      descriptionContainer.appendChild(descriptionText);
      innerContainer.appendChild(descriptionContainer);

      carouselItem.appendChild(asset.background.cloneNode(true));
      carouselItem.appendChild(heading);
      carouselItem.appendChild(innerContainer);
      carouselItems.push(carouselItem);
    });
    return carouselItems;
  };

  const assets = await getCarouselItems();
  return createContainerFromData(assets);
}

async function buildCarouselForDashboard(block) {
  const childDivs = Array.from(block.children);
  const carouselItems = [];
  childDivs?.forEach((div) => {
    const carouselItem = createDivWithClass('carousel-item');
    carouselItem?.classList.add(CAROUSEL_ITEM_DASHBOARDS_CLASS);

    const link = div.querySelector('a');
    const picture = div.querySelector('picture');
    if (link) {
      try {
        // check if link is not for dashboard by /media_ prefix that is added by EDS for media files
        const url = new URL(link.getAttribute('href'));
        if (url.pathname.includes(MEDIA_PREFIX) && url.origin.includes('dx-recognitions')) {
          const videoElement = document.createElement('video');
          videoElement.controls = false;
          videoElement.muted = true;
          videoElement.style.width = '100%';
          videoElement.style.height = '100%';
          videoElement.src = url.pathname;

          carouselItem.appendChild(videoElement);
          carouselItems.push(carouselItem);
        } else {
          const path = link.getAttribute('href');
          const iframe = document.createElement('iframe');
          iframe.src = path;
          carouselItem.appendChild(iframe);
          carouselItems.push(carouselItem);
        }
      } catch (e) {
        console.warn('Error while processing dashboard/video link', e);
      }
    } else if (picture) {
      carouselItem.appendChild(picture.cloneNode(true));
      carouselItems.push(carouselItem);
    }
  });
  itemDuration = DEFAULT_DASHBOARD_ITEM_DURATION;
  if (carouselItems.length === 1) {
    // added this to achieve a preload of next item in case of only 1 item to show
    const firstCarouselItem = carouselItems[0];
    carouselItems.push(firstCarouselItem.cloneNode(true));
  }
  if (carouselItems.length === 0) {
    // if no dashboard or image to show in the carousel
    // then fallback to showing recognitions channel in iframe without any iframe reload
    const carouselItem = createDivWithClass('carousel-item');
    const iframe = document.createElement('iframe');
    const fallbackPath = RECOGNITIONS_MAIN_URL;
    iframe.src = fallbackPath;
    carouselItem.appendChild(iframe);
    carouselItems.push(carouselItem);
    skipIframeReload = true;
  }
  return carouselItems;
}

async function buildUnifiedCarousel() {
  const allItems = [];

  // Get all carousel blocks on the page
  const allCarouselBlocks = document.querySelectorAll('.carousel');
  console.log(`buildUnifiedCarousel: Found ${allCarouselBlocks.length} carousel blocks`);

  // Process all carousel blocks
  const processBlocks = async () => {
    const promises = Array.from(allCarouselBlocks).map(async (carouselBlock, index) => {
      console.log(`Processing carousel block ${index}: ${carouselBlock.className}`);

      if (carouselBlock.classList.contains('recognitions')) {
        console.log('Processing recognitions in unified carousel...');
        const items = await buildCarouselFromSheet(carouselBlock);
        console.log(`Got ${items.length} recognition items`);
        // Add recognitions class to items for styling
        items.forEach((item) => {
          item.classList.add('unified-recognition-item');
        });
        return items;
      }
      if (carouselBlock.classList.contains(DASHBOARDS_BLOCK_NAME)) {
        console.log('Processing dashboards in unified carousel...');
        const items = await buildCarouselForDashboard(carouselBlock);
        console.log(`Got ${items.length} dashboard items`);
        // Add dashboards class to items for styling
        items.forEach((item) => {
          item.classList.add('unified-dashboard-item');
        });
        return items;
      }
      console.log('No matching carousel type found');
      return [];
    });

    const results = await Promise.all(promises);
    const flatResults = results.flat();
    console.log(`Processed blocks returned ${flatResults.length} total items`);
    return flatResults;
  };

  const items = await processBlocks();
  allItems.push(...items);

  // Set unified duration for all items
  itemDuration = UNIFIED_ITEM_DURATION;

  console.log(`Unified carousel created with ${allItems.length} items (${allItems.filter((item) => item.classList.contains('unified-recognition-item')).length} recognitions, ${allItems.filter((item) => item.classList.contains('unified-dashboard-item')).length} dashboards)`);

  return allItems;
}

export default async function decorate(block) {
  const main = document.querySelector('main');
  if (main.querySelector('.carousel-track') === null) {
    const carouselTrack = createDivWithClass('carousel-track');
    main.innerHTML = '';
    main.appendChild(carouselTrack);
  }

  // Check if there are multiple carousel blocks on the page
  const allCarouselBlocks = document.querySelectorAll('.carousel');
  const hasMultipleCarousels = allCarouselBlocks.length > 1;

  console.log(`Carousel processing: ${allCarouselBlocks.length} blocks found, hasMultipleCarousels: ${hasMultipleCarousels}, current block classes: ${block.className}`);

  if (hasMultipleCarousels && block === allCarouselBlocks[0]) {
    // Build unified carousel with all content types
    console.log('Building unified carousel...');
    const items = await buildUnifiedCarousel();
    main.querySelector('.carousel-track').append(...items);
  } else if (!hasMultipleCarousels) {
    // Single carousel - use original logic
    console.log('Building single carousel...');
    if (block.classList.contains('recognitions')) {
      console.log('Processing recognitions carousel...');
      const items = await buildCarouselFromSheet(block);
      main.querySelector('.carousel-track').append(...items);
    } else if (block.classList.contains(DASHBOARDS_BLOCK_NAME)) {
      console.log('Processing dashboards carousel...');
      const items = await buildCarouselForDashboard(block);
      main.querySelector('.carousel-track').append(...items);
    } else {
      console.log('Unexpected block structure found.');
    }
  } else {
    // Skip processing for subsequent carousel blocks to avoid duplication
    console.log('Skipping subsequent carousel block...');
    return;
  }

  const carouselTrack = document.querySelector('.carousel-track');
  const carouselItems = carouselTrack.querySelectorAll('.carousel-item');
  const totalItems = carouselItems.length;
  let currentIndex = -1;

  console.log(`Final carousel setup: ${totalItems} items found`);

  if (totalItems === 0) {
    console.log('No carousel items found, exiting...');
    return;
  }

  function isActive(itemIndex) {
    const item = carouselItems[itemIndex];
    const startDate = parseStartDateString(item.getAttribute('start-date'));
    const endDate = parseEndDateString(item.getAttribute('end-date'));
    const now = new Date();
    if (now >= startDate && now <= endDate) {
      return true;
    }
    return false;
  }

  function getNextItemIndex(itemIndex) {
    return (itemIndex + 1) % totalItems;
  }

  function reloadIframe(iframe) {
    if (skipIframeReload) {
      return;
    }
    if (iframe && iframe.src) {
      const currentSrc = iframe.src;
      iframe.src = currentSrc; // reassigning src will reload iframe
    }
  }

  function reloadSlide(itemIndex) {
    function getIframeInSlide(index) {
      if (index < 0 || index >= totalItems) {
        return null;
      }
      const currentItem = carouselItems[index];
      return currentItem?.querySelector('iframe');
    }

    const iframeInSlide = getIframeInSlide(itemIndex);
    reloadIframe(iframeInSlide);
  }

  function showSlide(itemIndex) {
    if (itemIndex < 0 || itemIndex >= totalItems) {
      return;
    }

    const itemWidth = carouselItems[0].offsetWidth;
    const translateX = -itemIndex * itemWidth;
    carouselTrack.style.transform = `translateX(${translateX}px)`;
  }

  function preloadNextSlide(itemIndex) {
    const nextItemIndex = getNextItemIndex(itemIndex);
    reloadSlide(nextItemIndex);
  }

  function isCurrentSlideIsVideo() {
    return carouselItems[currentIndex].querySelector('video') !== null;
  }

  function nextSlide() {
    // Stop the previous carousels
    TIMEOUTS.clearAllTimeouts();
    currentIndex = getNextItemIndex(currentIndex);
    if (!isActive(currentIndex)) {
      nextSlide();
    } else {
      preloadNextSlide(currentIndex);
      showSlide(currentIndex);
      if (isCurrentSlideIsVideo()) {
        // call nextSlide when video ends or ends with error
        const video = carouselItems[currentIndex].querySelector('video');
        video.play();
        video.onended = nextSlide;
        video.onerror = nextSlide;
      } else {
        TIMEOUTS.setTimeout(nextSlide, itemDuration);
      }
    }
  }

  // Start the carousel
  nextSlide();
}
