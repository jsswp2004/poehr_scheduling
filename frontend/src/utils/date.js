// src/utils/date.js
export function toLocalDatetimeString(dateObj) {
    const local = new Date(dateObj);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 16);
  }
  