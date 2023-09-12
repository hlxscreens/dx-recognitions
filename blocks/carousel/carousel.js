import {
  parseStartDateString,
  parseEndDateString,
  validateDateFormat,
  createDivWithClass,
} from './utils.js';

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

async function buildCarouselFromSheet(block) {
  const fetchData = async (url) => {
    let result = '';
    try {
      result = fetch(url)
        .then((response) => {
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
        sheetDetails.push({
          link: linkUrl,
          background,
        });
      } catch (err) {
        console.warn(`Exception while processing row ${i}`, err);
      }
    }
    return sheetDetails;
  };

  const processSheetDataResponse = (sheetDataResponse) => {
    if (sheetDataResponse[':type'] === 'sheet') {
      return sheetDataResponse.data;
    }
    throw new Error(`Invalid sheet type: ${sheetDataResponse[':type']}`);
  };

  const getAssets = async () => {
    const sheetDetails = extractSheetData() || [];
    console.log(JSON.stringify(sheetDetails));
    if (sheetDetails.length === 0) {
      console.warn('No sheet data available during HTML generation');
    }
    const assets = [];
    let errorFlag = false;
    for (let sheetIndex = 0; sheetIndex < sheetDetails.length; sheetIndex += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const sheetDataResponse = JSON.parse(await fetchData(sheetDetails[sheetIndex].link));
        if (!sheetDataResponse) {
          console.warn(`Invalid sheet Link ${JSON.stringify(sheetDetails[sheetIndex])}.Skipping processing this one.`);
        } else {
          const sheetData = processSheetDataResponse(sheetDataResponse);
          const { background } = sheetDetails[sheetIndex];
          for (let row = 0; row < sheetData.length; row += 1) {
            try {
              const assetDetails = sheetData[row];
              if (!assetDetails['Image URL']) {
                assetDetails['Image URL'] = `https://s7d2.scene7.com/is/image/IMGDIR/${assetDetails.LDAP}`;
              }
              validateDateFormat(assetDetails['Start Date']);
              validateDateFormat(assetDetails['End Date']);
              assets.push({
                link: assetDetails['Image URL'],
                startDate: assetDetails['Start Date'],
                endDate: assetDetails['End Date'],
                description: assetDetails.Description,
                ldap: assetDetails.LDAP,
                background,
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
    if (assets.length === 0 && errorFlag) {
      // Don't create HTML with no assets when there was an error
      console.log('Skipping HTML generation due to assets length zero along with error occurrence');
      return assets;
    }
    return assets;
  };

  const createContainerFromData = (assets) => {
    const carouselItems = [];
    assets.forEach((asset) => {
      const carouselItem = createDivWithClass('carousel-item');
      carouselItem.setAttribute('start-date', asset.startDate);
      carouselItem.setAttribute('end-date', asset.endDate);
      const img = document.createElement('img');
      img.src = asset.link;
      const imgCaption = document.createElement('figcaption');
      imgCaption.innerText = asset.ldap;

      const imgContainer = createDivWithClass('carousel-item-figure');
      imgContainer.appendChild(img);
      imgContainer.appendChild(imgCaption);
      const descriptionContainer = createDivWithClass('carousel-item-description');
      descriptionContainer.appendChild(document.createTextNode(asset.description));
      const congratulationText = createDivWithClass('carousel-item-congratulation');
      congratulationText.innerText = 'Congratulations';
      carouselItem.appendChild(congratulationText);
      carouselItem.appendChild(imgContainer);
      carouselItem.appendChild(descriptionContainer);
      carouselItem.appendChild(asset.background.cloneNode(true));
      carouselItems.push(carouselItem);
    });
    return carouselItems;
  };

  const assets = await getAssets();
  return createContainerFromData(assets);
}

export default async function decorate(block) {
  const main = document.querySelector('main');
  if (main.querySelector('.carousel-track') === null) {
    const carouselTrack = createDivWithClass('carousel-track');
    main.innerHTML = '';
    main.appendChild(carouselTrack);
  }

  const items = await buildCarouselFromSheet(block);
  main.querySelector('.carousel-track').append(...items);

  const carouselTrack = document.querySelector('.carousel-track');
  const carouselItems = carouselTrack.querySelectorAll('.carousel-item');
  const totalItems = carouselItems.length;
  let currentIndex = -1;
  const DEFAULT_ITEM_DURATION = 10 * 1000;

  if (totalItems === 0) {
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

  function showSlide(itemIndex) {
    if (itemIndex < 0 || itemIndex >= totalItems) {
      return;
    }

    const itemWidth = carouselItems[0].offsetWidth;
    const translateX = -itemIndex * itemWidth;
    carouselTrack.style.transform = `translateX(${translateX}px)`;
    currentIndex = itemIndex;
  }

  function nextSlide() {
    const newIndex = (currentIndex + 1) % totalItems;
    if (!isActive(newIndex)) {
      nextSlide();
    }
    showSlide(newIndex);
    TIMEOUTS.setTimeout(nextSlide, DEFAULT_ITEM_DURATION);
  }

  // Stop the previous carousels
  TIMEOUTS.clearAllTimeouts();
  // Start the carousel
  nextSlide();
}
