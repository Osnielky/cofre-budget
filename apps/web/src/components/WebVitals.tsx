'use client';

import { useReportWebVitals } from 'next/web-vitals';

/** Sends each Core Web Vital for the current page to /report-vitals. */
export default function WebVitals() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating, page: window.location.pathname });
    if (!navigator.sendBeacon?.('/report-vitals', body)) {
      fetch('/report-vitals', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  });
  return null;
}
