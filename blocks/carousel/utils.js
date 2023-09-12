export function validateDateFormat(date) {
  if (!date) {
    return;
  }
  const dateFormatRegex = /^(0?[1-9]|[1-2][0-9]|3[0-1])\/(0?[1-9]|1[0-2])\/([0-9]{4})$/;
  if (!dateFormatRegex.test(date)) {
    throw new Error(`Invalid date format: ${date}`);
  }
}

export function parseDateString(dateString) {
  const dateParts = dateString.split('/');
  const day = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const year = parseInt(dateParts[2], 10);
  return new Date(year, month, day);
}

export function parseStartDateString(dateString) {
  if (!dateString) {
    return new Date();
  }
  return parseDateString(dateString);
}

export function parseEndDateString(dateString) {
  if (!dateString) {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 10);
    return date;
  }
  return parseDateString(dateString);
}

export function createDivWithClass(className) {
  const div = document.createElement('div');
  div.className = className;
  return div;
}
