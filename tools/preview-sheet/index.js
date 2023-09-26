const fetchData = async (url, option = {}) => {
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


const previewAndCacheClear = async (owner, repo, ref, path) => {
  let response;
  const options = {
    method: 'POST',
  };

  response = await fetch(`https://admin.hlx.page/preview/${owner}/${repo}/${ref}/${path}`, options);

  if (response.ok) {
    console.log(`Document Previewed at ${new Date().toLocaleString()}`);
  } else {
    throw new Error(`Could not previewed. Status: ${response.status}`);
  }


  response = await fetch(`https://admin.hlx.page/cache/${owner}/${repo}/${ref}/${path}`, options);

  if (response.ok) {
    console.log(`Purge cache ${new Date().toLocaleString()}`);
  } else {
    throw new Error(`Could not purge cache. Status: ${response.status}`);
  }
}

const previewAndRedirect = async () => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const repo = params.get("repo");
  const owner = params.get("owner");
  const referrer = params.get("referrer");
  const previewHost = `https://${ref}--${repo}--${owner}.hlx.page`;
  const statusUrl = `https://admin.hlx.page/status/${owner}/${repo}/${ref}?editUrl=${referrer}`;
  console.log('location is ' + window.location.href);
  console.log("previewHost = " + previewHost);
  console.log("statusUrl = " + statusUrl);
  const status = JSON.parse(await fetchData(statusUrl));
  console.log("status is " + JSON.stringify(status));
  if(status.preview && status.preview.url) {
      console.log("status.preview.url = " + status.preview.url);
  } else {
      console.log("preview URL no present");
  }


  const previewUrl = status.preview.url;
  const url = new URL(previewUrl);
  const sheetPath = url.pathname;
  console.log("sheetPath is " + sheetPath);
  const pagePath = `${sheetPath.slice(0, -17)}main`;//remove .json
  await previewAndCacheClear(owner, repo, ref, sheetPath);
  await previewAndCacheClear(owner, repo, ref, pagePath);
  window.location.replace(pagePath);
}

previewAndRedirect();

